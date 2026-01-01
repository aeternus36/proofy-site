import { createPublicClient, createWalletClient, http, isHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygonAmoy } from "viem/chains";

const PROOFY_ABI = [
  {
    type: "function",
    name: "getProof",
    stateMutability: "view",
    inputs: [{ name: "hash", type: "bytes32" }],
    outputs: [
      { name: "timestamp", type: "uint256" },
      { name: "submitter", type: "address" },
    ],
  },
  {
    type: "function",
    name: "register",
    stateMutability: "nonpayable",
    inputs: [{ name: "hash", type: "bytes32" }],
    outputs: [],
  },
];

function json(status, obj, origin) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Vary": "Origin",
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
      "Vary": "Origin",
    },
  });
}

function isValidBytes32Hex(hash) {
  return (
    typeof hash === "string" &&
    hash.startsWith("0x") &&
    hash.length === 66 &&
    isHex(hash)
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

function toSafeTimestamp(timestampBig) {
  const tsBig = BigInt(timestampBig ?? 0n);
  const exists = tsBig !== 0n;
  if (!exists) return { exists: false, timestamp: 0 };

  const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
  const timestamp = tsBig <= maxSafe ? Number(tsBig) : tsBig.toString();
  return { exists: true, timestamp };
}

async function readProof({ publicClient, contractAddress, hash }) {
  const proof = await publicClient.readContract({
    address: contractAddress,
    abi: PROOFY_ABI,
    functionName: "getProof",
    args: [hash],
  });

  const timestampBig = proof?.[0] ?? 0n;
  const submitter = proof?.[1];
  const { exists, timestamp } = toSafeTimestamp(timestampBig);

  return {
    exists,
    timestamp,
    submitter: isValidAddressHex(submitter) ? submitter : null,
  };
}

function sanitizeError(e) {
  const msg =
    (e && typeof e === "object" && "shortMessage" in e && e.shortMessage) ||
    (e && typeof e === "object" && "message" in e && e.message) ||
    "Unexpected error";
  return String(msg).slice(0, 400);
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
  if (!isValidBytes32Hex(hash))
    return json(400, { ok: false, error: "Invalid hash format" }, origin);

  const rpcUrl = env.AMOY_RPC_URL;
  const contractAddress = env.PROOFY_CONTRACT_ADDRESS;
  const privateKey = normalizePrivateKey(env.PROOFY_PRIVATE_KEY);

  if (!rpcUrl || !contractAddress || !privateKey)
    return json(500, { ok: false, error: "Server misconfiguration" }, origin);

  if (!isValidAddressHex(contractAddress))
    return json(500, { ok: false, error: "Server misconfiguration" }, origin);

  if (!isValidBytes32Hex(privateKey))
    return json(500, { ok: false, error: "Server misconfiguration" }, origin);

  // Transport
  const publicClient = createPublicClient({
    chain: polygonAmoy,
    transport: http(rpcUrl),
  });

  try {
    // 1) Already registered?
    const pre = await readProof({ publicClient, contractAddress, hash });
    if (pre.exists && pre.timestamp && pre.timestamp !== 0) {
      return json(
        200,
        {
          ok: true,
          exists: true,
          alreadyExists: true,
          pending: false,
          timestamp: pre.timestamp,
          submitter: pre.submitter,
          txHash: null,
        },
        origin
      );
    }

    // 2) Submit tx
    const account = privateKeyToAccount(privateKey);
    const walletClient = createWalletClient({
      account,
      chain: polygonAmoy,
      transport: http(rpcUrl),
    });

    const txHash = await walletClient.writeContract({
      address: contractAddress,
      abi: PROOFY_ABI,
      functionName: "register",
      args: [hash],
    });

    // 3) Try to wait quickly, but do NOT hang forever.
    // If Amoy is slow, return 202 + txHash so frontend can poll /api/verify.
    try {
      await publicClient.waitForTransactionReceipt({
        hash: txHash,
        confirmations: 1,
        timeout: 12_000, // <— viktigt: kort timeout
      });

      const post = await readProof({ publicClient, contractAddress, hash });
      if (post.exists && post.timestamp && post.timestamp !== 0) {
        return json(
          200,
          {
            ok: true,
            exists: true,
            alreadyExists: false,
            pending: false,
            timestamp: post.timestamp,
            submitter: post.submitter,
            txHash,
          },
          origin
        );
      }
    } catch {
      // ignore (pending)
    }

    return json(
      202,
      {
        ok: true,
        exists: false,
        alreadyExists: false,
        pending: true,
        txHash,
      },
      origin
    );
  } catch (e) {
    return json(
      500,
      { ok: false, error: "Register failed", detail: sanitizeError(e) },
      origin
    );
  }
}
