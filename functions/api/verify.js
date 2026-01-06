import { createPublicClient, http, isHex } from "viem";
import { polygonAmoy } from "viem/chains";

/**
 * Proofy /api/verify
 * - Tar emot hash via GET (?hash=... eller ?id=...) eller POST { hash: ... }
 * - Läser från ditt Proofy-kontrakt: get(bytes32) -> (bool ok, uint64 ts)
 * - Returnerar revisionsvänligt: exists + timestamp (om finns)
 *
 * OBS: Denna fil matchar ditt Solidity-kontrakt (INTE getProof()).
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
    name: "registeredAt",
    stateMutability: "view",
    inputs: [{ name: "refId", type: "bytes32" }],
    outputs: [{ name: "ts", type: "uint64" }],
  },
  {
    type: "function",
    name: "exists",
    stateMutability: "view",
    inputs: [{ name: "refId", type: "bytes32" }],
    outputs: [{ name: "ok", type: "bool" }],
  },
];

function json(status, obj, origin) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    Vary: "Origin",
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
      Vary: "Origin",
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

function toSafeUint64(ts) {
  const v = BigInt(ts ?? 0n);
  if (v <= 0n) return 0;

  // uint64 timestamps är i praktiken alltid < MAX_SAFE_INTEGER, men vi är defensiva.
  const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
  return v <= maxSafe ? Number(v) : Number(maxSafe);
}

async function readGet({ publicClient, contractAddress, hash }) {
  // Primär väg: get() ger både exists + timestamp.
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
    hash = String(
      (url.searchParams.get("hash") || url.searchParams.get("id") || "").trim()
    );
  } else {
    const body = await request.json().catch(() => ({}));
    hash = String(body?.hash || "").trim();
  }

  if (!isValidBytes32Hex(hash)) {
    return json(400, { error: "Invalid hash format", exists: false }, origin);
  }

  const rpcUrl = String(env.AMOY_RPC_URL || "").trim();
  const contractAddress = String(env.PROOFY_CONTRACT_ADDRESS || "").trim();

  if (!rpcUrl || !contractAddress) {
    return json(500, { error: "Server misconfiguration" }, origin);
  }

  try {
    const publicClient = createPublicClient({
      chain: polygonAmoy,
      transport: http(rpcUrl),
    });

    const proof = await readGet({ publicClient, contractAddress, hash });

    if (proof.exists) {
      return json(200, { exists: true, timestamp: proof.timestamp }, origin);
    }
    return json(200, { exists: false }, origin);
  } catch (e) {
    // Håll API-svaret stabilt: frontend kan visa "kunde inte kontrolleras just nu".
    return json(503, { error: "Verify temporarily unavailable" }, origin);
  }
}
