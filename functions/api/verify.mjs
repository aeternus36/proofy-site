import { createPublicClient, http, isHex, zeroAddress } from "viem";
import { polygonAmoy } from "viem/chains";

function corsHeaders(env) {
  const allowOrigin = (env?.ALLOW_ORIGIN || "*").trim();
  return {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": allowOrigin,
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,OPTIONS",
  };
}

function json(env, status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: corsHeaders(env),
  });
}

function isBytes32Hash(h) {
  return typeof h === "string" && /^0x[a-fA-F0-9]{64}$/.test(h);
}

function looksLikeNotFound(msg) {
  const m = String(msg || "").toLowerCase();
  // Dessa är vanliga “inte hittad” / “revert” / “no data”-varianter.
  return (
    m.includes("returned no data") ||
    m.includes("no data") ||
    m.includes("(0x)") ||
    m.includes("execution reverted") ||
    m.includes("reverted") ||
    m.includes("missing revert data")
  );
}

export async function onRequestGet({ request, env }) {
  try {
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
      return json(env, 200, {
        ok: true,
        debug: true,
        hasHash: !!hash,
        hasContractAddress: !!CONTRACT_ADDRESS,
        hasRpcUrl: !!RPC_URL,
        contractAddressLooksValid:
          isHex(CONTRACT_ADDRESS || "0x") && (CONTRACT_ADDRESS || "").length === 42,
        rpcUrlStartsWithHttps: (RPC_URL || "").startsWith("https://"),
      });
    }

    if (!isBytes32Hash(hash)) {
      return json(env, 400, {
        ok: false,
        error: "Invalid hash. Expected bytes32 hex (0x + 64 hex).",
      });
    }

    if (!CONTRACT_ADDRESS) {
      return json(env, 500, { ok: false, error: "Missing CONTRACT_ADDRESS" });
    }
    if (!RPC_URL) {
      return json(env, 500, { ok: false, error: "Missing AMOY_RPC_URL" });
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

      // Finns om timestamp>0 och submitter != 0x0
      if (timestamp > 0 && submitter && submitter !== zeroAddress) {
        exists = true;
      }
    } catch (e) {
      const msg = String(e?.shortMessage || e?.message || e);

      // ★ Bombsäker: revert/no-data => tolka som “ej registrerad” (ok:true)
      if (looksLikeNotFound(msg)) {
        return json(env, 200, {
          ok: true,
          hashHex: hash,
          exists: false,
          timestamp: 0,
          submitter: null,
        });
      }

      // Annars är det ett riktigt fel
      return json(env, 500, { ok: false, error: msg });
    }

    return json(env, 200, {
      ok: true,
      hashHex: hash,
      exists,
      timestamp: exists ? timestamp : 0,
      submitter: exists ? submitter : null,
    });
  } catch (e) {
    return json(env, 500, { ok: false, error: String(e?.message || e) });
  }
}

export function onRequestOptions({ env }) {
  return new Response(null, { status: 204, headers: corsHeaders(env) });
}
