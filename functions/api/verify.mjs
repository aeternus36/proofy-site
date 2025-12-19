// functions/verify.mjs
import { createPublicClient, http, isHex, zeroAddress } from "viem";
import { polygonAmoy } from "viem/chains";

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const hash = url.searchParams.get("hash") || "";
  const debug = url.searchParams.get("debug") === "1";

  const CONTRACT_ADDRESS = context.env.PROOFY_CONTRACT_ADDRESS;
  const RPC_URL = context.env.AMOY_RPC_URL;

  const json = (status, obj) =>
    new Response(JSON.stringify(obj), {
      status,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
      },
    });

  const isBytes32Hash = (h) => /^0x[a-fA-F0-9]{64}$/.test(h);

  if (debug) {
    return json(200, {
      ok: true,
      debug: true,
      hasHash: !!hash,
      hasContractAddress: !!CONTRACT_ADDRESS,
      hasRpcUrl: !!RPC_URL,
    });
  }

  if (!isBytes32Hash(hash)) return json(400, { ok: false, error: "Invalid hash." });
  if (!CONTRACT_ADDRESS) return json(500, { ok: false, error: "Missing contract address." });
  if (!RPC_URL) return json(500, { ok: false, error: "Missing RPC URL." });

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

  const client = createPublicClient({
    chain: polygonAmoy,
    transport: http(RPC_URL),
  });

  try {
    const res = await client.readContract({
      address: CONTRACT_ADDRESS,
      abi: ABI,
      functionName: "getProof",
      args: [hash],
    });

    const timestamp = Number(res?.timestamp || 0);
    const submitter = res?.submitter || zeroAddress;
    const exists = timestamp > 0 && submitter !== zeroAddress;

    return json(200, {
      ok: true,
      hashHex: hash,
      exists,
      timestamp,
      submitter,
    });
  } catch (e) {
    return json(500, {
      ok: false,
      error: "The contract function \"getProof\" reverted.",
      userMessage: "Verifieringstjänsten är tillfälligt otillgänglig. Försök igen om en stund.",
    });
  }
}
