import {
  createWalletClient,
  createPublicClient,
  http,
  hexToBytes,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

export async function onRequest(context) {
  try {
    const { hash } = await context.request.json();

    if (!hash) {
      return json({ ok: false, error: "Missing hash" }, 400);
    }

    const rpcUrl = context.env.RPC_URL;
    const contractAddress = context.env.CONTRACT_ADDRESS;
    const privateKey = context.env.PRIVATE_KEY;

    const account = privateKeyToAccount(privateKey);

    const wallet = createWalletClient({
      account,
      transport: http(rpcUrl),
    });

    const txHash = await wallet.writeContract({
      address: contractAddress,
      abi: [
        {
          name: "register",
          type: "function",
          stateMutability: "nonpayable",
          inputs: [{ name: "hash", type: "bytes32" }],
          outputs: [],
        },
      ],
      functionName: "register",
      args: [hash],
    });

    return json({
      ok: true,
      txHash,
    });
  } catch (err) {
    return json({
      ok: false,
      error: err.message,
    }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
