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

async function readProof({ publicClient, contractAddress, hash }) {
  const proof = await publicClient.readContract({
    address: contractAddress,
    abi: PROOFY_ABI,
    functionName: "getProof",
    args: [hash],
  });

  const timestampBig = proof?.[0] ?? 0n;
  const exists = BigInt(timestampBig) !== 0n;

  const tsBig = BigInt(timestampBig);
  const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);

  const timestamp =
    exists && tsBig <= maxSafe ? Number(tsBig) : exists ? tsBig.toString() : 0;

  return { exists, timestamp };
}

async function readProofWithRetry({
  publicClient,
  contractAddress,
  hash,
  retries = 3,
  delayMs = 800,
}) {
  for (let i = 0; i < retries; i++) {
    const proof = await readProof({ publicClient, contractAddress, hash });
    if (proof.exists && proof.timestamp && proof.timestamp !== 0) return proof;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return readProof({ publicClient, contractAddress, hash });
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
    return json(400, { ok: false, error: "Invalid JSON body" }, origin);
  }

  const hash = String(body?.hash || "").trim();

  if (!isValidBytes32Hex(hash)) {
    return json(400, { ok: false, error: "Invalid hash format" }, origin);
  }

  const rpcUrl = env.AMOY_RPC_URL;
  const contractAddress = env.PROOFY_CONTRACT_ADDRESS;
  const privateKey = env.PROOFY_PRIVATE_KEY;

  if (!rpcUrl || !contractAddress || !privateKey) {
    return json(500, { ok: false, error: "Server misconfiguration" }, origin);
  }

  if (!isValidAddressHex(contractAddress)) {
    return json(500, { ok: false, error: "Server misconfiguration" }, origin);
  }

  try {
    const publicClient = createPublicClient({
      chain: polygonAmoy,
      transport: http(rpcUrl),
    });

    // If already registered, return exists+timestamp
    const pre = await readProof({ publicClient, contractAddress, hash });
    if (pre.exists && pre.timestamp && pre.timestamp !== 0) {
      return json(200, { ok: true, exists: true, timestamp: pre.timestamp }, origin);
    }

    // Not registered -> write
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

    await publicClient.waitForTransactionReceipt({
      hash: txHash,
      confirmations: 1,
    });

    const post = await readProofWithRetry({
      publicClient,
      contractAddress,
      hash,
      retries: 3,
      delayMs: 800,
    });

    if (!post.exists || !post.timestamp || post.timestamp === 0) {
      return json(500, { ok: false, error: "Registration completed but not readable" }, origin);
    }

    // Keep response minimal for frontend
    return json(200, { ok: true, exists: true, timestamp: post.timestamp }, origin);
  } catch (e) {
    return json(500, { ok: false, error: "Register failed" }, origin);
  }
}
