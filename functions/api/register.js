import { createPublicClient, createWalletClient, http, isHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygonAmoy } from "viem/chains";

const PROOFY_ABI = [
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
  {
    type: "function",
    name: "register",
    stateMutability: "nonpayable",
    inputs: [{ name: "hash", type: "bytes32" }],
    outputs: [],
  },
];

function json(status, obj, origin) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  };

  if (origin) headers["Access-Control-Allow-Origin"] = origin;

  // För att minska CORS-strul vid credential-less fetch
  headers["Vary"] = "Origin";

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

function isValidBytes32Hex(hash) {
  return (
    typeof hash === "string" &&
    hash.startsWith("0x") &&
    hash.length === 66 &&
    isHex(hash)
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

function parseAllowedOrigins(envValue) {
  const raw = String(envValue || "").trim();
  if (!raw) return null; // default: enforce same-origin
  if (raw === "*") return ["*"];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isOriginAllowed({ requestOrigin, requestUrlOrigin, allowed }) {
  // Non-browser clients may omit Origin; allow if same-origin by URL or if allowlist is '*'
  if (allowed && allowed.includes("*")) return true;

  // If no Origin header, allow (curl/server-to-server). You can tighten this later if needed.
  if (!requestOrigin) return true;

  // If allowlist provided, enforce it.
  if (allowed && allowed.length > 0) {
    return allowed.includes(requestOrigin);
  }

  // Default: strict same-origin (minskar risken att andra sidor triggar gasförbrukning via browser)
  return requestOrigin === requestUrlOrigin;
}

function toSafeTimestamp(timestampBig) {
  const tsBig = BigInt(timestampBig ?? 0n);
  const exists = tsBig !== 0n;

  if (!exists) return { exists: false, timestamp: 0 };

  const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
  const timestamp = tsBig <= maxSafe ? Number(tsBig) : tsBig.toString();
  return { exists: true, timestamp };
}

async function readProof({ publicClient, contractAddress, hash }) {
  const proof = await publicClient.readContract({
    address: contractAddress,
    abi: PROOFY_ABI,
    functionName: "getProof",
    args: [hash],
  });

  const timestampBig = proof?.[0] ?? 0n;
  const submitter = proof?.[1];

  const { exists, timestamp } = toSafeTimestamp(timestampBig);

  return {
    exists,
    timestamp,
    submitter: isValidAddressHex(submitter) ? submitter : null,
  };
}

async function readProofWithRetry({
  publicClient,
  contractAddress,
  hash,
  retries = 3,
  delayMs = 800,
}) {
  for (let i = 0; i < retries; i++) {
    const proof = await readProof({ publicClient, contractAddress, hash });
    if (proof.exists && proof.timestamp && proof.timestamp !== 0) return proof;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return readProof({ publicClient, contractAddress, hash });
}

function sanitizeError(e) {
  // Viem errors har ofta shortMessage; fallbacka till message
  const msg =
    (e && typeof e === "object" && "shortMessage" in e && e.shortMessage) ||
    (e && typeof e === "object" && "message" in e && e.message) ||
    "Unexpected error";

  // Håll kort och utan stack
  return String(msg).slice(0, 300);
}

export async function onRequest({ request, env }) {
  const requestOrigin = request.headers.get("Origin") || "";
  const requestUrlOrigin = new URL(request.url).origin;

  const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS);
  const originForCors = requestOrigin || ""; // om tomt blir ingen ACAO (ok för curl)

  if (request.method === "OPTIONS") {
    // Preflight ska följa samma policy
    const ok = isOriginAllowed({
      requestOrigin,
      requestUrlOrigin,
      allowed: allowedOrigins,
    });
    if (!ok) return corsPreflight(""); // inga CORS-headers vid block
    return corsPreflight(requestOrigin || "*");
  }

  if (request.method !== "POST") {
    return json(405, { ok: false, error: "Method Not Allowed" }, originForCors);
  }

  // Origin-skydd (minskar risken att andra webbplatser triggar din signerande endpoint från browser)
  const originOk = isOriginAllowed({
    requestOrigin,
    requestUrlOrigin,
    allowed: allowedOrigins,
  });
  if (!originOk) {
    return json(
      403,
      { ok: false, error: "Forbidden origin" },
      originForCors
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, error: "Invalid JSON body" }, originForCors);
  }

  const hash = String(body?.hash || "").trim();

  if (!isValidBytes32Hex(hash)) {
    return json(400, { ok: false, error: "Invalid hash format" }, originForCors);
  }

  const rpcUrl = env.AMOY_RPC_URL;
  const contractAddress = env.PROOFY_CONTRACT_ADDRESS;
  const privateKeyRaw = env.PROOFY_PRIVATE_KEY;

  const privateKey = normalizePrivateKey(privateKeyRaw);

  if (!rpcUrl || !contractAddress || !privateKey) {
    return json(
      500,
      { ok: false, error: "Server misconfiguration" },
      originForCors
    );
  }

  if (!isValidAddressHex(contractAddress)) {
    return json(
      500,
      { ok: false, error: "Server misconfiguration" },
      originForCors
    );
  }

  if (!isValidBytes32Hex(privateKey)) {
    // private key är 32 bytes => hex-längd 66 inkl 0x
    return json(
      500,
      { ok: false, error: "Server misconfiguration" },
      originForCors
    );
  }

  // Timeout för hela operationen (förhindrar "häng" och gör fel mer deterministiska)
  const controller = new AbortController();
  const timeoutMs = Number(env.REGISTER_TIMEOUT_MS || 25_000);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const transport = http(rpcUrl, { fetchOptions: { signal: controller.signal } });

    const publicClient = createPublicClient({
      chain: polygonAmoy,
      transport,
    });

    // 1) Pre-read
    const pre = await readProof({ publicClient, contractAddress, hash });
    if (pre.exists && pre.timestamp && pre.timestamp !== 0) {
      return json(
        200,
        {
          ok: true,
          exists: true,
          alreadyExists: true,
          timestamp: pre.timestamp,
          submitter: pre.submitter,
          txHash: null,
        },
        originForCors
      );
    }

    // 2) Write
    const account = privateKeyToAccount(privateKey);
    const walletClient = createWalletClient({
      account,
      chain: polygonAmoy,
      transport,
    });

    const txHash = await walletClient.writeContract({
      address: contractAddress,
      abi: PROOFY_ABI,
      functionName: "register",
      args: [hash],
    });

    await publicClient.waitForTransactionReceipt({
      hash: txHash,
      confirmations: 1,
    });

    // 3) Post-read (med retry)
    const post = await readProofWithRetry({
      publicClient,
      contractAddress,
      hash,
      retries: 3,
      delayMs: 800,
    });

    if (!post.exists || !post.timestamp || post.timestamp === 0) {
      return json(
        500,
        { ok: false, error: "Registration completed but not readable" },
        originForCors
      );
    }

    return json(
      200,
      {
        ok: true,
        exists: true,
        alreadyExists: false,
        timestamp: post.timestamp,
        submitter: post.submitter,
        txHash,
      },
      originForCors
    );
  } catch (e) {
    const msg = sanitizeError(e);

    // AbortController -> tydligare fel
    if (e && typeof e === "object" && e.name === "AbortError") {
      return json(
        504,
        { ok: false, error: "Upstream timeout", detail: `Timeout after ${timeoutMs}ms` },
        originForCors
      );
    }

    return json(
      500,
      { ok: false, error: "Register failed", detail: msg },
      originForCors
    );
  } finally {
    clearTimeout(timeout);
  }
}
