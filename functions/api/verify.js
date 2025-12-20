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

function json(status, obj) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
      "Access-Control-Allow-Headers": "content-type",
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

export async function onRequest({ request, env }) {
  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
        "Access-Control-Allow-Headers": "content-type",
      },
    });
  }

  // Allow GET for quick browser test
  if (request.method === "GET") {
    return json(200, {
      ok: true,
      message: "Use POST /api/verify with JSON body: { hash: \"0x...\" }",
      env: {
        hasRpc: !!env.AMOY_RPC_URL,
        hasAddress: !!env.PROOFY_CONTRACT_ADDRESS,
      },
      chain: {
        name: "polygonAmoy",
        chainId: polygonAmoy.id,
      },
    });
  }

  if (request.method !== "POST") {
    return json(405, { ok: false, error: "Use POST" });
  }

  const rpcUrl = env.AMOY_RPC_URL;
  const contractAddress = env.PROOFY_CONTRACT_ADDRESS;

  if (!rpcUrl || !contractAddress) {
    return json(500, {
      ok: false,
      error: "Missing environment variables",
      required: ["AMOY_RPC_URL", "PROOFY_CONTRACT_ADDRESS"],
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const hash = (body?.hash || "").trim();

  if (!isValidBytes32Hex(hash)) {
    return json(400, {
      ok: false,
      error: "hash must be bytes32 (0x + 64 hex chars)",
      received: body,
    });
  }

  try {
    const publicClient = createPublicClient({
      chain: polygonAmoy,
      transport: http(rpcUrl),
    });

    const proof = await publicClient.readContract({
      address: contractAddress,
      abi: PROOFY_ABI,
      functionName: "getProof",
      args: [hash],
    });

    // viem returns tuple outputs as array
    const timestampBig = proof?.[0] ?? 0n;
    const submitter = proof?.[1] ?? "0x0000000000000000000000000000000000000000";

    const exists = BigInt(timestampBig) !== 0n;
    const timestamp = exists ? Number(timestampBig) : 0;

    return json(200, {
      ok: true,
      chainId: polygonAmoy.id,
      hash,
      exists,
      timestamp,
      submitter: exists
        ? submitter
        : "0x0000000000000000000000000000000000000000",
    });
  } catch (e) {
    return json(500, {
      ok: false,
      error: e?.message || String(e),
    });
  }
}
