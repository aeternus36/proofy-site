import { createPublicClient, createWalletClient, http, isHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const PROOFY_ABI = [
  // ✅ Read: getProof(bytes32) -> (uint256 timestamp, address submitter)
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
  // ✅ Write: register(bytes32)
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
  // Allow GET for browser test
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

  // 1) Read body
  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const hash = (body?.hash || "").trim();

  // 2) Validate hash (bytes32)
  if (!hash || !hash.startsWith("0x") || hash.length !== 66 || !isHex(hash)) {
    return json(400, {
      ok: false,
      error: "hash must be bytes32 (0x + 64 hex chars)",
      received: body,
    });
  }

  // 3) Env
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
    // 4) Clients
    const publicClient = createPublicClient({
      transport: http(rpcUrl),
    });

    // (Optional but useful)
    const chainId = await publicClient.getChainId();

    // ✅ 5) Pre-check: if already registered, return a clean response
    // getProof returns [timestamp, submitter] in viem for tuple outputs
    const proof = await publicClient.readContract({
      address: contractAddress,
      abi: PROOFY_ABI,
      functionName: "getProof",
      args: [hash],
    });

    const timestamp = Number(proof?.[0] ?? 0);
    const submitter = proof?.[1] ?? "0x0000000000000000000000000000000000000000";

    if (timestamp > 0) {
      return json(200, {
        ok: true,
        chainId,
        hash,
        alreadyExists: true,
        timestamp,
        submitter,
      });
    }

    // ✅ 6) Not registered -> send tx
    const account = privateKeyToAccount(privateKey);

    const walletClient = createWalletClient({
      account,
      transport: http(rpcUrl),
    });

    const txHash = await walletClient.writeContract({
      address: contractAddress,
      abi: PROOFY_ABI,
      functionName: "register",
      args: [hash],
    });

    // You can optionally wait for receipt, but keeping it fast is fine:
    // const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    return json(200, {
      ok: true,
      chainId,
      hash,
      alreadyExists: false,
      txHash,
      // blockNumber: receipt?.blockNumber ? Number(receipt.blockNumber) : null,
      // functionUsed: "register",
    });
  } catch (e) {
    return json(500, {
      ok: false,
      error: e?.message || String(e),
    });
  }
}
