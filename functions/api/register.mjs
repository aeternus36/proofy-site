import {
  createWalletClient,
  createPublicClient,
  http,
} from "viem";
import { polygonAmoy } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

function json(statusCode, body) {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    },
  });
}

export async function onRequestPost({ request, env }) {
  const { hash } = await request.json();

  if (!hash || !/^0x[a-fA-F0-9]{64}$/.test(hash)) {
    return json(400, { ok: false, error: "Invalid bytes32 hash" });
  }

  try {
    const account = privateKeyToAccount(env.PROOFY_PRIVATE_KEY);

    const publicClient = createPublicClient({
      chain: polygonAmoy,
      transport: http(env.AMOY_RPC_URL),
    });

    const walletClient = createWalletClient({
      account,
      chain: polygonAmoy,
      transport: http(env.AMOY_RPC_URL),
    });

    const ABI = [
      {
        type: "function",
        name: "registerProof",
        stateMutability: "nonpayable",
        inputs: [{ name: "hash", type: "bytes32" }],
        outputs: [],
      },
    ];

    const txHash = await walletClient.writeContract({
      address: env.CONTRACT_ADDRESS,
      abi: ABI,
      functionName: "registerProof",
      args: [hash],
    });

    await publicClient.waitForTransactionReceipt({ hash: txHash });

    return json(200, {
      ok: true,
      txHash,
    });
  } catch (err) {
    return json(500, {
      ok: false,
      error: err.message || String(err),
    });
  }
}
