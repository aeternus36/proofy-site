import {
  createPublicClient,
  createWalletClient,
  http,
  isHex,
  parseGwei,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygonAmoy } from "viem/chains";

/**
 * Proofy /api/register (Amoy)
 *
 * Juridiskt krav:
 * - Får ALDRIG påstå "Bekräftad" utan att det kan styrkas via bekräftad notering (get() => ok + ts).
 * - Vid inskickad men obekräftad: ska uttryckligen anges som "Ej bekräftad" och att tx är inskickad.
 * - Register/Verify/Certificate ska använda samma statusmodell.
 *
 * Driftkrav:
 * - Returnerar snabbt (ingen lång wait som riskerar timeout).
 * - Robust mot "pending fastnar": speed-up med samma nonce + högre fee.
 * - Idempotent: registerIfMissing.
 */

const PROOFY_ABI = [
  {
    type: "function",
    name: "get",
    stateMutability: "view",
    inputs: [{ name: "refId", type: "bytes32" }],
    outputs: [
      { name: "ok", type: "bool" },
      { name: "ts", type: "uint64" },
    ],
  },
  {
    type: "function",
    name: "registerIfMissing",
    stateMutability: "nonpayable",
    inputs: [{ name: "refId", type: "bytes32" }],
    outputs: [
      { name: "created", type: "bool" },
      { name: "ts", type: "uint64" },
    ],
  },
];

function json(status, obj, origin) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    Vary: "Origin",
    "X-Content-Type-Options": "nosniff",
  };
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  return new Response(JSON.stringify(obj), { status, headers });
}

function corsPreflight(origin) {
  return new Response(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": origin || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    },
  });
}

function isValidBytes32Hex(s) {
  return (
    typeof s === "string" &&
    /^0x[0-9a-fA-F]{64}$/.test(s.trim()) &&
    isHex(s.trim())
  );
}

function isValidAddressHex(addr) {
  return (
    typeof addr === "string" &&
    /^0x[0-9a-fA-F]{40}$/.test(addr.trim()) &&
    isHex(addr.trim())
  );
}

function normalizePrivateKey(pk) {
  if (typeof pk !== "string") return "";
  const t = pk.trim();
  if (!t) return "";
  return t.startsWith("0x") ? t : `0x${t}`;
}

function isValidPrivateKeyHex(pk) {
  return (
    typeof pk === "string" &&
    /^0x[0-9a-fA-F]{64}$/.test(pk.trim()) &&
    isHex(pk.trim())
  );
}

function toSafeUint64(ts) {
  const v = BigInt(ts ?? 0n);
  if (v <= 0n) return 0;
  const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
  return v <= maxSafe ? Number(v) : Number(maxSafe);
}

function sanitizeError(e) {
  const msg =
    (e && typeof e === "object" && (e.shortMessage || e.message)) ||
    String(e);
  return String(msg).slice(0, 800);
}

/**
 * Gemensam statusmodell
 *
 * statusCode:
 * - CONFIRMED: bekräftad notering finns (get() => ok + ts)
 * - NOT_CONFIRMED: ingen bekräftad notering vid kontrolltillfället
 * - UNKNOWN: kunde inte kontrolleras (tekniskt fel)
 */
function statusConfirmed({ hash, timestamp, observedBlockNumber }) {
  return {
    ok: true,
    statusCode: "CONFIRMED",
    statusText: "Bekräftad",
    hash,
    confirmedAtUnix: timestamp,
    evidence: { observedBlockNumber },
    submission: null,
    legalText:
      "Det finns en bekräftad notering för detta kontrollvärde vid kontrolltillfället. Uppgifterna kan kontrolleras mot extern verifieringskälla vid behov.",
  };
}

function statusNotConfirmed({ hash, observedBlockNumber, submission }) {
  const hasTx = Boolean(submission?.txHash);
  return {
    ok: true,
    statusCode: "NOT_CONFIRMED",
    statusText: "Ej bekräftad",
    hash,
    confirmedAtUnix: null,
    evidence: observedBlockNumber ? { observedBlockNumber } : null,
    submission: hasTx
      ? {
          txHash: submission.txHash,
          submittedBy: submission.submittedBy || null,
          ...(submission.replacedTxHash
            ? { replacedTxHash: submission.replacedTxHash }
            : {}),
        }
      : null,
    legalText: hasTx
      ? "En registrering har skickats in men är ännu inte bekräftad. Ingen slutsats om bekräftelse kan dras innan status är 'Bekräftad'."
      : "Ingen bekräftad notering kunde konstateras vid kontrolltillfället. Detta är inte ett påstående om framtida bekräftelse.",
  };
}

function statusUnknown({ hash, detail }) {
  return {
    ok: false,
    statusCode: "UNKNOWN",
    statusText: "Kunde inte kontrolleras",
    hash: hash || null,
    confirmedAtUnix: null,
    evidence: null,
    submission: null,
    error: "Register temporarily unavailable",
    detail,
    legalText:
      "Status kunde inte kontrolleras på grund av tekniskt fel. Ingen slutsats kan dras utifrån detta svar.",
  };
}

async function readGetWithEvidence({ publicClient, contractAddress, hash }) {
  const [ok, ts] = await publicClient.readContract({
    address: contractAddress,
    abi: PROOFY_ABI,
    functionName: "get",
    args: [hash],
  });

  const timestamp = toSafeUint64(ts);
  const exists = Boolean(ok) && timestamp !== 0;

  const observedBlockNumber = await publicClient.getBlockNumber();
  return { exists, timestamp, observedBlockNumber: observedBlockNumber.toString() };
}

