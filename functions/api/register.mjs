import {
  createPublicClient,
  createWalletClient,
  http,
  isHex,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygonAmoy } from "viem/chains";

function corsHeaders(env) {
  const allowOrigin = (env?.ALLOW_ORIGIN || "*").trim();
  return {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": allowOrigin,
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "POST,OPTIONS",
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
  return (
    m.includes("returned no data") ||
    m.includes("no data") ||
    m.includes("(0x)") ||
    m.includes("execution reverted") ||
    m.includes("reverted") ||
    m.includes("missing revert data")
  );
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
    if (looksLikeNotFound(msg)) return { exists: false, timestamp: 0, submitter: null };
    throw e;
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const CONTRACT_ADDRESS =
      (env.PROOFY_CONTRACT_ADDRESS || "").trim() ||
      (env.CONTRACT_ADDRESS || "").trim() ||
      (env.VITE_PROOFY_CONTRACT_ADDRESS || "").trim();

    const RPC_URL =
      (env.AMOY_RPC_URL || "").trim() ||
      (env.POLYGON_AMOY_RPC_URL || "").trim() ||
      (env.RPC_URL || "").trim();

    const PRIVATE_KEY =
      (env.PROOFY_PRIVATE_KEY || "").trim() ||
      (env.PRIVATE_KEY || "").trim();

    const body = await request.json().catch(() => ({}));
    const hash = (body?.hash || "").trim();

    if (!isBytes32Hash(hash)) {
      return json(env, 400, { ok: false, error: "Invalid hash. Expected bytes32 hex (0x + 64 hex)." });
    }
    if (!CONTRACT_ADDRESS || !isHex(CONTRACT_ADDRESS) || CONTRACT_ADDRESS.length !== 42) {
      return json(env, 500, { ok: false, error: "Missing/invalid CONTRACT_ADDRESS" });
    }
    if (!RPC_URL) {
      return json(env, 500, { ok: false, error: "Missing AMOY_RPC_URL" });
    }
    if (!PRIVATE_KEY) {
      return json(env, 500, { ok: false, error: "Missing PROOFY_PRIVATE_KEY" });
    }
    if (!/^0x[a-fA-F0-9]{64}$/.test(PRIVATE_KEY)) {
      return json(env, 400, { ok: false, error: "Invalid private key format. Must be 0x + 64 hex." });
    }

    // ABI: getProof + kandidater för write
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
      chain: polygonAmoy,
      transport: http(RPC_URL),
    });

    // 1) Om den redan finns — returnera redan registrerad
    const existing = await readExists(publicClient, CONTRACT_ADDRESS, ABI, hash);
    if (existing.exists) {
      return json(env, 200, {
        ok: true,
        alreadyExists: true,
        hashHex: hash,
        timestamp: existing.timestamp,
        submitter: existing.submitter,
      });
    }

    // 2) Skriv tx
    const account = privateKeyToAccount(PRIVATE_KEY);
    const walletClient = createWalletClient({
      account,
      chain: polygonAmoy,
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
      return json(env, 500, {
        ok: false,
        error:
          "Could not simulate any register function (register/registerHash/addProof/storeProof). Contract ABI/function name mismatch.",
      });
    }

    const txHash = await walletClient.writeContract(sim.request);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    return json(env, 200, {
      ok: true,
      alreadyExists: false,
      hashHex: hash,
      txHash,
      blockNumber: Number(receipt.blockNumber),
      functionUsed: chosenFn,
    });
  } catch (e) {
    const msg = String(e?.shortMessage || e?.message || e);
    return json(env, 500, { ok: false, error: msg });
  }
}

export function onRequestOptions({ env }) {
  return new Response(null, { status: 204, headers: corsHeaders(env) });
}
