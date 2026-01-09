import {
  createPublicClient,
  createWalletClient,
  http,
  isHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygonAmoy } from "viem/chains";

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
      { name: "ts", type: "uint64" }],
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
 * Välj fees med debug-loggning.
 */
async function pickFeesWithDebug(publicClient, env) {
  const capGwei = Number(env.MAX_FEE_GWEI ?? 300);
  const tipCapGwei = Number(env.MAX_PRIORITY_FEE_GWEI ?? 5);
  const minTipGwei = Number(env.MIN_PRIORITY_FEE_GWEI ?? 1);

  const capWei = gweiToWeiBigInt(capGwei);
  const tipCapWei = gweiToWeiBigInt(tipCapGwei);
  const minTipWei = gweiToWeiBigInt(minTipGwei);

  let suggestedMaxFee = null;
  let suggestedPriority = null;
  try {
    const estimate = await publicClient.estimateFeesPerGas();
    suggestedMaxFee = estimate?.maxFeePerGas ?? null;
    suggestedPriority = estimate?.maxPriorityFeePerGas ?? null;

    console.log(
      `FEE ESTIMATE RPC: maxFeePerGas=${weiToGweiNumber(
        suggestedMaxFee
      )} gwei, maxPriorityFeePerGas=${weiToGweiNumber(
        suggestedPriority
      )} gwei`
    );
  } catch (err) {
    console.log("FEE ESTIMATE ERROR:", err);
  }

  let maxFeePerGas =
    suggestedMaxFee && suggestedMaxFee > 0n ? suggestedMaxFee : capWei;
  let maxPriorityFeePerGas =
    suggestedPriority && suggestedPriority > 0n
      ? suggestedPriority
      : gweiToWeiBigInt(2);

  if (maxFeePerGas > capWei) maxFeePerGas = capWei;
  if (maxPriorityFeePerGas > tipCapWei)
    maxPriorityFeePerGas = tipCapWei;

  if (maxPriorityFeePerGas < minTipWei)
    maxPriorityFeePerGas = minTipWei;

  if (maxPriorityFeePerGas > maxFeePerGas)
    maxPriorityFeePerGas = maxFeePerGas;

  console.log(
    `PICKED FEES -> maxFeePerGas=${weiToGweiNumber(
      maxFeePerGas
    )} gwei, maxPriorityFeePerGas=${weiToGweiNumber(
      maxPriorityFeePerGas
    )} gwei (capGwei=${capGwei}, tipCapGwei=${tipCapGwei})`
  );

  return { maxFeePerGas, maxPriorityFeePerGas };
}

export async function onRequest({ request, env }) {
  const origin = request.headers.get("Origin") || "";
  if (request.method === "OPTIONS")
    return corsPreflight(origin || "*");
  if (request.method !== "POST")
    return json(405, { ok: false, error: "Method Not Allowed" }, origin);

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, error: "Invalid JSON body" }, origin);
  }

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

    const publicClient = createPublicClient({
      chain: polygonAmoy,
      transport,
    });

    console.log("REGISTER DEBUG: contractAddress=", contractAddress);
    console.log("REGISTER DEBUG: rpcUrl=", rpcUrl);

    // Check existing confirmed on chain
    const [getOk, getTs] = await publicClient.readContract({
      address: contractAddress,
      abi: PROOFY_ABI,
      functionName: "get",
      args: [hash],
    }).catch(err => {
      console.log("REGISTER DEBUG: readContract error:", err);
      return [false, 0n];
    });
    const beforeExists = Boolean(getOk) && Number(getTs) !== 0;

    if (beforeExists) {
      console.log("REGISTER DEBUG: already confirmed on chain");
      return json(
        200,
        {
          ok: true,
          statusCode: "CONFIRMED",
          statusText: "Bekräftad (fanns redan)",
          hash,
          confirmedAtUnix: Number(getTs),
          evidence: null,
          submission: null,
          legalText: "Fanns redan bekräftad notering.",
        },
        origin
      );
    }

    // Pick fees
    const { maxFeePerGas, maxPriorityFeePerGas } = await pickFeesWithDebug(
      publicClient,
      env
    );

    // Log picked fees for cloud logs
    console.log(
      `REGISTER DEBUG: using fees: maxFeePerGas=${weiToGweiNumber(
        maxFeePerGas
      )} gwei, maxPriorityFeePerGas=${weiToGweiNumber(
        maxPriorityFeePerGas
      )} gwei`
    );

    const account = privateKeyToAccount(privateKey);
    console.log("REGISTER DEBUG: submitting with account=", account.address);

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
    }).catch(err => {
      console.log("REGISTER DEBUG: simulateContract error:", err);
      throw err;
    });

    console.log("REGISTER DEBUG: simulateContract succeeded");

    const txHash = await walletClient.writeContract({
      ...sim.request,
      maxFeePerGas,
      maxPriorityFeePerGas,
    });

    console.log("REGISTER DEBUG: txHash=", txHash);

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
      },
      origin
    );
  } catch (e) {
    console.log("REGISTER DEBUG: exception:", e);
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
