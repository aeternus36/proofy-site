import { createPublicClient, http } from "viem";
import { polygonAmoy } from "viem/chains";

const PROOFY_ABI = [
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

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });
}

function isValidBytes32Hex(hash) {
  return typeof hash === "string" && /^0x[0-9a-fA-F]{64}$/.test(hash);
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const rpcUrl = env.AMOY_RPC_URL;
  const contractAddress = env.PROOFY_CONTRACT_ADDRESS;

  if (!rpcUrl || !contractAddress) {
    return json(
      {
        ok: false,
        error:
          "Missing env vars. Required: AMOY_RPC_URL, PROOFY_CONTRACT_ADDRESS",
      },
      500
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const hash = body?.hash;
  if (!isValidBytes32Hex(hash)) {
    return json(
      {
        ok: false,
        error: "Invalid hash. Expected bytes32 hex: 0x + 64 hex chars",
      },
      400
    );
  }

  const publicClient = createPublicClient({
    chain: polygonAmoy,
    transport: http(rpcUrl),
  });

  try {
    const [timestamp, submitter] = await publicClient.readContract({
      address: contractAddress,
      abi: PROOFY_ABI,
      functionName: "getProof",
      args: [hash],
    });

    const exists = BigInt(timestamp) !== 0n;

    return json({
      ok: true,
      chainId: polygonAmoy.id,
      hash,
      exists,
      timestamp: exists ? Number(timestamp) : 0,
      submitter: exists
        ? submitter
        : "0x0000000000000000000000000000000000000000",
    });
  } catch (err) {
    return json(
      { ok: false, error: "readContract failed", details: err?.message ?? String(err) },
      500
    );
  }
}
