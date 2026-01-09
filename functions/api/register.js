import {
  createPublicClient,
  createWalletClient,
  http,
  isHex,
  isAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygonAmoy } from "viem/chains";
import { ABI as PROOFY_ABI } from "./abi.js";

const DEFAULTS = {
  MAX_FEE_GWEI: 600,
  MAX_PRIORITY_FEE_GWEI: 20,
  MIN_PRIORITY_FEE_GWEI: 1,
};

function pickCorsOrigin(requestOrigin, env) {
  const origin = (requestOrigin || "").trim();
  const allow = String(env.ALLOWED_ORIGINS || "").trim();
  if (!allow) return origin || "*";

  const allowed = allow
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!origin) return "*";
  return allowed.includes(origin) ? origin : "null";
}

function json(status, obj, origin) {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    Vary: "Origin",
    "x-content-type-options": "nosniff",
  };
  if (origin) headers["access-control-allow-origin"] = origin;
  return new Response(JSON.stringify(obj), { status, headers });
}

function corsPreflight(origin) {
  return new Response(null, {
    status: 204,
    headers: {
      "cache-control": "no-store",
      "access-control-allow-origin": origin || "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "Content-Type",
      "access-control-max-age": "86400",
      Vary: "Origin",
    },
  });
}

function sanitizeError(e) {
  const msg =
    (e && typeof e === "object" && (e.shortMessage || e.message)) || String(e);
  return String(msg).slice(0, 800);
}

function isValidBytes32Hex(s) {
  return (
    typeof s === "string" &&
    /^0x[0-9a-fA-F]{64}$/.test(s.trim()) &&
    isHex(s.trim())
  );
}

function normalizeHexWith0x(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
}

function isValidPrivateKeyHex(pk) {
  const t = typeof pk === "string" ? pk.trim() : "";
  return /^0x[0-9a-fA-F]{64}$/.test(t) && isHex(t);
}

