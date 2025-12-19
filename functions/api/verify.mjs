import { createPublicClient, http, zeroAddress, isHex } from "viem";
import { polygonAmoy } from "viem/chains";
import { ABI } from "./abi";

function json(statusCode, obj) {
  return new Response(JSON.stringify(obj), {
    status: statusCode,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "GET,OPTIONS",
    },
  });
}

function isBytes32Hash(h) {
  return typeof h === "string" && /^0x[a-fA-F0-9]{64}$/.test(h);
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const hash = (url.searchParams.get("hash") || "").trim();
  const debug = url.searchParams.get("debug") === "1";

  if (request.method === "OPTIONS") return json(204, {});
  if (request.method !== "GET") return json(405, { ok: false, error: "Use GET" });

  const CONTRACT_ADDRESS = env.CONTRACT_ADDRESS || "";
  const RPC_URL = env.AMOY_RPC_URL || "";

  if (debug) {
    return json(200, {
      ok: true,
      debug: true,
      hasHash: !!hash,
      hasContractAddress: !!CONTRACT_ADDRESS,
      hasRpcUrl: !!RPC_URL,
      contractAddressLooksValid: isHex(CONTRACT_ADDRESS) && CONTRACT_ADDRESS.length === 42,
      rpcUrlStartsWithHttps: RPC_URL.startsWith("https://"),
    });
  }

  if (!isBytes32Hash(hash)) {
    return json(400, { ok: false, error: "Invalid hash. Expected bytes32 hex." });
  }
  if (!CONTRACT_ADDRESS || !RPC_URL) {
    return json(500, { ok: false, error: "Missing CONTRACT_ADDRESS or AMOY_RPC_URL" });
  }

  const client = createPublicClient({
    chain: polygonAmoy,
    transport: http(RPC_URL),
  });

  try {
    const { timestamp, submitter } = await client.readContract({
      address: CONTRACT_ADDRESS,
      abi: ABI,
      functionName: "getProof",
      args: [hash],
    });

    const exists = timestamp > 0 && submitter && submitter !== zeroAddress;

    return json(200, {
      ok: true,
      exists,
      hash,
      timestamp: exists ? Number(timestamp) : 0,
      submitter: exists ? submitter : null,
    });
  } catch (e) {
    const msg = String(e?.shortMessage || e?.message || e);
    return json(500, { ok: false, error: msg });
  }
}
