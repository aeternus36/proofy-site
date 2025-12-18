// netlify/functions/register.mjs
import {
  createPublicClient,
  createWalletClient,
  http,
  isHex,
  zeroAddress,
  privateKeyToAccount,
} from "viem";
import { polygonAmoy } from "viem/chains";

const CONTRACT_ADDRESS =
  process.env.PROOFY_CONTRACT_ADDRESS || process.env.CONTRACT_ADDRESS || "";

const RPC_URL =
  process.env.AMOY_RPC_URL || process.env.RPC_URL || "";

// Viktigt: tillåt både PROOFY_PRIVATE_KEY och PRIVATE_KEY (så du slipper strul)
const PRIVATE_KEY =
  process.env.PROOFY_PRIVATE_KEY || process.env.PRIVATE_KEY || "";

// ABI: vi behöver read (getProof) + write (någon register-funktion).
// getProof ska matcha ditt kontrakt (timestamp + submitter).
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

  // Vi lägger in flera vanliga skriv-funktioner.
  // Vi kommer testa dem i tur och ordning via simulateContract().
  {
    type: "function",
    name: "register",
    stateMutability: "nonpayable",
    inputs: [{ name: "hash", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "registerHash",
    stateMutability: "nonpayable",
    inputs: [{ name: "hash", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "addProof",
    stateMutability: "nonpayable",
    inputs: [{ name: "hash", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "storeProof",
    stateMutability: "nonpayable",
    inputs: [{ name: "hash", type: "bytes32" }],
    outputs: [],
  },
];

function json(statusCode, obj) {
  return new Response(JSON.stringify(obj), {
    status: statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
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

async function readExists(publicClient, hash) {
  // Returnerar { exists, timestamp, submitter } där revert/no data => exists=false
  try {
    const res = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: ABI,
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
    return {
      exists,
      timestamp: exists ? ts : 0,
      submitter: exists ? sub : null,
    };
  } catch (e) {
    const msg = String(e?.shortMessage || e?.message || e);
    if (looksLikeNotFoundError(msg)) {
      return { exists: false, timestamp: 0, submitter: null };
    }
    throw e;
  }
}

export default async (request) => {
  try {
    if (request.method === "OPTIONS") return json(204, {});
    if (request.method !== "POST") return json(405, { ok: false, error: "Use POST" });

    const body = await request.json().catch(() => ({}));
    const hash = (body?.hash || "").trim();

    if (!isBytes32Hash(hash)) {
      return json(400, { ok: false, error: "Invalid hash. Expected bytes32 hex (0x + 64 hex)." });
    }
    if (!CONTRACT_ADDRESS) {
      return json(500, { ok: false, error: "Missing PROOFY_CONTRACT_ADDRESS" });
    }
    if (!RPC_URL) {
      return json(500, { ok: false, error: "Missing AMOY_RPC_URL" });
    }
    if (!PRIVATE_KEY) {
      return json(500, { ok: false, error: "Missing PROOFY_PRIVATE_KEY" });
    }
    if (!/^0x[a-fA-F0-9]{64}$/.test(PRIVATE_KEY)) {
      return json(400, { ok: false, error: "Invalid private key format. Must be 0x + 64 hex." });
    }

    const publicClient = createPublicClient({
      chain: polygonAmoy,
      transport: http(RPC_URL),
    });

    // 1) Kolla om redan finns (så UI kan säga “Redan registrerad” utan att faila på revert)
    const existing = await readExists(publicClient, hash);
    if (existing.exists) {
      return json(200, {
        ok: true,
        alreadyExists: true,
        hashHex: hash,
        timestamp: existing.timestamp,
        submitter: existing.submitter,
      });
    }

    // 2) Skriv transaktion
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
      } catch (e) {
        // prova nästa
      }
    }

    if (!chosenFn || !sim) {
      return json(500, {
        ok: false,
        error:
          "Could not simulate any register function on contract. Check function name / ABI.",
      });
    }

    const txHash = await walletClient.writeContract(sim.request);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    return json(200, {
      ok: true,
      alreadyExists: false,
      hashHex: hash,
      txHash,
      blockNumber: Number(receipt.blockNumber),
      functionUsed: chosenFn,
    });
  } catch (e) {
    const msg = String(e?.shortMessage || e?.message || e);
    return json(500, { ok: false, error: msg });
  }
};
