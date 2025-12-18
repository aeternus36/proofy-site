// functions/api/register.mjs
import { createPublicClient, createWalletClient, http, zeroAddress } from "viem";
import { polygonAmoy } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

function corsHeaders(env) {
  const allowOrigin = (env?.ALLOW_ORIGIN || "*").trim() || "*";
  return {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": allowOrigin,
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "POST,OPTIONS",
  };
}

function json(status, obj, env) {
  return new Response(JSON.stringify(obj), { status, headers: corsHeaders(env) });
}

function isBytes32Hash(h) {
  return typeof h === "string" && /^0x[a-fA-F0-9]{64}$/.test(h);
}

function looksLikeMissingOrKnownRevert(msg) {
  const m = (msg || "").toLowerCase();
  return (
    m.includes("returned no data") ||
    m.includes("(0x)") ||
    m.includes("execution reverted") ||
    m.includes("revert")
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
    if (looksLikeMissingOrKnownRevert(msg)) {
      return { exists: false, timestamp: 0, submitter: null };
    }
    throw e;
  }
}

export default async function onRequest({ request, env }) {
  try {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(env) });
    if (request.method !== "POST") return json(405, { ok: false, error: "Use POST" }, env);

    const body = await request.json().catch(() => ({}));
    const hash = (body?.hash || "").trim();

    const CONTRACT_ADDRESS =
      (env?.PROOFY_CONTRACT_ADDRESS || "").trim() ||
      (env?.CONTRACT_ADDRESS || "").trim();

    const RPC_URL =
      (env?.AMOY_RPC_URL || "").trim() ||
      (env?.POLYGON_AMOY_RPC_URL || "").trim() ||
      (env?.RPC_URL || "").trim();

    const PRIVATE_KEY =
      (env?.PROOFY_PRIVATE_KEY || "").trim() ||
      (env?.PRIVATE_KEY || "").trim();

    if (!isBytes32Hash(hash)) {
      return json(400, { ok: false, error: "Invalid hash. Expected bytes32 hex (0x + 64 hex)." }, env);
    }
    if (!CONTRACT_ADDRESS) return json(500, { ok: false, error: "Missing CONTRACT_ADDRESS" }, env);
    if (!RPC_URL) return json(500, { ok: false, error: "Missing AMOY_RPC_URL" }, env);
    if (!PRIVATE_KEY) return json(500, { ok: false, error: "Missing PROOFY_PRIVATE_KEY" }, env);
    if (!/^0x[a-fA-F0-9]{64}$/.test(PRIVATE_KEY)) {
      return json(400, { ok: false, error: "Invalid private key format. Must be 0x + 64 hex." }, env);
    }

    const publicClient = createPublicClient({
      chain: polygonAmoy,
      transport: http(RPC_URL),
    });

    // 1) Om redan finns -> returnera det (ingen ny tx behövs)
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
        env
      );
    }

    // 2) Skriv transaktion
    const account = privateKeyToAccount(PRIVATE_KEY);
    const walletClient = createWalletClient({
      account,
      chain: polygonAmoy,
      transport: http(RPC_URL),
    });

    // Vi testar vanliga funktionsnamn. Du behöver inte veta vilket ditt kontrakt använder.
    const ABI_WRITE = [
      { type: "function", name: "register", stateMutability: "nonpayable", inputs: [{ name: "hash", type: "bytes32" }], outputs: [] },
      { type: "function", name: "registerHash", stateMutability: "nonpayable", inputs: [{ name: "hash", type: "bytes32" }], outputs: [] },
      { type: "function", name: "addProof", stateMutability: "nonpayable", inputs: [{ name: "hash", type: "bytes32" }], outputs: [] },
      { type: "function", name: "storeProof", stateMutability: "nonpayable", inputs: [{ name: "hash", type: "bytes32" }], outputs: [] },
    ];

    const candidates = ["register", "registerHash", "addProof", "storeProof"];

    let chosenFn = null;
    let sim = null;

    for (const fn of candidates) {
      try {
        sim = await publicClient.simulateContract({
          address: CONTRACT_ADDRESS,
          abi: ABI_WRITE,
          functionName: fn,
          args: [hash],
          account,
        });
        chosenFn = fn;
        break;
      } catch (e) {
        // prova nästa
      }
    }

    if (!chosenFn || !sim) {
      return json(
        500,
        {
          ok: false,
          error: "Could not simulate any register function. Check contract ABI / function name.",
        },
        env
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
      env
    );
  } catch (e) {
    const msg = String(e?.shortMessage || e?.message || e);
    return json(500, { ok: false, error: msg }, env);
  }
}
