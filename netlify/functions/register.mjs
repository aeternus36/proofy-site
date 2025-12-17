import {
  createPublicClient,
  createWalletClient,
  http,
  isHex,
  publicActions,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const amoy = {
  id: Number(process.env.CHAIN_ID || 80002),
  name: "Polygon Amoy",
  nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
  rpcUrls: { default: { http: [process.env.AMOY_RPC_URL] } },
};

const abi = [
  {
    type: "function",
    name: "register",
    stateMutability: "nonpayable",
    inputs: [{ name: "hash", type: "bytes32" }],
    outputs: [],
  },
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

function corsHeaders() {
  const origin = process.env.ALLOW_ORIGIN || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function assertBytes32(hex) {
  if (!isHex(hex)) throw new Error("Invalid hex");
  if (hex.length !== 66) throw new Error("Hash must be 32 bytes (0x + 64 hex chars)");
}

export async function handler(event) {
  try {
    if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: corsHeaders(), body: "" };
    if (event.httpMethod !== "POST") return { statusCode: 405, headers: corsHeaders(), body: "Method Not Allowed" };

    const contractAddress = process.env.CONTRACT_ADDRESS;
    const rpcUrl = process.env.AMOY_RPC_URL;
    const pk = process.env.PROOFY_PRIVATE_KEY;

    if (!contractAddress) throw new Error("Missing CONTRACT_ADDRESS");
    if (!rpcUrl) throw new Error("Missing AMOY_RPC_URL");
    if (!pk) throw new Error("Missing PROOFY_PRIVATE_KEY");

    const body = event.body ? JSON.parse(event.body) : {};
    const hashHex = (body.hash || "").trim();
    assertBytes32(hashHex);

    const publicClient = createPublicClient({ chain: amoy, transport: http(rpcUrl) });

    // Idempotent: om redan registrerad -> returnera direkt
    const [exists_, timestamp, submitter] = await publicClient.readContract({
      address: contractAddress,
      abi,
      functionName: "getProof",
      args: [hashHex],
    });

    if (exists_) {
      return {
        statusCode: 200,
        headers: { ...corsHeaders(), "content-type": "application/json" },
        body: JSON.stringify({
          ok: true,
          alreadyExists: true,
          hashHex,
          timestamp: Number(timestamp),
          submitter,
        }),
      };
    }

    const account = privateKeyToAccount(pk);
    const walletClient = createWalletClient({
      account,
      chain: amoy,
      transport: http(rpcUrl),
    }).extend(publicActions);

    const txHash = await walletClient.writeContract({
      address: contractAddress,
      abi,
      functionName: "register",
      args: [hashHex],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    return {
      statusCode: 200,
      headers: { ...corsHeaders(), "content-type": "application/json" },
      body: JSON.stringify({
        ok: true,
        alreadyExists: false,
        hashHex,
        txHash,
        status: receipt.status,
        blockNumber: receipt.blockNumber ? Number(receipt.blockNumber) : null,
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
