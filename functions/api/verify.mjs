// functions/api/verify.mjs
import { createPublicClient, http, isHex, zeroAddress } from "viem";
import { polygonAmoy } from "viem/chains";

function isBytes32Hash(h) {
  return typeof h === "string" && /^0x[a-fA-F0-9]{64}$/.test(h);
}

function json(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

function corsHeaders(origin) {
  return {
    "access-control-allow-origin": origin || "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,OPTIONS",
  };
}

function looksLikeNotRegisteredError(msg) {
  const m = (msg || "").toLowerCase();
  return (
    m.includes("execution reverted") ||
    m.includes("reverted") ||
    m.includes("returned no data") ||
    m.includes("(0x)")
  );
}

export async function onRequest(context) {
  const { request, env } = context;

  const ALLOW_ORIGIN = (env.ALLOW_ORIGIN || "*").trim();

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(ALLOW_ORIGIN) });
  }
  if (request.method !== "GET") {
    return json(
      { ok: false, error: "Use GET" },
      405,
      corsHeaders(ALLOW_ORIGIN)
    );
  }

  const url = new URL(request.url);
  const hash = (url.searchParams.get("hash") || "").trim();
  const debug = (url.searchParams.get("debug") || "").trim() === "1";

  const CONTRACT_ADDRESS =
    (env.PROOFY_CONTRACT_ADDRESS || "").trim() ||
    (env.CONTRACT_ADDRESS || "").trim() ||
    (env.VITE_PROOFY_CONTRACT_ADDRESS || "").trim();

  const RPC_URL =
    (env.AMOY_RPC_URL || "").trim() ||
    (env.POLYGON_AMOY_RPC_URL || "").trim() ||
    (env.RPC_URL || "").trim();

  if (debug) {
    return json(
      {
        ok: true,
        debug: true,
        hasHash: !!hash,
        hasContractAddress: !!CONTRACT_ADDRESS,
        hasRpcUrl: !!RPC_URL,
        contractAddressLooksValid:
          isHex(CONTRACT_ADDRESS || "0x") && (CONTRACT_ADDRESS || "").length === 42,
        rpcUrlStartsWithHttps: (RPC_URL || "").startsWith("https://"),
        expectedEndpoint: "/api/verify?hash=0x... OR /api/verify?debug=1",
      },
      200,
      corsHeaders(ALLOW_ORIGIN)
    );
  }

  if (!isBytes32Hash(hash)) {
    return json(
      { ok: false, error: "Invalid hash. Expected bytes32 hex (0x + 64 hex)." },
      400,
      corsHeaders(ALLOW_ORIGIN)
    );
  }

  if (!CONTRACT_ADDRESS) {
    return json(
      { ok: false, error: "Missing CONTRACT_ADDRESS/PROOFY_CONTRACT_ADDRESS" },
      500,
      corsHeaders(ALLOW_ORIGIN)
    );
  }
  if (!RPC_URL) {
    return json(
      { ok: false, error: "Missing AMOY_RPC_URL" },
      500,
      corsHeaders(ALLOW_ORIGIN)
    );
  }

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

    let timestamp = 0;
    let submitter = null;

    if (Array.isArray(res)) {
      timestamp = Number(res[0] ?? 0);
      submitter = res[1] ?? null;
    } else {
      timestamp = Number(res?.timestamp ?? 0);
      submitter = res?.submitter ?? null;
    }

    const registered = timestamp > 0 && submitter && submitter !== zeroAddress;

    return json(
      {
        ok: true,
        hashHex: hash,
        registered,
        timestamp: registered ? timestamp : 0,
        submitter: registered ? submitter : null,
      },
      200,
      corsHeaders(ALLOW_ORIGIN)
    );
  } catch (e) {
    const msg = String(e?.shortMessage || e?.message || e);

    // ✅ Viktigt: revert/no data => INTE registrerad (helt normalt)
    if (looksLikeNotRegisteredError(msg)) {
      return json(
        {
          ok: true,
          hashHex: hash,
          registered: false,
          timestamp: 0,
          submitter: null,
        },
        200,
        corsHeaders(ALLOW_ORIGIN)
      );
    }

    // Riktigt tekniskt fel
    return json(
      {
        ok: false,
        error: msg,
        userMessage: "Verifieringstjänsten är tillfälligt otillgänglig. Försök igen om en stund.",
      },
      500,
      corsHeaders(ALLOW_ORIGIN)
    );
  }
}
