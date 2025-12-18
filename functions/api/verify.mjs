// functions/api/verify.mjs
import { createPublicClient, http, isHex, zeroAddress } from "viem";
import { polygonAmoy } from "viem/chains";

function corsHeaders(env) {
  const allow = (env?.ALLOW_ORIGIN || process.env.ALLOW_ORIGIN || "*").trim() || "*";
  return {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": allow,
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,OPTIONS",
  };
}

function json(env, status, obj) {
  return new Response(JSON.stringify(obj), { status, headers: corsHeaders(env) });
}

function getEnv(context, key) {
  return (context?.env?.[key] || process.env[key] || "").trim();
}

function isBytes32Hash(h) {
  return typeof h === "string" && /^0x[a-fA-F0-9]{64}$/.test(h);
}

function errorToText(e) {
  return String(e?.shortMessage || e?.message || e || "");
}

function looksLikeNotFoundOrRevert(msg) {
  const m = (msg || "").toLowerCase();
  // Viktigt: vissa kontrakt revert:ar vid "saknas" – det ska INTE bli driftstopp i UI.
  return (
    m.includes("reverted") ||
    m.includes("execution reverted") ||
    m.includes("returned no data") ||
    m.includes("call exception") ||
    m.includes("no data")
  );
}

export async function onRequest(context) {
  const { request } = context;

  try {
    if (request.method === "OPTIONS") return json(context.env, 204, {});
    if (request.method !== "GET") return json(context.env, 405, { ok: false, userMessage: "Metoden stöds inte." });

    const url = new URL(request.url);
    const hash = (url.searchParams.get("hash") || "").trim();
    const debug = (url.searchParams.get("debug") || "").trim() === "1";

    const CONTRACT_ADDRESS =
      getEnv(context, "CONTRACT_ADDRESS") ||
      getEnv(context, "PROOFY_CONTRACT_ADDRESS") ||
      getEnv(context, "VITE_PROOFY_CONTRACT_ADDRESS");

    const RPC_URL =
      getEnv(context, "AMOY_RPC_URL") ||
      getEnv(context, "POLYGON_AMOY_RPC_URL") ||
      getEnv(context, "RPC_URL");

    if (debug) {
      return json(context.env, 200, {
        ok: true,
        debug: true,
        hasHash: !!hash,
        hasContractAddress: !!CONTRACT_ADDRESS,
        hasRpcUrl: !!RPC_URL,
        contractAddressLooksValid: isHex(CONTRACT_ADDRESS || "0x") && (CONTRACT_ADDRESS || "").length === 42,
        rpcUrlStartsWithHttps: (RPC_URL || "").startsWith("https://"),
      });
    }

    if (!isBytes32Hash(hash)) {
      return json(context.env, 400, { ok: false, userMessage: "Ogiltig hash. Välj fil igen och försök på nytt." });
    }

    if (!CONTRACT_ADDRESS || !isHex(CONTRACT_ADDRESS) || CONTRACT_ADDRESS.length !== 42) {
      return json(context.env, 500, {
        ok: false,
        userMessage: "Verifieringstjänsten är inte korrekt konfigurerad just nu. Försök igen senare.",
      });
    }

    if (!RPC_URL || !(RPC_URL.startsWith("http://") || RPC_URL.startsWith("https://"))) {
      return json(context.env, 500, {
        ok: false,
        userMessage: "Verifieringstjänsten är inte korrekt konfigurerad just nu. Försök igen senare.",
      });
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

    // Default: saknas
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
      const msg = errorToText(e);

      // ✅ Viktig ändring: revert/no data tolkas som "saknas" (exists=false), inte som fel
      if (looksLikeNotFoundOrRevert(msg)) {
        exists = false;
        timestamp = 0;
        submitter = null;
      } else {
        // Riktigt fel (t.ex. RPC down) → lugnt meddelande
        return json(context.env, 500, {
          ok: false,
          error: msg,
          userMessage: "Verifieringstjänsten är tillfälligt otillgänglig. Försök igen om en stund.",
        });
      }
    }

    return json(context.env, 200, {
      ok: true,
      hashHex: hash,
      exists,
      timestamp: exists ? timestamp : 0,
      submitter: exists ? submitter : null,
    });
  } catch (e) {
    return json(context.env, 500, {
      ok: false,
      error: errorToText(e),
      userMessage: "Verifieringstjänsten är tillfälligt otillgänglig. Försök igen om en stund.",
    });
  }
}
