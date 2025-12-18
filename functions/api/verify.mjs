import { createPublicClient, http, zeroAddress } from "viem";
import { polygonAmoy } from "viem/chains";

function json(statusCode, body) {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    },
  });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const hash = url.searchParams.get("hash");
  const debug = url.searchParams.get("debug") === "1";

  if (debug) {
    return json(200, {
      ok: true,
      debug: true,
      hasHash: !!hash,
      hasRpcUrl: !!env.AMOY_RPC_URL,
      hasContractAddress: !!env.CONTRACT_ADDRESS,
    });
  }

  if (!hash || !/^0x[a-fA-F0-9]{64}$/.test(hash)) {
    return json(400, { ok: false, error: "Invalid bytes32 hash" });
  }

  try {
    const client = createPublicClient({
      chain: polygonAmoy,
      transport: http(env.AMOY_RPC_URL),
    });

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
    ];

    const [timestamp, submitter] = await client.readContract({
      address: env.CONTRACT_ADDRESS,
      abi: ABI,
      functionName: "getProof",
      args: [hash],
    });

    const exists =
      Number(timestamp) > 0 && submitter && submitter !== zeroAddress;

    return json(200, {
      ok: true,
      exists,
      timestamp: exists ? Number(timestamp) : 0,
      submitter: exists ? submitter : null,
    });
  } catch (err) {
    return json(200, {
      ok: true,
      exists: false,
      reason: "not_registered",
    });
  }
}
