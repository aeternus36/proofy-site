// functions/api/register.mjs
import { createPublicClient, createWalletClient, http, zeroAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";

function pickAllowOrigin(env) {
  const v = (env?.ALLOW_ORIGIN || "").trim();
  return v || "*";
}

function corsHeaders(origin, methods) {
  return {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": origin,
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": methods,
  };
}

function json(status, obj, origin, methods) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: corsHeaders(origin, methods),
  });
}

function isBytes32Hash(h) {
  return typeof h === "string" && /^0x[a-fA-F0-9]{64}$/.test(h);
}

function softErrorMessage(msg) {
  const m = String(msg || "");

  if (m.includes("Missing CONTRACT_ADDRESS")) return "Tjänsten saknar kontraktsadress och kan inte registrera just nu.";
  if (m.includes("Missing AMOY_RPC_URL")) return "Tjänsten saknar RPC-konfiguration och kan inte registrera just nu.";
  if (m.includes("Missing PROOFY_PRIVATE_KEY")) return "Registrering är inte aktiverad på servern just nu.";
  if (m.includes("REGISTER_FUNCTION")) return "Registreringstjänsten är inte färdigkonfigurerad ännu.";
  if (m.includes("REGISTER_ABI_JSON")) return "Registreringstjänsten är inte färdigkonfigurerad ännu.";

  return "Registreringstjänsten är tillfälligt otillgänglig. Försök igen om en stund.";
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

function looksLikeNotFoundError(msg) {
  const m = (msg || "").toLowerCase();
  return (
    m.includes("returned no data") ||
    m.includes("(0x)") ||
    m.includes("execution reverted") ||
    m.includes("reverted")
  );
}

async function readExists(publicClient, contractAddress, hash) {
  const ABI_READ = [
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

  try {
    const res = await publicClient.readContract({
      address: contractAddress,
      abi: ABI_READ,
      functionName: "getProof",
      args: [hash],
    });

    let ts, sub;
    if (Array.isArray(res)) {
      ts = Number(res[0] ?? 0);
      sub = res[1] ?? null;
    } else {
      ts = Number(res?.timestamp ?? 0);
      sub = res?.submitter ?? null;
    }

    const exists = ts > 0 && sub && sub !== zeroAddress;
    return { exists, timestamp: exists ? ts : 0, submitter: exists ? sub : null };
  } catch (e) {
    const msg = String(e?.shortMessage || e?.message || e);
    if (looksLikeNotFoundError(msg)) return { exists: false, timestamp: 0, submitter: null };
    throw e;
  }
}

function parseRegisterAbi(env) {
  const raw = (env?.REGISTER_ABI_JSON || "").trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  const origin = pickAllowOrigin(env);

  try {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin, "POST,OPTIONS") });
    if (request.method !== "POST") return json(405, { ok: false, error: "Use POST" }, origin, "POST,OPTIONS");

    const url = new URL(request.url);
    const debug = (url.searchParams.get("debug") || "").trim() === "1";

    const CONTRACT_ADDRESS =
      (env?.PROOFY_CONTRACT_ADDRESS || "").trim() ||
      (env?.CONTRACT_ADDRESS || "").trim() ||
      (env?.VITE_PROOFY_CONTRACT_ADDRESS || "").trim();

    const RPC_URL =
      (env?.AMOY_RPC_URL || "").trim() ||
      (env?.POLYGON_AMOY_RPC_URL || "").trim() ||
      (env?.RPC_URL || "").trim();

    const PRIVATE_KEY =
      (env?.PROOFY_PRIVATE_KEY || "").trim() ||
      (env?.PRIVATE_KEY || "").trim();

    const REGISTER_FUNCTION = (env?.REGISTER_FUNCTION || "").trim();
    const REGISTER_ABI = parseRegisterAbi(env);

    if (debug) {
      return json(
        200,
        {
          ok: true,
          debug: true,
          hasContractAddress: !!CONTRACT_ADDRESS,
          hasRpcUrl: !!RPC_URL,
          hasPrivateKey: !!PRIVATE_KEY,
          hasRegisterFunction: !!REGISTER_FUNCTION,
          hasRegisterAbiJson: !!(env?.REGISTER_ABI_JSON || "").trim(),
          registerAbiParsed: Array.isArray(REGISTER_ABI),
        },
        origin,
        "POST,OPTIONS"
      );
    }

    if (!CONTRACT_ADDRESS) return json(500, { ok: false, error: "Missing CONTRACT_ADDRESS", userMessage: softErrorMessage("Missing CONTRACT_ADDRESS") }, origin, "POST,OPTIONS");
    if (!RPC_URL) return json(500, { ok: false, error: "Missing AMOY_RPC_URL", userMessage: softErrorMessage("Missing AMOY_RPC_URL") }, origin, "POST,OPTIONS");
    if (!PRIVATE_KEY) return json(500, { ok: false, error: "Missing PROOFY_PRIVATE_KEY", userMessage: softErrorMessage("Missing PROOFY_PRIVATE_KEY") }, origin, "POST,OPTIONS");

    if (!/^0x[a-fA-F0-9]{64}$/.test(PRIVATE_KEY)) {
      return json(400, { ok: false, error: "Invalid private key format. Must be 0x + 64 hex.", userMessage: "Serverkonfigurationen för registrering är felaktig." }, origin, "POST,OPTIONS");
    }

    // Här är vi strikt “inga gissningar”
    if (!REGISTER_FUNCTION) {
      return json(
        500,
        { ok: false, error: "Missing REGISTER_FUNCTION", userMessage: softErrorMessage("REGISTER_FUNCTION") },
        origin,
        "POST,OPTIONS"
      );
    }
    if (!REGISTER_ABI) {
      return json(
        500,
        { ok: false, error: "Missing/invalid REGISTER_ABI_JSON", userMessage: softErrorMessage("REGISTER_ABI_JSON") },
        origin,
        "POST,OPTIONS"
      );
    }

    const body = await request.json().catch(() => ({}));
    const hash = (body?.hash || "").trim();

    if (!isBytes32Hash(hash)) {
      return json(400, { ok: false, error: "Invalid hash. Expected bytes32 hex (0x + 64 hex)." }, origin, "POST,OPTIONS");
    }

    const publicClient = createPublicClient({
      chain: amoyChain(RPC_URL),
      transport: http(RPC_URL),
    });

    // 1) Om redan finns: svara lugnt och deterministiskt
    const existing = await readExists(publicClient, CONTRACT_ADDRESS, hash);
    if (existing.exists) {
      return json(
        200,
        {
          ok: true,
          alreadyExists: true,
          hashHex: hash,
          timestamp: existing.timestamp,
          submitter: existing.submitter,
        },
        origin,
        "POST,OPTIONS"
      );
    }

    // 2) Skriv transaktion
    const account = privateKeyToAccount(PRIVATE_KEY);

    const walletClient = createWalletClient({
      account,
      chain: amoyChain(RPC_URL),
      transport: http(RPC_URL),
    });

    // Simulera -> skriv -> vänta kvitto (revisionsvänligt, stabilt)
    const sim = await publicClient.simulateContract({
      address: CONTRACT_ADDRESS,
      abi: REGISTER_ABI,
      functionName: REGISTER_FUNCTION,
      args: [hash],
      account,
    });

    const txHash = await walletClient.writeContract(sim.request);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    return json(
      200,
      {
        ok: true,
        alreadyExists: false,
        hashHex: hash,
        txHash,
        blockNumber: Number(receipt.blockNumber),
        functionUsed: REGISTER_FUNCTION,
      },
      origin,
      "POST,OPTIONS"
    );
  } catch (e) {
    const msg = String(e?.shortMessage || e?.message || e);
    return json(500, { ok: false, error: msg, userMessage: softErrorMessage(msg) }, origin, "POST,OPTIONS");
  }
}
