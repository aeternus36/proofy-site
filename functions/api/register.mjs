// functions/api/register.mjs
import { createPublicClient, createWalletClient, http, zeroAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";

function pickAllowOrigin(env) {
  const configured = (env?.ALLOW_ORIGIN || "").trim();
  return configured || "*";
}

function json(statusCode, obj, origin) {
  return new Response(JSON.stringify(obj), {
    status: statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": origin || "*",
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "POST,OPTIONS",
    },
  });
}

function isBytes32Hash(h) {
  return typeof h === "string" && /^0x[a-fA-F0-9]{64}$/.test(h);
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

async function readExists(publicClient, contractAddress, abi, hash) {
  try {
    const res = await publicClient.readContract({
      address: contractAddress,
      abi,
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

export async function onRequest(context) {
  const { request, env } = context;
  const origin = pickAllowOrigin(env);

  try {
    if (request.method === "OPTIONS") return json(204, {}, origin);
    if (request.method !== "POST") return json(405, { ok: false, error: "Use POST" }, origin);

    const body = await request.json().catch(() => ({}));
    const hash = (body?.hash || "").trim();

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

    if (!isBytes32Hash(hash)) {
      return json(400, { ok: false, error: "Invalid hash. Expected bytes32 hex (0x + 64 hex)." }, origin);
    }
    if (!CONTRACT_ADDRESS) return json(500, { ok: false, error: "Missing CONTRACT_ADDRESS" }, origin);
    if (!RPC_URL) return json(500, { ok: false, error: "Missing AMOY_RPC_URL" }, origin);
    if (!PRIVATE_KEY) return json(500, { ok: false, error: "Missing PROOFY_PRIVATE_KEY" }, origin);
    if (!/^0x[a-fA-F0-9]{64}$/.test(PRIVATE_KEY)) {
      return json(400, { ok: false, error: "Invalid private key format. Must be 0x + 64 hex." }, origin);
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
      { type: "function", name: "register", stateMutability: "nonpayable", inputs: [{ name: "hash", type: "bytes32" }], outputs: [] },
      { type: "function", name: "registerHash", stateMutability: "nonpayable", inputs: [{ name: "hash", type: "bytes32" }], outputs: [] },
      { type: "function", name: "addProof", stateMutability: "nonpayable", inputs: [{ name: "hash", type: "bytes32" }], outputs: [] },
      { type: "function", name: "storeProof", stateMutability: "nonpayable", inputs: [{ name: "hash", type: "bytes32" }], outputs: [] },
    ];

    const publicClient = createPublicClient({
      chain: amoyChain(RPC_URL),
      transport: http(RPC_URL),
    });

    const existing = await readExists(publicClient, CONTRACT_ADDRESS, ABI, hash);
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
        origin
      );
    }

    const account = privateKeyToAccount(PRIVATE_KEY);
    const walletClient = createWalletClient({
      account,
      chain: amoyChain(RPC_URL),
      transport: http(RPC_URL),
    });

    const candidates = ["register", "registerHash", "addProof", "storeProof"];

    let chosenFn = null;
    let sim = null;

    for (const fn of candidates) {
      try {
        sim = await publicClient.simulateContract({
          address: CONTRACT_ADDRESS,
          abi: ABI,
          functionName: fn,
          args: [hash],
          account,
        });
        chosenFn = fn;
        break;
      } catch (_) {
        // prova nästa
      }
    }

    if (!chosenFn || !sim) {
      return json(
        500,
        { ok: false, error: "Could not simulate any register function on contract. Check function name / ABI." },
        origin
      );
    }

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
        functionUsed: chosenFn,
      },
      origin
    );
  } catch (e) {
    const msg = String(e?.shortMessage || e?.message || e);
    return json(500, { ok: false, error: msg }, origin);
  }
}
