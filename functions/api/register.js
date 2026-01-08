import { createPublicClient, createWalletClient, http, isHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygonAmoy } from "viem/chains";

/**
 * Proofy /api/register (Amoy)
 *
 * Juridiskt krav (revision):
 * - Får ALDRIG påstå "Bekräftad" utan att det kan styrkas via bekräftad notering (get + timestamp).
 * - Om ingen bekräftelse finns: ska uttryckligen anges som "Ej bekräftad".
 * - Vid tekniskt fel: ska anges som "Kunde inte kontrolleras" (inte ett negativt påstående).
 *
 * Tekniskt krav:
 * - Register, Verify och Certificate ska använda samma statusmodell:
 *   CONFIRMED / NOT_CONFIRMED / UNKNOWN
 *
 * Driftkrav:
 * - Skickar in och returnerar direkt (ingen wait → mindre timeout-risk).
 * - Idempotent via registerIfMissing.
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

function isValidBytes32Hex(value) {
  return (
    typeof value === "string" &&
    value.startsWith("0x") &&
    value.length === 66 &&
    isHex(value)
  );
}

function isValidAddressHex(addr) {
  return (
    typeof addr === "string" &&
    addr.startsWith("0x") &&
    addr.length === 42 &&
    isHex(addr)
  );
}

function normalizePrivateKey(pk) {
  if (typeof pk !== "string") return "";
  const trimmed = pk.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
}

function isValidPrivateKeyHex(pk) {
  return (
    typeof pk === "string" &&
    pk.startsWith("0x") &&
    pk.length === 66 &&
    isHex(pk)
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
    (e && typeof e === "object" && "shortMessage" in e && e.shortMessage) ||
    (e && typeof e === "object" && "message" in e && e.message) ||
    String(e);
  return String(msg).slice(0, 600);
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

  // Evidence: observed block number at time of check (optional, for audit traceability)
  const observedBlockNumber = await publicClient.getBlockNumber();

  return { exists, timestamp, observedBlockNumber: observedBlockNumber.toString() };
}

function gweiToWeiBigInt(gwei) {
  const s = String(gwei);
  const [i, d = ""] = s.split(".");
  const int = BigInt(i || "0");
  const dec = BigInt((d + "000000000").slice(0, 9));
  return int * 10n ** 9n + dec;
}

/**
 * Gemensam statusmodell (Register/Verify/Certificate):
 *
 * statusCode:
 * - CONFIRMED: bekräftad notering finns
 * - NOT_CONFIRMED: ingen bekräftad notering vid kontrolltillfället
 * - UNKNOWN: kunde inte kontrolleras (tekniskt fel)
 *
 * Viktigt:
 * - Endast CONFIRMED får visas som "Bekräftad" och får bära tidpunkt.
 * - "Inskickad" är processinfo och ska inte vara egen bevisstatuskod.
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
      "Det finns en bekräftad notering för detta underlagsavtryck. Uppgifterna ovan kan kontrolleras mot offentlig verifieringskälla.",
  };
}

function statusNotConfirmed({ hash, observedBlockNumber, submission = null, legalText }) {
  return {
    ok: true,
    statusCode: "NOT_CONFIRMED",
    statusText: "Ej bekräftad",
    hash,
    confirmedAtUnix: null,
    evidence: observedBlockNumber ? { observedBlockNumber } : null,
    submission,
    legalText:
      legalText ||
      "Ingen bekräftad notering kunde konstateras vid kontrolltillfället. Detta är inte ett påstående om framtida bekräftelse.",
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

export async function onRequest({ request, env }) {
  const origin = request.headers.get("Origin") || "";

  if (request.method === "OPTIONS") {
    return corsPreflight(origin || "*");
  }
  if (request.method !== "POST") {
    return json(405, { ok: false, error: "Method Not Allowed" }, origin);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, error: "Invalid JSON body", statusCode: "BAD_REQUEST" }, origin);
  }

  const hash = String(body?.hash || "").trim();
  if (!isValidBytes32Hex(hash)) {
    return json(
      400,
      { ok: false, error: "Invalid hash format", statusCode: "BAD_REQUEST" },
      origin
    );
  }

  const rpcUrl = String(env.AMOY_RPC_URL || "").trim();
  const contractAddress = String(env.PROOFY_CONTRACT_ADDRESS || "").trim();
  const privateKey = normalizePrivateKey(env.PROOFY_PRIVATE_KEY);

  if (!rpcUrl || !contractAddress || !privateKey) {
    return json(500, { ok: false, error: "Server misconfiguration" }, origin);
  }
  if (!isValidAddressHex(contractAddress)) {
    return json(500, { ok: false, error: "Server misconfiguration (bad contract address)" }, origin);
  }
  if (!isValidPrivateKeyHex(privateKey)) {
    return json(500, { ok: false, error: "Server misconfiguration (bad private key)" }, origin);
  }

  // Driftstyrning (gas caps)
  const maxFeeGwei = env.MAX_FEE_GWEI ?? 300;
  const maxPriorityFeeGwei = env.MAX_PRIORITY_FEE_GWEI ?? 5;

  const maxFeePerGas = gweiToWeiBigInt(maxFeeGwei);
  const maxPriorityFeePerGas = gweiToWeiBigInt(maxPriorityFeeGwei);

  try {
    const transport = http(rpcUrl);

    const publicClient = createPublicClient({
      chain: polygonAmoy,
      transport,
    });

    // 1) Först: finns bekräftad notering?
    const pre = await readGetWithEvidence({ publicClient, contractAddress, hash });
    if (pre.exists) {
      return json(200, statusConfirmed({ hash, timestamp: pre.timestamp, observedBlockNumber: pre.observedBlockNumber }), origin);
    }

    // 2) Ingen bekräftelse -> skicka in registrering (ingen väntan på bekräftelse)
    const account = privateKeyToAccount(privateKey);
    const walletClient = createWalletClient({
      account,
      chain: polygonAmoy,
      transport,
    });

    const sim = await publicClient.simulateContract({
      account,
      address: contractAddress,
      abi: PROOFY_ABI,
      functionName: "registerIfMissing",
      args: [hash],
    });

    const txHash = await walletClient.writeContract({
      ...sim.request,
      maxFeePerGas,
      maxPriorityFeePerGas,
    });

    // 3) Viktigt: fortfarande EJ bekräftad (men vi kan bifoga submission som processinfo)
    return json(
      200,
      statusNotConfirmed({
        hash,
        observedBlockNumber: pre.observedBlockNumber,
        submission: {
          txHash,
          submittedBy: account.address,
        },
        legalText:
          "En registrering har skickats in men är ännu inte bekräftad. Ingen slutsats om bekräftelse kan dras innan status är 'Bekräftad'.",
      }),
      origin
    );
  } catch (e) {
    return json(503, statusUnknown({ hash, detail: sanitizeError(e) }), origin);
  }
}
