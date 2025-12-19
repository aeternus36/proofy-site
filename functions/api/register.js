import { createPublicClient, createWalletClient, http, isHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const PROOFY_ABI = [
  {
    type: "function",
    name: "register",
    stateMutability: "nonpayable",
    inputs: [{ name: "hash", type: "bytes32" }],
    outputs: [],
  },
];

function json(status, obj) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function onRequest({ request, env }) {
  // Tillåt GET för browser-test
  if (request.method === "GET") {
    return json(200, {
      ok: true,
      message: "Use POST /api/register",
      env: {
        hasKey: !!env.PROOFY_PRIVATE_KEY,
        hasRpc: !!env.AMOY_RPC_URL,
        hasAddress: !!env.PROOFY_CONTRACT_ADDRESS,
      },
    });
  }

  if (request.method !== "POST") {
    return json(405, { ok: false, error: "Use POST" });
  }

  // 1️⃣ Läs body
  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const hash = (body?.hash || "").trim();

  // 2️⃣ Validera hash
  if (!hash || !hash.startsWith("0x") || hash.length !== 66 || !isHex(hash)) {
    return json(400, {
      ok: false,
      error: "hash must be bytes32 (0x + 64 hex chars)",
      received: body,
    });
  }

  // 3️⃣ Env
  const rpcUrl = env.AMOY_RPC_URL;
  const contractAddress = env.PROOFY_CONTRACT_ADDRESS;
  const privateKey = env.PROOFY_PRIVATE_KEY;

  if (!rpcUrl || !contractAddress || !privateKey) {
    return json(500, {
      ok: false,
      error: "Missing environment variables",
    });
  }

  try {
    // 4️⃣ Skapa signer
    const account = privateKeyToAccount(privateKey);

    const publicClient = createPublicClient({
      transport: http(rpcUrl),
    });

    const walletClient = createWalletClient({
      account,
      transport: http(rpcUrl),
    });

    // (valfritt men bra)
    const chainId = await publicClient.getChainId();

    // 5️⃣ Skicka tx
    const txHash = await walletClient.writeContract({
      address: contractAddress,
      abi: PROOFY_ABI,
      functionName: "register",
      args: [hash],
    });

    return json(200, {
      ok: true,
      chainId,
      txHash,
      hash,
    });
  } catch (e) {
    return json(500, {
      ok: false,
      error: e.message,
    });
  }
}
