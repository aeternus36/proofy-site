
// functions/api/register.mjs
import { createPublicClient, createWalletClient, http, zeroAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygonAmoy } from "viem/chains";

function isBytes32Hash(h) {
  return typeof h === "string" && /^0x[a-fA-F0-9]{64}$/.test(h);
}

function json(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

function corsHeaders(origin) {
  return {
    "access-control-allow-origin": origin || "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "POST,OPTIONS",
  };
}

function looksLikeNotRegisteredError(msg) {
  const m = (msg || "").toLowerCase();
  return (
    m.includes("execution reverted") ||
    m.includes("reverted") ||
    m.includes("returned no data") ||
    m.includes("(0x)")
  );
}

async function readExists(publicClient, CONTRACT_ADDRESS, hash) {
  const ABI_VIEW = [
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
      address: CONTRACT_ADDRESS,
      abi: ABI_VIEW,
      functionName: "getProof",
      args: [hash],
    });

    let timestamp = 0;
    let submitter = null;

    if (Array.isArray(res)) {
      timestamp = Number(res[0] ?? 0);
      submitter = res[1] ?? null;
    } else {
      timestamp = Number(res?.timestamp ?? 0);
      submitter = res?.submitter ?? null;
    }

    const exists = timestamp > 0 && submitter && submitter !== zeroAddress;

    return {
      exists,
      timestamp: exists ? timestamp : 0,
      submitter: exists ? submitter : null,
    };
  } catch (e) {
    const msg = String(e?.shortMessage || e?.message || e);
    if (looksLikeNotRegisteredError(msg)) {
      return { exists: false, timestamp: 0, submitter: null };
    }
    throw e;
  }
}

export async function onRequest(context) {
  const { request, env } = context;

  const ALLOW_ORIGIN = (env.ALLOW_ORIGIN || "*").trim();

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(ALLOW_ORIGIN) });
  }
  if (request.method !== "POST") {
    return json(
      { ok: false, error: "Use POST" },
      405,
      corsHeaders(ALLOW_ORIGIN)
    );
  }

  const CONTRACT_ADDRESS =
    (env.PROOFY_CONTRACT_ADDRESS || "").trim() ||
    (env.CONTRACT_ADDRESS || "").trim();

  const RPC_URL =
    (env.AMOY_RPC_URL || "").trim() ||
    (env.POLYGON_AMOY_RPC_URL || "").trim() ||
    (env.RPC_URL || "").trim();

  const PRIVATE_KEY =
    (env.PROOFY_PRIVATE_KEY || "").trim() ||
    (env.PRIVATE_KEY || "").trim();

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const hash = (body?.hash || "").trim();

  if (!isBytes32Hash(hash)) {
    return json(
      { ok: false, error: "Invalid hash. Expected bytes32 hex (0x + 64 hex)." },
      400,
      corsHeaders(ALLOW_ORIGIN)
    );
  }

  if (!CONTRACT_ADDRESS) {
    return json(
      { ok: false, error: "Missing CONTRACT_ADDRESS/PROOFY_CONTRACT_ADDRESS" },
      500,
      corsHeaders(ALLOW_ORIGIN)
    );
  }
  if (!RPC_URL) {
    return json(
      { ok: false, error: "Missing AMOY_RPC_URL" },
      500,
      corsHeaders(ALLOW_ORIGIN)
    );
  }
  if (!/^0x[a-fA-F0-9]{64}$/.test(PRIVATE_KEY)) {
    return json(
      { ok: false, error: "Missing or invalid PROOFY_PRIVATE_KEY (must be 0x + 64 hex)" },
      500,
      corsHeaders(ALLOW_ORIGIN)
    );
  }

  const publicClient = createPublicClient({
    chain: polygonAmoy,
    transport: http(RPC_URL),
  });

  // 1) Om redan registrerad ⇒ returnera tydligt (ingen “tekniskt problem”)
  try {
    const existing = await readExists(publicClient, CONTRACT_ADDRESS, hash);
    if (existing.exists) {
      return json(
        {
          ok: true,
          alreadyExists: true,
          hashHex: hash,
          timestamp: existing.timestamp,
          submitter: existing.submitter,
        },
        200,
        corsHeaders(ALLOW_ORIGIN)
      );
    }
  } catch (e) {
    const msg = String(e?.shortMessage || e?.message || e);
    return json(
      {
        ok: false,
        error: msg,
        userMessage: "Registreringstjänsten är tillfälligt otillgänglig. Försök igen senare.",
      },
      500,
      corsHeaders(ALLOW_ORIGIN)
    );
  }

  // 2) Försök registrera via en av dessa funktionsnamn
  const ABI = [
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
    } catch {
      // prova nästa
    }
  }

  if (!chosenFn || !sim) {
    return json(
      {
        ok: false,
        error: "No compatible register function found on contract (simulate failed).",
        userMessage: "Kontraktet kunde inte registrera detta hashvärde (kontrollera ABI/funktionsnamn).",
      },
      500,
      corsHeaders(ALLOW_ORIGIN)
    );
  }

  try {
    const txHash = await walletClient.writeContract(sim.request);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    return json(
      {
        ok: true,
        alreadyExists: false,
        hashHex: hash,
        txHash,
        functionUsed: chosenFn,
        // undvik BigInt i JSON
        blockNumber: receipt?.blockNumber ? Number(receipt.blockNumber) : null,
      },
      200,
      corsHeaders(ALLOW_ORIGIN)
    );
  } catch (e) {
    const msg = String(e?.shortMessage || e?.message || e);

    return json(
      {
        ok: false,
        error: msg,
        userMessage:
          "Registreringen kunde inte genomföras. Kontrollera att registreringsnyckeln har rätt behörighet och att hash inte redan är registrerad.",
      },
      400,
      corsHeaders(ALLOW_ORIGIN)
    );
  }
}
