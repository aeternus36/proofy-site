// functions/register.mjs
import {
  createPublicClient,
  createWalletClient,
  http,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygonAmoy } from "viem/chains";


const ABI = [
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

export async function onRequestPost(context) {
  const json = (status, obj) =>
    new Response(JSON.stringify(obj), {
      status,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
      },
    });

  const body = await context.request.json().catch(() => ({}));
  const hash = (body?.hash || "").trim();

  if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) {
    return json(400, { ok: false, error: "Invalid hash." });
  }

  const CONTRACT_ADDRESS = context.env.PROOFY_CONTRACT_ADDRESS;
  const RPC_URL = context.env.AMOY_RPC_URL;
  const PRIVATE_KEY = context.env.PROOFY_PRIVATE_KEY;

  if (!CONTRACT_ADDRESS || !RPC_URL || !PRIVATE_KEY) {
    return json(500, { ok: false, error: "Missing required environment variables." });
  }

  const account = privateKeyToAccount(PRIVATE_KEY);

  const publicClient = createPublicClient({
    chain: polygonAmoy,
    transport: http(RPC_URL),
  });

  const walletClient = createWalletClient({
    account,
    chain: polygonAmoy,
    transport: http(RPC_URL),
  });

  try {
    const proof = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: ABI,
      functionName: "getProof",
      args: [hash],
    });

    if (
      Number(proof?.timestamp || 0) > 0 &&
      (proof?.submitter || zeroAddress) !== zeroAddress
    ) {
      return json(200, {
        ok: true,
        alreadyExists: true,
        hashHex: hash,
        timestamp: Number(proof.timestamp),
        submitter: proof.submitter,
      });
    }
  } catch (_) {}

  try {
    const sim = await publicClient.simulateContract({
      address: CONTRACT_ADDRESS,
      abi: ABI,
      functionName: "register",
      args: [hash],
      account,
    });

    const txHash = await walletClient.writeContract(sim.request);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    return json(200, {
      ok: true,
      alreadyExists: false,
      txHash,
      blockNumber: Number(receipt.blockNumber),
    });
  } catch (e) {
    return json(500, {
      ok: false,
      error: e.message || "Unknown error",
    });
  }
}
