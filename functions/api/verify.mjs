import { createPublicClient, http } from "viem";

export async function onRequest(context) {
  try {
    const url = new URL(context.request.url);
    const hash = url.searchParams.get("hash");

    const rpcUrl = context.env.RPC_URL;
    const contractAddress = context.env.CONTRACT_ADDRESS;

    if (!hash) {
      return json({
        ok: true,
        registered: false,
        reason: "NO_HASH_PROVIDED",
      });
    }

    const client = createPublicClient({
      transport: http(rpcUrl),
    });

    let proof;
    try {
      proof = await client.readContract({
        address: contractAddress,
        abi: [
          {
            name: "getProof",
            type: "function",
            stateMutability: "view",
            inputs: [{ name: "hash", type: "bytes32" }],
            outputs: [
              { name: "timestamp", type: "uint256" },
              { name: "submitter", type: "address" },
            ],
          },
        ],
        functionName: "getProof",
        args: [hash],
      });
    } catch (err) {
      // 🔑 VIKTIGT: getProof revert = inte registrerad
      return json({
        ok: true,
        registered: false,
      });
    }

    const [timestamp, submitter] = proof;

    return json({
      ok: true,
      registered: true,
      timestamp: Number(timestamp),
      submitter,
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
