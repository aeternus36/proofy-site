import { createPublicClient, createWalletClient, http, isHex } from "viem";
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
      { name: "ts", type: "uint64" },
    ],
  },
];

function json(status, obj, origin) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    Vary: "Origin",
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

function sanitizeError(e) {
  const msg =
    (e && typeof e === "object" && "shortMessage" in e && e.shortMessage) ||
    (e && typeof e === "object" && "message" in e && e.message) ||
    String(e);
  return String(msg).slice(0, 1000);
}

function toSafeUint64(ts) {
  const v = BigInt(ts ?? 0n);
  if (v <= 0n) return 0;
  const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
  return v <= maxSafe ? Number(v) : Number(maxSafe);
}

async function readGet({ publicClient, contractAddress, hash }) {
  const [ok, ts] = await publicClient.readContract({
    address: contractAddress,
    abi: PROOFY_ABI,
    functionName: "get",
    args: [hash],
  });
  const timestamp = toSafeUint64(ts);
  const exists = Boolean(ok) && timestamp !== 0;
  return { exists, timestamp };
}

// Stöd heltal/decimal (t.ex. "0.5")
function gweiToWeiBigInt(gwei) {
  const s = String(gwei).trim();
  const [i, d = ""] = s.split(".");
  const int = BigInt(i || "0");
  const dec = BigInt((d + "000000000").slice(0, 9));
  return int * 10n ** 9n + dec;
}

export async function onRequest({ request, env }) {
  const origin = request.headers.get("Origin") || "";

  if (request.method === "OPTIONS") return corsPreflight(origin || "*");
  if (request.method !== "POST")
    return json(405, { ok: false, error: "Method Not Allowed" }, origin);

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
    return json(500, { ok: false, error: "Server misconfiguration (missing env)" }, origin);
  }
  if (!isValidAddressHex(contractAddress)) {
    return json(500, { ok: false, error: "Server misconfiguration (bad contract address)" }, origin);
  }
  if (!isValidPrivateKeyHex(privateKey)) {
    return json(500, { ok: false, error: "Server misconfiguration (bad private key)" }, origin);
  }

  const maxFeeGwei = env.MAX_FEE_GWEI ?? 100;
  const maxPriorityFeeGwei = env.MAX_PRIORITY_FEE_GWEI ?? 2;

  const maxFeePerGas = gweiToWeiBigInt(maxFeeGwei);
  const maxPriorityFeePerGas = gweiToWeiBigInt(maxPriorityFeeGwei);

  const controller = new AbortController();
  const timeoutMs = Number(env.REGISTER_TIMEOUT_MS || 25_000);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let step = "init";
  let serverAddress = null;

  try {
    const transport = http(rpcUrl, { fetchOptions: { signal: controller.signal } });

    const publicClient = createPublicClient({ chain: polygonAmoy, transport });

    step = "pre_read";
    const pre = await readGet({ publicClient, contractAddress, hash });
    if (pre.exists) {
      return json(200, { ok: true, status: "already_registered", exists: true, timestamp: pre.timestamp, txHash: null }, origin);
    }

    step = "wallet_init";
    const account = privateKeyToAccount(privateKey);
    serverAddress = account.address;

    // ✅ Balans-check innan vi ens försöker skriva
    step = "balance_check";
    const balance = await publicClient.getBalance({ address: account.address });
    if (balance < 1n * 10n ** 16n) {
      // < 0.01 MATIC: nästan garanterat för lite när fees spikar
      return json(
        500,
        {
          ok: false,
          error: "Server wallet balance too low",
          address: account.address,
          balanceWei: balance.toString(),
          balanceMatic: Number(balance) / 1e18,
          step,
        },
        origin
      );
    }

    const walletClient = createWalletClient({ account, chain: polygonAmoy, transport });

    step = "simulate";
    const sim = await publicClient.simulateContract({
      account,
      address: contractAddress,
      abi: PROOFY_ABI,
      functionName: "registerIfMissing",
      args: [hash],
    });

    step = "write";
    const txHash = await walletClient.writeContract({
      ...sim.request,
      maxFeePerGas,
      maxPriorityFeePerGas,
    });

    step = "wait_receipt";
    await publicClient.waitForTransactionReceipt({ hash: txHash, confirmations: 1 });

    step = "post_read";
    const post = await readGet({ publicClient, contractAddress, hash });

    return json(
      200,
      {
        ok: true,
        status: post.exists ? "registered" : "pending_readback",
        exists: post.exists,
        timestamp: post.timestamp || 0,
        txHash,
        serverAddress,
        feeCaps: { maxFeeGwei: String(maxFeeGwei), maxPriorityFeeGwei: String(maxPriorityFeeGwei) },
      },
      origin
    );
  } catch (e) {
    const detail = sanitizeError(e);

    if (e && typeof e === "object" && e.name === "AbortError") {
      return json(504, { ok: false, error: "Upstream timeout", detail: `Timeout after ${timeoutMs}ms`, step, serverAddress }, origin);
    }

    return json(
      500,
      { ok: false, error: "Register failed", detail, step, serverAddress },
      origin
    );
  } finally {
    clearTimeout(timeout);
  }
}
