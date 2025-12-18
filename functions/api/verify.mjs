// functions/api/verify.mjs
import { createPublicClient, http, isHex, zeroAddress } from "viem";

function json(statusCode, obj, origin) {
  return new Response(JSON.stringify(obj), {
    status: statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": origin || "*",
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "GET,OPTIONS",
    },
  });
}

function isBytes32Hash(h) {
  return typeof h === "string" && /^0x[a-fA-F0-9]{64}$/.test(h);
}

function pickAllowOrigin(request, env) {
  const configured = (env?.ALLOW_ORIGIN || "").trim();
  if (configured) return configured;
  return "*";
}

// Lokal chain-definition (slipper "viem/chains")
function amoyChain(rpcUrl) {
  return {
    id: 80002,
    name: "Polygon Amoy",
    network: "polygon-amoy",
    nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18 },
    rpcUrls: {
      default: { http: [rpcUrl] },
      public: { http: [rpcUrl] },
    },
  };
}

export async function onRequest(context) {
  const { request, env } = context;
  const origin = pickAllowOrigin(request, env);

  try {
    if (request.method === "OPTIONS") return json(204, {}, origin);
    if (request.method !== "GET") return json(405, { ok: false, error: "Use GET" }, origin);

    const url = new URL(request.url);
    const hash = (url.searchParams.get("hash") || "").trim();
    const debug = (url.searchParams.get("debug") || "").trim() === "1";

    const CONTRACT_ADDRESS =
      (env?.PROOFY_CONTRACT_ADDRESS || "").trim() ||
      (env?.CONTRACT_ADDRESS || "").trim() ||
      (env?.VITE_PROOFY_CONTRACT_ADDRESS || "").trim();

    const RPC_URL =
      (env?.AMOY_RPC_URL || "").trim() ||
      (env?.POLYGON_AMOY_RPC_URL || "").trim() ||
      (env?.RPC_URL || "").trim();

    if (debug) {
      return json(
        200,
        {
          ok: true,
          debug: true,
          hasHash: !!hash,
          hasContractAddress: !!CONTRACT_ADDRESS,
          hasRpcUrl: !!RPC_URL,
          contractAddressLooksValid:
            isHex(CONTRACT_ADDRESS || "0x") && (CONTRACT_ADDRESS || "").length === 42,
          rpcUrlStartsWithHttps: (RPC_URL || "").startsWith("https://"),
        },
        origin
      );
    }

    if (!isBytes32Hash(hash)) {
      return json(400, { ok: false, error: "Invalid hash. Expected bytes32 hex (0x + 64 hex)." }, origin);
    }
    if (!CONTRACT_ADDRESS) return json(400, { ok: false, error: "Missing CONTRACT_ADDRESS" }, origin);
    if (!RPC_URL) return json(500, { ok: false, error: "Missing AMOY_RPC_URL in environment variables" }, origin);

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
      chain: amoyChain(RPC_URL),
      transport: http(RPC_URL),
    });

    let exists = false;
    let timestamp = 0;
    let submitter = null;

    try {
      const res = await client.readContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: "getProof",
        args: [hash],
      });

      if (Array.isArray(res)) {
        timestamp = Number(res[0] ?? 0);
        submitter = res[1] ?? null;
      } else {
        timestamp = Number(res?.timestamp ?? 0);
        submitter = res?.submitter ?? null;
      }

      if (timestamp > 0 && submitter && submitter !== zeroAddress) exists = true;
    } catch (e) {
      const msg = String(e?.shortMessage || e?.message || e);
      const looksLikeMissing =
        msg.includes("returned no data") ||
        msg.includes("(0x)") ||
        msg.toLowerCase().includes("execution reverted");

      if (!looksLikeMissing) {
        return json(500, { ok: false, error: msg }, origin);
      }
    }

    return json(
      200,
      {
        ok: true,
        hashHex: hash,
        exists,
        timestamp: exists ? timestamp : 0,
        submitter: exists ? submitter : null,
      },
      origin
    );
  } catch (e) {
    return json(500, { ok: false, error: String(e?.message || e) }, origin);
  }
}
