import { createPublicClient, http, isHex } from "viem";
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
];

function json(status, obj, origin) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  };

  // Conservative default: allow same-origin. If no Origin header (Postman/server), allow.
  if (origin) headers["Access-Control-Allow-Origin"] = origin;

  return new Response(JSON.stringify(obj), { status, headers });
}

function corsPreflight(origin) {
  return new Response(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": origin || "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

async function readProof({ publicClient, contractAddress, hash }) {
  const proof = await publicClient.readContract({
    address: contractAddress,
    abi: PROOFY_ABI,
    functionName: "getProof",
    args: [hash],
  });

  const timestampBig = proof?.[0] ?? 0n;
  const exists = BigInt(timestampBig) !== 0n;

  // return timestamp as Number when safe, else string (but frontend expects number -> we only emit when safe)
  const tsBig = BigInt(timestampBig);
  const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);

  const timestamp =
    exists && tsBig <= maxSafe ? Number(tsBig) : exists ? tsBig.toString() : 0;

  return { exists, timestamp };
}

export async function onRequest({ request, env }) {
  const origin = request.headers.get("Origin") || "";

  if (request.method === "OPTIONS") {
    return corsPreflight(origin || "*");
  }

  if (request.method !== "GET" && request.method !== "POST") {
    return json(405, { error: "Method Not Allowed" }, origin);
  }

  // Accept hash from GET query or POST body
  let hash = "";
  if (request.method === "GET") {
    const url = new URL(request.url);
    hash = (url.searchParams.get("hash") || url.searchParams.get("id") || "").trim();
  } else {
    const body = await request.json().catch(() => ({}));
    hash = String(body?.hash || "").trim();
  }

  if (!isValidBytes32Hex(hash)) {
    // Keep error messages UI-safe (no blockchain jargon in frontend; but this is API)
    return json(400, { error: "Invalid hash format", exists: false }, origin);
  }

  const rpcUrl = env.AMOY_RPC_URL;
  const contractAddress = env.PROOFY_CONTRACT_ADDRESS;

  if (!rpcUrl || !contractAddress) {
    return json(500, { error: "Server misconfiguration" }, origin);
  }

  try {
    const publicClient = createPublicClient({
      chain: polygonAmoy,
      transport: http(rpcUrl),
    });

    const proof = await readProof({ publicClient, contractAddress, hash });

    // Frontend expects boolean + (optional) numeric timestamp.
    // If timestamp comes back as string (unlikely), still return it; certificate/verify pages treat it carefully.
    if (proof.exists) {
      return json(200, { exists: true, timestamp: proof.timestamp }, origin);
    }
    return json(200, { exists: false }, origin);
  } catch (e) {
    return json(500, { error: "Verify failed" }, origin);
  }
}
