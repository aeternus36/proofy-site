import { createPublicClient, http, isHex } from "viem";

const amoy = {
  id: Number(process.env.CHAIN_ID || 80002),
  name: "Polygon Amoy",
  nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
  rpcUrls: { default: { http: [process.env.AMOY_RPC_URL] } },
};

const proofyAbi = [
  {
    type: "function",
    name: "getProof",
    stateMutability: "view",
    inputs: [{ name: "hash", type: "bytes32" }],
    outputs: [
      { name: "exists_", type: "bool" },
      { name: "timestamp", type: "uint64" },
      { name: "submitter", type: "address" },
    ],
  },
];

function assertBytes32(hex) {
  if (!isHex(hex)) throw new Error("Invalid hex");
  if (hex.length !== 66) throw new Error("Hash must be 32 bytes (0x + 64 hex chars)");
}

function corsHeaders() {
  const origin = process.env.ALLOW_ORIGIN || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };
}

export async function handler(event) {
  try {
    if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: corsHeaders(), body: "" };
    if (event.httpMethod !== "GET") return { statusCode: 405, headers: corsHeaders(), body: "Method Not Allowed" };

    const hashHex = (event.queryStringParameters?.hash || "").trim();
    assertBytes32(hashHex);

    const contractAddress = process.env.CONTRACT_ADDRESS;
    if (!contractAddress) throw new Error("Missing CONTRACT_ADDRESS");

    const publicClient = createPublicClient({ chain: amoy, transport: http(process.env.AMOY_RPC_URL) });

    const [exists_, timestamp, submitter] = await publicClient.readContract({
      address: contractAddress,
      abi: proofyAbi,
      functionName: "getProof",
      args: [hashHex],
    });

    return {
      statusCode: 200,
      headers: { ...corsHeaders(), "content-type": "application/json" },
      body: JSON.stringify({
        ok: true,
        hashHex,
        exists: exists_,
        timestamp: Number(timestamp),
        submitter,
      }),
    };
  } catch (e) {
    return {
      statusCode: 400,
      headers: { ...corsHeaders(), "content-type": "application/json" },
      body: JSON.stringify({ ok: false, error: String(e?.message || e) }),
    };
  }
}
