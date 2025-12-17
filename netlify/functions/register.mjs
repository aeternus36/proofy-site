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
    "access-control-allow-origin": origin,
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "POST, OPTIONS",
  };
}

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      ...corsHeaders(),
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function assertBytes32(hex) {
  if (!isHex(hex)) throw new Error("Invalid hex");
  if (hex.length !== 66) throw new Error("Hash must be bytes32 (0x + 64 hex chars)");
}

function sanitizePrivateKey(raw) {
  let pk = (raw || "").trim();
  pk = pk.replace(/^"+|"+$/g, "").replace(/^'+|'+$/g, "");
  if (pk && !pk.startsWith("0x")) pk = "0x" + pk;
  return pk;
}

export default async (request) => {
  try {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
    if (request.method !== "POST") return json(405, { ok: false, error: "Method Not Allowed" });

    const contractAddress = process.env.CONTRACT_ADDRESS;
    const rpcUrl = process.env.AMOY_RPC_URL;
    const pk = sanitizePrivateKey(process.env.PROOFY_PRIVATE_KEY);

    if (!contractAddress) throw new Error("Missing CONTRACT_ADDRESS");
    if (!rpcUrl) throw new Error("Missing AMOY_RPC_URL");
    if (!pk) throw new Error("Missing PROOFY_PRIVATE_KEY");

    if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) {
      throw new Error(`Invalid private key format. Expected 0x + 64 hex chars. Got length=${pk.length}`);
    }

    const body = await request.json().catch(() => ({}));
    const hashHex = (body.hash || "").trim();
    assertBytes32(hashHex);

    const publicClient = createPublicClient({ chain: amoy, transport: http(rpcUrl) });

    // Idempotent: returnera om redan finns
    const [exists_, timestamp, submitter] = await publicClient.readContract({
      address: contractAddress,
      abi,
      functionName: "getProof",
      args: [hashHex],
    });

    if (exists_) {
      return json(200, {
        ok: true,
        alreadyExists: true,
        hashHex,
        timestamp: Number(timestamp),
        submitter,
      });
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

    return json(200, {
      ok: true,
      alreadyExists: false,
      hashHex,
      txHash,
      status: receipt.status,
      blockNumber: receipt.blockNumber ? Number(receipt.blockNumber) : null,
    });
  } catch (e) {
    return json(400, { ok: false, error: String(e?.message || e) });
  }
};
