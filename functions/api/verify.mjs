// functions/api/verify.mjs
import { createPublicClient, http, isHex, zeroAddress } from "viem";
import { polygonAmoy } from "viem/chains";

function corsHeaders(env) {
  const allowOrigin = (env?.ALLOW_ORIGIN || "*").trim() || "*";
  return {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": allowOrigin,
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,OPTIONS",
  };
}

function json(status, obj, env) {
  return new Response(JSON.stringify(obj), { status, headers: corsHeaders(env) });
}

function isBytes32Hash(h) {
  return typeof h === "string" && /^0x[a-fA-F0-9]{64}$/.test(h);
}

export default async function onRequest({ request, env }) {
  try {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(env) });
    if (request.method !== "GET") return json(405, { ok: false, error: "Use GET" }, env);

    const url = new URL(request.url);
    const hash = (url.searchParams.get("hash") || "").trim();
    const debug = (url.searchParams.get("debug") || "").trim() === "1";

    const CONTRACT_ADDRESS =
      (env?.PROOFY_CONTRACT_ADDRESS || "").trim() ||
      (env?.CONTRACT_ADDRESS || "").trim();

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
          contractAddressLooksValid: isHex(CONTRACT_ADDRESS || "0x") && (CONTRACT_ADDRESS || "").length === 42,
          rpcUrlStartsWithHttps: (RPC_URL || "").startsWith("https://"),
        },
        env
      );
    }

    if (!isBytes32Hash(hash)) {
      return json(400, { ok: false, error: "Invalid hash. Expected bytes32 hex (0x + 64 hex)." }, env);
    }
    if (!CONTRACT_ADDRESS) return json(500, { ok: false, error: "Missing CONTRACT_ADDRESS" }, env);
    if (!RPC_URL) return json(500, { ok: false, error: "Missing AMOY_RPC_URL" }, env);

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

      // Finns om timestamp > 0 och submitter != 0x0
      if (timestamp > 0 && submitter && submitter !== zeroAddress) exists = true;
    } catch (e) {
      // Viktigt: många kontrakt "revertar" för okänd hash.
      // Det ska INTE räknas som tekniskt fel, utan som "saknas".
      const msg = String(e?.shortMessage || e?.message || e);
      const m = msg.toLowerCase();
      const treatAsMissing =
        m.includes("revert") ||
        m.includes("execution reverted") ||
        m.includes("returned no data") ||
        m.includes("(0x)");

      if (!treatAsMissing) {
        return json(500, { ok: false, error: msg }, env);
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
      env
    );
  } catch (e) {
    return json(500, { ok: false, error: String(e?.message || e) }, env);
  }
}
