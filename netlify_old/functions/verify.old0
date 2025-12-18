// netlify/functions/verify.mjs
import { createPublicClient, http, isHex, zeroAddress } from "viem";
import { polygonAmoy } from "viem/chains";

function json(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "GET,OPTIONS",
    },
    body: JSON.stringify(obj),
  };
}

function isBytes32Hash(h) {
  return typeof h === "string" && /^0x[a-fA-F0-9]{64}$/.test(h);
}

export const handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") return json(204, {});
    if (event.httpMethod !== "GET") return json(405, { ok: false, error: "Use GET" });

    const params = event.queryStringParameters || {};
    const hash = (params.hash || "").trim();
    const debug = (params.debug || "").trim() === "1";

    // Acceptera flera env-namn (för att undvika mismatch)
    const CONTRACT_ADDRESS =
      (process.env.PROOFY_CONTRACT_ADDRESS || "").trim() ||
      (process.env.CONTRACT_ADDRESS || "").trim() ||
      (process.env.VITE_PROOFY_CONTRACT_ADDRESS || "").trim();

    const RPC_URL =
      (process.env.AMOY_RPC_URL || "").trim() ||
      (process.env.POLYGON_AMOY_RPC_URL || "").trim() ||
      (process.env.RPC_URL || "").trim();

    if (debug) {
      return json(200, {
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
      return json(400, { ok: false, error: "Invalid hash. Expected bytes32 hex (0x + 64 hex)." });
    }

    if (!CONTRACT_ADDRESS) {
      return json(400, { ok: false, error: "Missing CONTRACT_ADDRESS" });
    }
    if (!RPC_URL) {
      return json(500, { ok: false, error: "Missing AMOY_RPC_URL in environment variables" });
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

      // viem kan ge array eller objekt beroende på version
      if (Array.isArray(res)) {
        timestamp = Number(res[0] ?? 0);
        submitter = res[1] ?? null;
      } else {
        timestamp = Number(res?.timestamp ?? 0);
        submitter = res?.submitter ?? null;
      }

      // “Finns” om timestamp>0 och submitter inte är 0x0
      if (timestamp > 0 && submitter && submitter !== zeroAddress) exists = true;
    } catch (e) {
      // Om kontraktet returnerar 0x/no data → tolka som “saknas”, INTE som krasch
      const msg = String(e?.shortMessage || e?.message || e);
      const looksLikeMissing =
        msg.includes("returned no data") ||
        msg.includes("(0x)") ||
        msg.toLowerCase().includes("execution reverted");

      if (!looksLikeMissing) {
        return json(500, { ok: false, error: msg });
      }
    }

    return json(200, {
      ok: true,
      hashHex: hash,
      exists,
      timestamp: exists ? timestamp : 0,
      submitter: exists ? submitter : null,
    });
  } catch (e) {
    return json(500, { ok: false, error: String(e?.message || e) });
  }
};
