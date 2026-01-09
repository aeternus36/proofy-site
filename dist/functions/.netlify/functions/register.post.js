import {
  createPublicClient,
  createWalletClient,
  http,
  isHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygonAmoy } from "viem/chains";

// ABI för notering + register
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

// Standard JSON-response
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

function sanitizeError(e) {
  const msg =
    (e && typeof e === "object" && (e.shortMessage || e.message)) ||
    String(e);
  return String(msg).slice(0, 800);
}

function gweiToWeiBigInt(gwei) {
  const s = String(gwei);
  const [i, d = ""] = s.split(".");
  const int = BigInt(i || "0");
  const dec = BigInt((d + "000000000").slice(0, 9));
  return int * 10n ** 9n + dec;
}

function weiToGweiNumber(wei) {
  try {
    return Number(wei) / 1e9;
  } catch {
    return null;
  }
}

/**
 * EIP-1559 fee-valsfunktion med debug-fält.
 */
async function pickFeesForDebug(publicClient, env) {
  const capGwei = Number(env.MAX_FEE_GWEI ?? 600); // tak för maxFee
  const tipCapGwei = Number(env.MAX_PRIORITY_FEE_GWEI ?? 20); // tak för priority
  const minTipGwei = Number(env.MIN_PRIORITY_FEE_GWEI ?? 1); // min priority

  const capWei = gweiToWeiBigInt(capGwei);
  const tipCapWei = gweiToWeiBigInt(tipCapGwei);
  const minTipWei = gweiToWeiBigInt(minTipGwei);

  let suggestedMaxFee = null;
  let suggestedPriority = null;
  let estimateError = null;

  try {
    const estimate = await publicClient.estimateFeesPerGas();
    suggestedMaxFee = estimate?.maxFeePerGas ?? null;
    suggestedPriority = estimate?.maxPriorityFeePerGas ?? null;
  } catch (err) {
    estimateError = String(err?.message || err);
  }

  // fallback
  let maxFeePerGas =
    suggestedMaxFee && suggestedMaxFee > 0n ? suggestedMaxFee : capWei;
  let maxPriorityFeePerGas =
    suggestedPriority && suggestedPriority > 0n
      ? suggestedPriority
      : gweiToWeiBigInt(minTipGwei);

  if (maxFeePerGas > capWei) maxFeePerGas = capWei;
  if (maxPriorityFeePerGas > tipCapWei) maxPriorityFeePerGas = tipCapWei;
  if (maxPriorityFeePerGas < minTipWei) maxPriorityFeePerGas = minTipWei;
  if (maxPriorityFeePerGas > maxFeePerGas) maxPriorityFeePerGas = maxFeePerGas;

  return {
    picked: {
      maxFeePerGas: weiToGweiNumber(maxFeePerGas),
      maxPriorityFeePerGas: weiToGweiNumber(maxPriorityFeePerGas),
      capGwei,
      tipCapGwei,
      minTipGwei,
    },
    estimate: {
      maxFeePerGas: suggestedMaxFee ? weiToGweiNumber(suggestedMaxFee) : null,
      maxPriorityFeePerGas: suggestedPriority
        ? weiToGweiNumber(suggestedPriority)
        : null,
      error: estimateError,
    },
    raw: { maxFeePerGas, maxPriorityFeePerGas },
  };
}

export async function onRequest({ request, env }) {
  const origin = request.headers.get("Origin") || "";

  // OPTIONS preflight
  if (request.method === "OPTIONS") return corsPreflight(origin || "*");

  // Detta är POST-only fil. Men om Cloudflare ändå skickar annat hit:
  if (request.method !== "POST") {
    return json(405, { ok: false, error: "Method Not Allowed" }, origin);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, error: "Invalid JSON body" }, origin);
  }

  const hash = String(body?.hash || "").trim();
  if (!isValidBytes32Hex(hash)) {
    return json(400, { ok: false, error: "Invalid hash format" }, origin);
  }

  const rpcUrl = String(env.AMOY_RPC_URL || "").trim();
  const contractAddress = String(env.PROOFY_CONTRACT_ADDRESS || "").trim();
  const privateKey = normalizePrivateKey(env.PROOFY_PRIVATE_KEY);

  if (!rpcUrl || !contractAddress || !privateKey) {
    return json(500, { ok: false, error: "Server misconfiguration" }, origin);
  }

  if (!isValidAddressHex(contractAddress)) {
    return json(500, { ok: false, error: "Bad contract address" }, origin);
  }

  if (!isValidPrivateKeyHex(privateKey)) {
    return json(500, { ok: false, error: "Bad private key" }, origin);
  }

  try {
    const transport = http(rpcUrl, { timeout: 20_000 });

    const publicClient = createPublicClient({
      chain: polygonAmoy,
      transport,
    });

    // kontrollera om redan bekräftad
    let existsBefore = false;
    let beforeTs = null;
    try {
      const [ok, ts] = await publicClient.readContract({
        address: contractAddress,
        abi: PROOFY_ABI,
        functionName: "get",
        args: [hash],
      });
      existsBefore = Boolean(ok) && Number(ts) !== 0;
      beforeTs = Number(ts);
    } catch {
      // ignore read failures here; will fall through to register attempt
    }

    if (existsBefore) {
      return json(
        200,
        {
          ok: true,
          statusCode: "CONFIRMED",
          statusText: "Bekräftad (fanns redan)",
          hash,
          confirmedAtUnix: beforeTs,
          evidence: null,
          submission: null,
          legalText: "Fanns redan bekräftad notering.",
        },
        origin
      );
    }

    // Välj valid gas & debug info
    const fees = await pickFeesForDebug(publicClient, env);

    // skapa signer
    const account = privateKeyToAccount(privateKey);
    const walletClient = createWalletClient({
      account,
      chain: polygonAmoy,
      transport,
    });

    // simulera skrivning
    const sim = await publicClient.simulateContract({
      account,
      address: contractAddress,
      abi: PROOFY_ABI,
      functionName: "registerIfMissing",
      args: [hash],
    });

    // skriv kontrakt
    const txHash = await walletClient.writeContract({
      ...sim.request,
      maxFeePerGas: gweiToWeiBigInt(fees.picked.maxFeePerGas),
      maxPriorityFeePerGas: gweiToWeiBigInt(fees.picked.maxPriorityFeePerGas),
    });

    return json(
      200,
      {
        ok: true,
        statusCode: "NOT_CONFIRMED",
        statusText: "Ej bekräftad",
        hash,
        confirmedAtUnix: null,
        evidence: null,
        submission: { txHash, submittedBy: account.address },
        legalText:
          "En registrering har skickats in men är ännu inte bekräftad.",
        debug: {
          fees,
          contractAddress,
        },
      },
      origin
    );
  } catch (e) {
    return json(
      503,
      {
        ok: false,
        statusCode: "UNKNOWN",
        statusText: "Kunde inte kontrolleras",
        hash: hash || null,
        confirmedAtUnix: null,
        evidence: null,
        submission: null,
        error: "Register temporarily unavailable",
        detail: sanitizeError(e),
      },
      origin
    );
  }
}