function parseNumberEnv(v, fallback) {
  if (v === undefined || v === null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function gweiToWeiBigInt(gwei) {
  const s = String(gwei).trim();
  if (!s) return 0n;
  const [i, d = ""] = s.split(".");
  const int = BigInt(i || "0");
  const dec = BigInt((d + "000000000").slice(0, 9));
  return int * 10n ** 9n + dec;
}

function weiToGweiNumber(wei) {
  try {
    return Number(wei) / 1e9;
  } catch {
    return null;
  }
}

async function assertAmoyChain(publicClient) {
  const cid = await publicClient.getChainId();
  if (cid !== polygonAmoy.id) {
    throw new Error(
      `Wrong chainId from RPC. Expected ${polygonAmoy.id}, got ${cid}`
    );
  }
  return cid;
}

/**
 * Robust EIP-1559 fee-val:
 * - försök estimateFeesPerGas()
 * - clampa inom MAX_FEE_GWEI / MAX_PRIORITY_FEE_GWEI
 * - se till att priority >= MIN_PRIORITY_FEE_GWEI
 */
async function pickFeesForDebug(publicClient, env) {
  const capGwei = parseNumberEnv(env.MAX_FEE_GWEI, DEFAULTS.MAX_FEE_GWEI);
  const tipCapGwei = parseNumberEnv(
    env.MAX_PRIORITY_FEE_GWEI,
    DEFAULTS.MAX_PRIORITY_FEE_GWEI
  );
  const minTipGwei = parseNumberEnv(
    env.MIN_PRIORITY_FEE_GWEI,
    DEFAULTS.MIN_PRIORITY_FEE_GWEI
  );

  const capWei = gweiToWeiBigInt(capGwei);
  const tipCapWei = gweiToWeiBigInt(tipCapGwei);
  const minTipWei = gweiToWeiBigInt(minTipGwei);

  let suggestedMaxFee = null;
  let suggestedPriority = null;
  let estimateError = null;

  try {
    const estimate = await publicClient.estimateFeesPerGas();
    suggestedMaxFee = estimate?.maxFeePerGas ?? null;
    suggestedPriority = estimate?.maxPriorityFeePerGas ?? null;
  } catch (err) {
    estimateError = String(err?.message || err);
  }

  let maxFeePerGas =
    suggestedMaxFee && suggestedMaxFee > 0n ? suggestedMaxFee : capWei;

  let maxPriorityFeePerGas =
    suggestedPriority && suggestedPriority > 0n
      ? suggestedPriority
      : minTipWei;

  if (maxFeePerGas > capWei) maxFeePerGas = capWei;
  if (maxPriorityFeePerGas > tipCapWei) maxPriorityFeePerGas = tipCapWei;
  if (maxPriorityFeePerGas < minTipWei) maxPriorityFeePerGas = minTipWei;
  if (maxPriorityFeePerGas > maxFeePerGas) maxPriorityFeePerGas = maxFeePerGas;

  return {
    picked: {
      maxFeePerGas: weiToGweiNumber(maxFeePerGas),
      maxPriorityFeePerGas: weiToGweiNumber(maxPriorityFeePerGas),
      capGwei,
      tipCapGwei,
      minTipGwei,
    },
    estimate: {
      maxFeePerGas: suggestedMaxFee ? weiToGweiNumber(suggestedMaxFee) : null,
      maxPriorityFeePerGas: suggestedPriority
        ? weiToGweiNumber(suggestedPriority)
        : null,
      error: estimateError,
    },
    raw: { maxFeePerGas, maxPriorityFeePerGas },
  };
}

async function readProof(publicClient, contractAddress, hash) {
  // getProof(bytes32) -> (timestamp, submitter)
  const res = await publicClient.readContract({
    address: contractAddress,
    abi: PROOFY_ABI,
    functionName: "getProof",
    args: [hash],
  });

  // viem kan returnera array [timestamp, submitter] eller object beroende på ABI-format
  const timestamp =
    Array.isArray(res) ? res[0] : res?.timestamp ?? 0n;
  const submitter =
    Array.isArray(res) ? res[1] : res?.submitter ?? "0x0000000000000000000000000000000000000000";

  const tsNum = Number(timestamp);
  const confirmed = tsNum > 0;

  return {
    confirmed,
    confirmedAtUnix: confirmed ? tsNum : null,
    submitter,
  };
}

export async function onRequest({ request, env }) {
  const origin = pickCorsOrigin(request?.headers?.get("Origin"), env);

  if (request.method === "OPTIONS") return corsPreflight(origin);
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
  const privateKey = normalizeHexWith0x(env.PROOFY_PRIVATE_KEY);

  if (!rpcUrl || !contractAddress || !privateKey) {
    return json(500, { ok: false, error: "Server misconfiguration" }, origin);
  }

  if (!isAddress(contractAddress)) {
    return json(500, { ok: false, error: "Bad contract address" }, origin);
  }

  if (!isValidPrivateKeyHex(privateKey)) {
    return json(500, { ok: false, error: "Bad private key" }, origin);
  }

  try {
    const transport = http(rpcUrl, { timeout: 20_000 });

    const publicClient = createPublicClient({
      chain: polygonAmoy,
      transport,
    });

    // Säkerställ kedja
    const chainId = await assertAmoyChain(publicClient);

    // 1) Kolla om den redan finns on-chain
    try {
      const proof = await readProof(publicClient, contractAddress, hash);
      if (proof.confirmed) {
        return json(
          200,
          {
            ok: true,
            statusCode: "CONFIRMED",
            statusText: "Bekräftad (fanns redan)",
            hash,
            confirmedAtUnix: proof.confirmedAtUnix,
            evidence: null,
            submission: null,
            legalText: "Fanns redan bekräftad notering.",
          },
          origin
        );
      }
    } catch {
      // Read kan faila tillfälligt — vi försöker ändå registrera.
    }

    // 2) Välj avgifter (EIP-1559) + debug
    const fees = await pickFeesForDebug(publicClient, env);

    // 3) Skapa signer
    const account = privateKeyToAccount(privateKey);
    const walletClient = createWalletClient({
      account,
      chain: polygonAmoy,
      transport,
    });

    // 4) Simulera register(bytes32)
    const sim = await publicClient.simulateContract({
      account,
      address: contractAddress,
      abi: PROOFY_ABI,
      functionName: "register",
      args: [hash],
    });

    // 5) Skicka tx
    const txHash = await walletClient.writeContract({
      ...sim.request,
      maxFeePerGas: fees.raw.maxFeePerGas,
      maxPriorityFeePerGas: fees.raw.maxPriorityFeePerGas,
    });

    return json(
      200,
      {
        ok: true,
        statusCode: "NOT_CONFIRMED",
        statusText: "Ej bekräftad",
        hash,
        confirmedAtUnix: null,
        evidence: null,
        submission: { txHash, submittedBy: account.address },
        legalText: "En registrering har skickats in men är ännu inte bekräftad.",
        debug: {
          fees,
          contractAddress,
          chainId,
        },
      },
      origin
    );
  } catch (e) {
    // Vanligt edge case: kontraktet kan revert:a om redan registrerad.
    // Då försöker vi en sista gång läsa state och returnera CONFIRMED om det stämmer.
    try {
      const rpcUrl = String(env.AMOY_RPC_URL || "").trim();
      const contractAddress = String(env.PROOFY_CONTRACT_ADDRESS || "").trim();
      if (rpcUrl && contractAddress && isAddress(contractAddress)) {
        const publicClient = createPublicClient({
          chain: polygonAmoy,
          transport: http(rpcUrl, { timeout: 20_000 }),
        });
        await assertAmoyChain(publicClient);
        const proof = await readProof(publicClient, contractAddress, hash);
        if (proof.confirmed) {
          return json(
            200,
            {
              ok: true,
              statusCode: "CONFIRMED",
              statusText: "Bekräftad (registrerades nyligen)",
              hash,
              confirmedAtUnix: proof.confirmedAtUnix,
              evidence: null,
              submission: null,
              legalText: "Notering finns bekräftad on-chain.",
            },
            origin
          );
        }
      }
    } catch {
      // ignorera fallback-fel
    }

    return json(
      503,
      {
        ok: false,
        statusCode: "UNKNOWN",
        statusText: "Kunde inte kontrolleras",
        hash: hash || null,
        confirmedAtUnix: null,
        evidence: null,
        submission: null,
        error: "Register temporarily unavailable",
        detail: sanitizeError(e),
      },
      origin
    );
  }
}
