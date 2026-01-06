import {
  createPublicClient,
  createWalletClient,
  http,
  isHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygonAmoy } from "viem/chains";

/**
 * ABI som matchar ditt Solidity-kontrakt "Proofy" exakt.
 */
const PROOFY_ABI = [
  {
    type: "function",
    name: "registerIfMissing",
    stateMutability: "nonpayable",
    inputs: [{ name: "refId", type: "bytes32" }],
    outputs: [
      { name: "created", type: "bool" },
      { name: "ts", type: "uint64" },
    ],
  },
  {
    type: "function",
    name: "get",
    stateMutability: "view",
    inputs: [{ name: "refId", type: "bytes32" }],
    outputs: [
      { name: "ok", type: "bool" },
      { name: "ts", type: "uint64" },
    ],
  },
];

function json(status, obj, origin) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  return new Response(JSON.stringify(obj), { status, headers });
}

function corsPreflight(origin) {
  return new Response(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": origin || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    },
  });
}

function isValidBytes32Hex(value) {
  return (
    typeof value === "string" &&
    value.startsWith("0x") &&
    value.length === 66 &&
    isHex(value)
  );
}

function isValidAddressHex(addr) {
  return (
    typeof addr === "string" &&
    addr.startsWith("0x") &&
    addr.length === 42 &&
    isHex(addr)
  );
}

function normalizePrivateKey(pk) {
  if (typeof pk !== "string") return "";
  const trimmed = pk.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
}

function isValidPrivateKeyHex(pk) {
  return (
    typeof pk === "string" &&
    pk.startsWith("0x") &&
    pk.length === 66 &&
    isHex(pk)
  );
}

function sanitizeError(e) {
  const msg =
    (e && typeof e === "object" && "shortMessage" in e && e.shortMessage) ||
    (e && typeof e === "object" && "message" in e && e.message) ||
    "Unexpected error";
  return String(msg).slice(0, 400);
}

function toSafeUint64(ts) {
  // uint64 -> alltid safe som Number (max ~1.8e19, men timestamps är små)
  const v = BigInt(ts ?? 0n);
  if (v <= 0n) return 0;
  const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
  return v <= maxSafe ? Number(v) : Number(maxSafe);
}

async function readGet({ publicClient, contractAddress, hash }) {
  const [ok, ts] = await publicClient.readContract({
    address: contractAddress,
    abi: PROOFY_ABI,
    functionName: "get",
    args: [hash],
  });

  const timestamp = toSafeUint64(ts);
  const exists = Boolean(ok) && timestamp !== 0;

  return { exists, timestamp };
}

export async function onRequest({ request, env }) {
  const origin = request.headers.get("Origin") || "";

  if (request.method === "OPTIONS") {
    return corsPreflight(origin || "*");
  }
  if (request.method !== "POST") {
    return json(405, { ok: false, error: "Method Not Allowed" }, origin);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, error: "Invalid JSON body" }, origin);
  }

  const hash = String(body?.hash || "").trim();
  if (!isValidBytes32Hex(hash)) {
    return json(400, { ok: false, error: "Invalid hash format" }, origin);
  }

  const rpcUrl = String(env.AMOY_RPC_URL || "").trim();
  const contractAddress = String(env.PROOFY_CONTRACT_ADDRESS || "").trim();
  const privateKey = normalizePrivateKey(env.PROOFY_PRIVATE_KEY);

  if (!rpcUrl || !contractAddress || !privateKey) {
    return json(500, { ok: false, error: "Server misconfiguration" }, origin);
  }
  if (!isValidAddressHex(contractAddress)) {
    return json(
      500,
      { ok: false, error: "Server misconfiguration (bad contract address)" },
      origin
    );
  }
  if (!isValidPrivateKeyHex(privateKey)) {
    return json(
      500,
      { ok: false, error: "Server misconfiguration (bad private key)" },
      origin
    );
  }

  // Timeout för determinism
  const controller = new AbortController();
  const timeoutMs = Number(env.REGISTER_TIMEOUT_MS || 25_000);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const transport = http(rpcUrl, {
      fetchOptions: { signal: controller.signal },
      // (Valfritt) mindre aggressiv polling för Amoy
      // batch: true,
    });

    const publicClient = createPublicClient({
      chain: polygonAmoy,
      transport,
    });

    const account = privateKeyToAccount(privateKey);

    const walletClient = createWalletClient({
      account,
      chain: polygonAmoy,
      transport,
    });

    // 1) Simulera för att få korrekt request (gas/args/calldata)
    //    + få en tidig, tydlig revert om något är fel.
    const sim = await publicClient.simulateContract({
      account,
      address: contractAddress,
      abi: PROOFY_ABI,
      functionName: "registerIfMissing",
      args: [hash],
    });

    // 2) Skicka transaktionen
    const txHash = await walletClient.writeContract(sim.request);

    // 3) Vänta på kvitto (1 conf) så UI slipper "false fail"
    await publicClient.waitForTransactionReceipt({
      hash: txHash,
      confirmations: 1,
    });

    // 4) Läs efteråt för determinism (timestamp till UI)
    const post = await readGet({ publicClient, contractAddress, hash });

    if (!post.exists || post.timestamp === 0) {
      // Extremt ovanligt: tx gick igenom men vi kan inte läsa direkt.
      // UI bör visa "registrerat men kunde inte bekräftas ännu" om du vill.
      return json(
        200,
        {
          ok: true,
          status: "pending_readback",
          exists: false,
          timestamp: 0,
          txHash,
        },
        origin
      );
    }

    return json(
      200,
      {
        ok: true,
        status: "registered",
        exists: true,
        // Om den redan fanns kommer registerIfMissing returnera created=false,
        // men vi läser inte returvärdet här eftersom writeContract inte returnerar det.
        // Om du vill visa created: true/false krävs antingen event-parsing eller ett pre-read.
        timestamp: post.timestamp,
        txHash,
      },
      origin
    );
  } catch (e) {
    if (e && typeof e === "object" && e.name === "AbortError") {
      return json(
        504,
        {
          ok: false,
          error: "Upstream timeout",
          detail: `Timeout after ${timeoutMs}ms`,
        },
        origin
      );
    }

    // För revisor-trygg UX: returnera "tillfälligt" för vanliga RPC/gas-problem
    const detail = sanitizeError(e);
    const isProbablyTemporary =
      /timeout|temporarily|rate|limit|429|503|gateway|rpc|network|nonce/i.test(
        detail
      );

    return json(
      isProbablyTemporary ? 503 : 500,
      {
        ok: false,
        error: isProbablyTemporary
          ? "Temporary unavailable"
          : "Register failed",
        detail,
      },
      origin
    );
  } finally {
    clearTimeout(timeout);
  }
}