/**
 * Skicka tx robust:
 * - nonce från "pending"
 * - fee från nätet men med golv (Amoy kan annars fastna)
 * - kort wait på receipt
 * - om fortfarande pending: speedup (samma nonce, högre fee) -> ny txHash
 *
 * Vi väntar INTE på finalitet (för att undvika timeouts), men vi minskar "fastnar"-risken kraftigt.
 */
async function sendWithSpeedUp({
  publicClient,
  walletClient,
  contractAddress,
  hash,
  feeFloorMaxGwei = "40",
  feeFloorPrioGwei = "2",
  firstWaitMs = 12000,
}) {
  const account = walletClient.account;

  const sim = await publicClient.simulateContract({
    account,
    address: contractAddress,
    abi: PROOFY_ABI,
    functionName: "registerIfMissing",
    args: [hash],
  });

  const nonce = await publicClient.getTransactionCount({
    address: account.address,
    blockTag: "pending",
  });

  const estimated = await publicClient.estimateFeesPerGas().catch(() => ({}));

  const floorMax = parseGwei(String(feeFloorMaxGwei));
  const floorPrio = parseGwei(String(feeFloorPrioGwei));

  let maxFeePerGas =
    estimated?.maxFeePerGas && estimated.maxFeePerGas > floorMax
      ? estimated.maxFeePerGas
      : floorMax;

  let maxPriorityFeePerGas =
    estimated?.maxPriorityFeePerGas && estimated.maxPriorityFeePerGas > floorPrio
      ? estimated.maxPriorityFeePerGas
      : floorPrio;

  // 1) första sändning
  const txHash1 = await walletClient.writeContract({
    ...sim.request,
    nonce,
    maxFeePerGas,
    maxPriorityFeePerGas,
  });

  // kort wait för att se om den råkar hinna få receipt direkt
  const start = Date.now();
  while (Date.now() - start < firstWaitMs) {
    const r = await publicClient
      .getTransactionReceipt({ hash: txHash1 })
      .catch(() => null);
    if (r) return { txHash: txHash1, replaced: false };
    await new Promise((r) => setTimeout(r, 1200));
  }

  // 2) fortfarande pending => speed-up (same nonce)
  maxFeePerGas = maxFeePerGas + maxFeePerGas / 5n; // +20%
  maxPriorityFeePerGas =
    maxPriorityFeePerGas + maxPriorityFeePerGas / 2n; // +50%

  const txHash2 = await walletClient.writeContract({
    ...sim.request,
    nonce,
    maxFeePerGas,
    maxPriorityFeePerGas,
  });

  return { txHash: txHash2, replaced: true, replacedTxHash: txHash1 };
}

export async function onRequest({ request, env }) {
  const origin = request.headers.get("Origin") || "";

  if (request.method === "OPTIONS") return corsPreflight(origin || "*");
  if (request.method !== "POST")
    return json(405, { ok: false, error: "Method Not Allowed" }, origin);

  const body = await request.json().catch(() => ({}));
  const hash = String(body?.hash || "").trim();

  if (!isValidBytes32Hex(hash))
    return json(400, { ok: false, error: "Invalid hash format" }, origin);

  const rpcUrl = String(env.AMOY_RPC_URL || "").trim();
  const contractAddress = String(env.PROOFY_CONTRACT_ADDRESS || "").trim();
  const privateKey = normalizePrivateKey(env.PROOFY_PRIVATE_KEY);

  if (!rpcUrl || !contractAddress || !privateKey)
    return json(500, { ok: false, error: "Server misconfiguration" }, origin);

  if (!isValidAddressHex(contractAddress))
    return json(500, { ok: false, error: "Bad contract address" }, origin);

  if (!isValidPrivateKeyHex(privateKey))
    return json(500, { ok: false, error: "Bad private key" }, origin);

  try {
    const transport = http(rpcUrl);
    const publicClient = createPublicClient({ chain: polygonAmoy, transport });

    // 1) Läsning först: redan bekräftad?
    const pre = await readGetWithEvidence({
      publicClient,
      contractAddress,
      hash,
    });

    if (pre.exists) {
      return json(200, statusConfirmed({ hash, ...pre }), origin);
    }

    // 2) Skicka tx via server-wallet
    const account = privateKeyToAccount(privateKey);
    const walletClient = createWalletClient({
      account,
      chain: polygonAmoy,
      transport,
    });

    // Avgiftsgolv kan styras via env om du vill (bra för drift)
    const feeFloorMaxGwei = String(env.FEE_FLOOR_MAX_GWEI || "40");
    const feeFloorPrioGwei = String(env.FEE_FLOOR_PRIO_GWEI || "2");
    const firstWaitMs = Number(env.FIRST_WAIT_MS || 12000);

    const sent = await sendWithSpeedUp({
      publicClient,
      walletClient,
      contractAddress,
      hash,
      feeFloorMaxGwei,
      feeFloorPrioGwei,
      firstWaitMs,
    });

    // 3) Juridiskt korrekt: fortfarande ej bekräftad tills get() visar ok+ts
    return json(
      200,
      statusNotConfirmed({
        hash,
        observedBlockNumber: pre.observedBlockNumber,
        submission: {
          txHash: sent.txHash,
          submittedBy: account.address,
          ...(sent.replaced ? { replacedTxHash: sent.replacedTxHash } : {}),
        },
      }),
      origin
    );
  } catch (e) {
    return json(503, statusUnknown({ hash, detail: sanitizeError(e) }), origin);
  }
}
