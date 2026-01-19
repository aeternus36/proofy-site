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

  // Hur länge vi väntar på mining i samma request innan vi returnerar "pending".
  WAIT_FOR_MINING_MS: 25_000,

  // Om tx bedöms droppad: hur många resubmits max (0 = av).
  RESUBMIT_MAX_ATTEMPTS: 1,

  // Fee bump vid resubmit (multiplikativt, t.ex. 1.25 => +25%)
  RESUBMIT_BUMP_MULTIPLIER: 1.25,
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
    vary: "Origin",
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
      vary: "Origin",
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

function getTimeoutMs(env) {
  const raw = String(env.RPC_TIMEOUT_MS || "").trim();
  if (!raw) return 20_000;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && n <= 60_000 ? Math.floor(n) : 20_000;
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

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

// Gör ett objekt JSON-säkert: BigInt -> string (rekursivt)
function toJsonSafe(value) {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = toJsonSafe(v);
    return out;
  }
  return value;
}

function makeRequestId() {
  try {
    // Cloudflare Workers har crypto.randomUUID i praktiken
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
      return globalThis.crypto.randomUUID();
    }
  } catch {
    // ignore
  }
  // fallback: tidsbaserat (inte kryptosäkert, men bättre än inget)
  return `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function shouldIncludeDebug(env, body) {
  const envDebug = String(env.DEBUG || "").trim() === "1";
  const bodyDebug = body && body.debug === true;
  return envDebug || bodyDebug;
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
 * PATCH: läs ts + blockNo från kontraktets get(refId)
 * get() -> (ok, ts, blockNo)
 */
async function readGet(publicClient, contractAddress, hash) {
  const res = await publicClient.readContract({
    address: contractAddress,
    abi: PROOFY_ABI,
    functionName: "get",
    args: [hash],
  });

  const ok = Array.isArray(res) ? res[0] : res?.ok ?? false;
  const ts = Array.isArray(res) ? res[1] : res?.ts ?? 0n;
  const blockNo = Array.isArray(res) ? res[2] : res?.blockNo ?? 0n;

  const tsNum = Number(ts);
  const confirmed = Boolean(ok) && tsNum > 0;

  const blockNoStr = (() => {
    try {
      const bn = BigInt(blockNo);
      return bn > 0n ? bn.toString() : null;
    } catch {
      const n = Number(blockNo);
      return Number.isFinite(n) && n > 0 ? String(n) : null;
    }
  })();

  return {
    confirmed,
    confirmedAtUnix: confirmed ? tsNum : null,
    registeredBlockNumber: confirmed ? blockNoStr : null,
  };
}

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
    caps: { capWei, tipCapWei, minTipWei },
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

function clampFeesToCaps({ maxFeePerGas, maxPriorityFeePerGas, caps }) {
  let mf = maxFeePerGas;
  let tip = maxPriorityFeePerGas;

  if (mf > caps.capWei) mf = caps.capWei;
  if (tip > caps.tipCapWei) tip = caps.tipCapWei;
  if (tip < caps.minTipWei) tip = caps.minTipWei;
  if (tip > mf) tip = mf;

  return { maxFeePerGas: mf, maxPriorityFeePerGas: tip };
}

function bumpFeeBigInt(valueWei, multiplier) {
  // BigInt-säker bump: multiplier ~1.25 etc.
  const m = Number(multiplier);
  if (!Number.isFinite(m) || m <= 1) return valueWei;

  // Använd 1000-dels fastpunkt: t.ex. 1.25 => 1250/1000
  const scaled = Math.floor(m * 1000);
  if (!Number.isFinite(scaled) || scaled <= 1000) return valueWei;

  const bumped = (valueWei * BigInt(scaled)) / 1000n;
  if (bumped <= valueWei) return valueWei + 1n;
  return bumped;
}

async function tryWaitForReceipt(publicClient, txHash, waitMs) {
  const timeout = clamp(Number(waitMs || 0), 1_000, 60_000);
  try {
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout,
    });
    return { kind: "MINED", receipt };
  } catch (e) {
    return { kind: "TIMEOUT_OR_ERROR", error: sanitizeError(e) };
  }
}

async function isTxDropped(publicClient, txHash) {
  const receipt = await publicClient
    .getTransactionReceipt({ hash: txHash })
    .catch(() => null);
  if (receipt) return false;

  const tx = await publicClient.getTransaction({ hash: txHash }).catch(() => null);
  if (tx) return false;

  return true;
}

async function sendRegisterTx({
  publicClient,
  walletClient,
  account,
  contractAddress,
  hash,
  maxFeePerGas,
  maxPriorityFeePerGas,
}) {
  const sim = await publicClient.simulateContract({
    account,
    address: contractAddress,
    abi: PROOFY_ABI,
    functionName: "registerIfMissing",
    args: [hash],
  });

  const txHash = await walletClient.writeContract({
    ...sim.request,
    maxFeePerGas,
    maxPriorityFeePerGas,
  });

  return txHash;
}

export async function onRequest({ request, env }) {
  const origin = pickCorsOrigin(request?.headers?.get("Origin"), env);

  // ✅ 5/5 audit: servergenererad tid (UTC epoch) i ALLA JSON-svar
  const serverTimeUnix = Math.floor(Date.now() / 1000);
  const timeSource = "server";
  const requestId = makeRequestId();

  if (request.method === "OPTIONS") return corsPreflight(origin);
  if (request.method !== "POST") {
    return json(
      405,
      {
        ok: false,
        error: "Method Not Allowed",
        requestId,
        serverTimeUnix,
        timeSource,
      },
      origin
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(
      400,
      {
        ok: false,
        error: "Invalid JSON body",
        requestId,
        serverTimeUnix,
        timeSource,
      },
      origin
    );
  }

  const includeDebug = shouldIncludeDebug(env, body);

  const hash = String(body?.hash || "").trim();
  if (!isValidBytes32Hex(hash)) {
    return json(
      400,
      {
        ok: false,
        error: "Invalid hash format",
        requestId,
        serverTimeUnix,
        timeSource,
      },
      origin
    );
  }

  const rpcUrl = String(env.AMOY_RPC_URL || "").trim();
  const contractAddress = String(env.PROOFY_CONTRACT_ADDRESS || "").trim();
  const privateKey = normalizeHexWith0x(env.PROOFY_PRIVATE_KEY);

  if (!rpcUrl || !contractAddress || !privateKey) {
    return json(
      500,
      {
        ok: false,
        error: "Server misconfiguration",
        requestId,
        serverTimeUnix,
        timeSource,
      },
      origin
    );
  }
  if (!isAddress(contractAddress)) {
    return json(
      500,
      {
        ok: false,
        error: "Bad contract address",
        requestId,
        serverTimeUnix,
        timeSource,
      },
      origin
    );
  }
  if (!isValidPrivateKeyHex(privateKey)) {
    return json(
      500,
      {
        ok: false,
        error: "Bad private key",
        requestId,
        serverTimeUnix,
        timeSource,
      },
      origin
    );
  }

  try {
    const timeout = getTimeoutMs(env);
    const transport = http(rpcUrl, { timeout });

    const publicClient = createPublicClient({
      chain: polygonAmoy,
      transport,
    });

    const chainId = await assertAmoyChain(publicClient);

    // 0) Om den redan finns: returnera CONFIRMED direkt.
    try {
      const existing = await readGet(publicClient, contractAddress, hash);
      if (existing.confirmed) {
        return json(
          200,
          {
            ok: true,
            statusCode: "CONFIRMED",
            statusText: "Bekräftad",
            hash,
            confirmedAtUnix: existing.confirmedAtUnix,
            evidence: existing.registeredBlockNumber
              ? {
                  observedBlockNumber: existing.registeredBlockNumber,
                  registeredBlockNumber: existing.registeredBlockNumber,
                }
              : null,
            submission: null,
            legalText: "Det finns en bekräftad notering för detta kontrollvärde.",
            requestId,
            serverTimeUnix,
            timeSource,
          },
          origin
        );
      }
    } catch {
      // Om vi inte kan läsa, fortsätter vi till registreringsförsök.
      // (Ingen antagen juridisk effekt av att read misslyckas.)
    }

    const fees = await pickFeesForDebug(publicClient, env);
    const account = privateKeyToAccount(privateKey);

    const walletClient = createWalletClient({
      account,
      chain: polygonAmoy,
      transport,
    });

    const waitForMiningMs = clamp(
      parseNumberEnv(env.WAIT_FOR_MINING_MS, DEFAULTS.WAIT_FOR_MINING_MS),
      3_000,
      60_000
    );

    const resubmitMaxAttempts = clamp(
      parseNumberEnv(env.RESUBMIT_MAX_ATTEMPTS, DEFAULTS.RESUBMIT_MAX_ATTEMPTS),
      0,
      3
    );

    const bumpMultiplier = clamp(
      parseNumberEnv(
        env.RESUBMIT_BUMP_MULTIPLIER,
        DEFAULTS.RESUBMIT_BUMP_MULTIPLIER
      ),
      1.05,
      3.0
    );

    // 1) Skicka tx (fees är redan klampade mot caps)
    let attempt = 0;
    let txHash = await sendRegisterTx({
      publicClient,
      walletClient,
      account,
      contractAddress,
      hash,
      maxFeePerGas: fees.raw.maxFeePerGas,
      maxPriorityFeePerGas: fees.raw.maxPriorityFeePerGas,
    });

    // 2) Vänta kort på receipt
    let receiptInfo = await tryWaitForReceipt(
      publicClient,
      txHash,
      waitForMiningMs
    );

    // 3) Om den inte mined: försök resubmit om den bedöms droppad
    while (receiptInfo.kind !== "MINED" && attempt < resubmitMaxAttempts) {
      const dropped = await isTxDropped(publicClient, txHash);
      if (!dropped) break;

      attempt += 1;

      // bump fees (BigInt-säkert) + klampa mot caps
      const bumped = clampFeesToCaps({
        maxFeePerGas: bumpFeeBigInt(fees.raw.maxFeePerGas, bumpMultiplier),
        maxPriorityFeePerGas: bumpFeeBigInt(
          fees.raw.maxPriorityFeePerGas,
          bumpMultiplier
        ),
        caps: fees.caps,
      });

      txHash = await sendRegisterTx({
        publicClient,
        walletClient,
        account,
        contractAddress,
        hash,
        maxFeePerGas: bumped.maxFeePerGas,
        maxPriorityFeePerGas: bumped.maxPriorityFeePerGas,
      });

      receiptInfo = await tryWaitForReceipt(
        publicClient,
        txHash,
        waitForMiningMs
      );
    }

    // Debug (endast om uttryckligen på)
    const debugBase = includeDebug
      ? toJsonSafe({
          chainId,
          contractAddress,
          txHash,
          waitForMiningMs,
          resubmits: attempt,
          fees: { picked: fees.picked, estimate: fees.estimate },
        })
      : undefined;

    // 4) Om mined: verifiera state (sanning) och returnera CONFIRMED om den nu finns.
    if (receiptInfo.kind === "MINED") {
      const minedBlockStr =
        receiptInfo.receipt?.blockNumber?.toString?.() ?? null;

      if (receiptInfo.receipt?.status === "reverted") {
        const payload = {
          ok: true,
          statusCode: "NOT_CONFIRMED",
          statusText: "Ej bekräftad",
          hash,
          confirmedAtUnix: null,
          evidence: {
            observedBlockNumber: minedBlockStr,
            minedBlockNumber: minedBlockStr,
          },
          submission: { txHash, submittedBy: account.address },
          legalText:
            "En registrering har behandlats men kunde inte bekräftas. Ingen slutsats om bekräftelse kan dras.",
          requestId,
          serverTimeUnix,
          timeSource,
        };
        if (includeDebug) payload.debug = debugBase;
        return json(200, payload, origin);
      }

      // receipt success: kontrollera kontraktet (definitiv sanning)
      const post = await readGet(publicClient, contractAddress, hash).catch(
        () => ({
          confirmed: false,
          confirmedAtUnix: null,
          registeredBlockNumber: null,
        })
      );

      if (post.confirmed) {
        const payload = {
          ok: true,
          statusCode: "CONFIRMED",
          statusText: "Bekräftad",
          hash,
          confirmedAtUnix: post.confirmedAtUnix,
          evidence: {
            observedBlockNumber: post.registeredBlockNumber || minedBlockStr,
            registeredBlockNumber: post.registeredBlockNumber,
            minedBlockNumber: minedBlockStr,
          },
          submission: { txHash, submittedBy: account.address },
          legalText: "Det finns en bekräftad notering för detta kontrollvärde.",
          requestId,
          serverTimeUnix,
          timeSource,
        };
        if (includeDebug) payload.debug = debugBase;
        return json(200, payload, origin);
      }

      // Om receipt var success men state inte visar bekräftelse: behandla som inskickad men ej bekräftad.
      const payload = {
        ok: true,
        statusCode: "SUBMITTED_UNCONFIRMED",
        statusText: "Inskickad – ej bekräftad",
        hash,
        confirmedAtUnix: null,
        evidence: {
          observedBlockNumber: minedBlockStr,
          minedBlockNumber: minedBlockStr,
        },
        submission: { txHash, submittedBy: account.address },
        legalText:
          "En registrering har skickats in men bekräftelse kunde inte redovisas vid kontrollen.",
        requestId,
        serverTimeUnix,
        timeSource,
      };
      if (includeDebug) payload.debug = debugBase;
      return json(200, payload, origin);
    }

    // 5) Pending/timeout: returnera SUBMITTED_UNCONFIRMED med txHash
    const payload = {
      ok: true,
      statusCode: "SUBMITTED_UNCONFIRMED",
      statusText: "Inskickad – ej bekräftad",
      hash,
      confirmedAtUnix: null,
      evidence: null,
      submission: { txHash, submittedBy: account.address },
      legalText: "En registrering har skickats in men är ännu inte bekräftad.",
      requestId,
      serverTimeUnix,
      timeSource,
    };
    if (includeDebug) {
      payload.debug = {
        ...debugBase,
        note:
          "Tx skickad men inte bekräftad inom väntetiden. Klient bör polla /api/tx och /api/verify.",
      };
    }
    return json(200, payload, origin);
  } catch (e) {
    const payload = {
      ok: false,
      statusCode: "UNKNOWN",
      statusText: "Kunde inte kontrolleras",
      hash: hash || null,
      confirmedAtUnix: null,
      evidence: null,
      submission: null,
      error: "Register temporarily unavailable",
      detail: sanitizeError(e),
      requestId,
      serverTimeUnix,
      timeSource,
    };
    return json(503, payload, origin);
  }
}
