import { createPublicClient, http, isHex, isAddress } from "viem";
import { polygonAmoy } from "viem/chains";
import { ABI as PROOFY_ABI } from "./abi.js";

/**
 * Proofy /api/verify
 *
 * Juridik:
 * - Aldrig "bekräftad" utan att en bekräftad notering kan läsas från kontraktet.
 * - Om ingen bekräftelse finns: "Ej bekräftad" eller "Inskickad – ej bekräftad" (om submission är känd).
 * - Vid tekniskt fel: "Kunde inte kontrolleras" (inte ett negativt påstående).
 *
 * Teknik:
 * - Read-only. Inga skrivningar.
 * - Samma statusmodell som Register/Certificate.
 */

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
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "Content-Type",
      "access-control-max-age": "86400",
      vary: "Origin",
    },
  });
}

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

function isValidBytes32Hex(hash) {
  return (
    typeof hash === "string" &&
    /^0x[0-9a-fA-F]{64}$/.test(hash.trim()) &&
    isHex(hash.trim())
  );
}

function isValidTxHash(tx) {
  return (
    typeof tx === "string" &&
    /^0x[0-9a-fA-F]{64}$/.test(tx.trim()) &&
    isHex(tx.trim())
  );
}

function sanitizeError(e) {
  const msg =
    (e && typeof e === "object" && (e.shortMessage || e.message)) || String(e);
  return String(msg).slice(0, 600);
}

function toSafeUnixSeconds(tsBigint) {
  // getProof returns uint256; we only need safe number for UI.
  try {
    const v = BigInt(tsBigint ?? 0n);
    if (v <= 0n) return 0;
    const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
    return v <= maxSafe ? Number(v) : Number(maxSafe);
  } catch {
    return 0;
  }
}

/**
 * Gemensam statusmodell
 * statusCode:
 * - CONFIRMED
 * - SUBMITTED_UNCONFIRMED
 * - NOT_CONFIRMED
 * - UNKNOWN
 */
function statusConfirmed({ hash, timestamp, observedBlockNumber, submitter }) {
  return {
    ok: true,
    statusCode: "CONFIRMED",
    statusText: "Bekräftad",
    hash,
    confirmedAtUnix: timestamp,
    evidence: { observedBlockNumber, submitter: submitter || null },
    submission: null,
    legalText:
      "Det finns en bekräftad notering för detta kontrollvärde. Uppgifterna ovan kan kontrolleras mot extern verifieringskälla vid behov.",
  };
}

function statusSubmittedUnconfirmed({ hash, observedBlockNumber, submission }) {
  const txHash = submission?.txHash || null;
  return {
    ok: true,
    statusCode: "SUBMITTED_UNCONFIRMED",
    statusText: "Inskickad – ej bekräftad",
    hash,
    confirmedAtUnix: null,
    evidence: observedBlockNumber ? { observedBlockNumber } : null,
    submission: txHash ? { txHash } : null,
    legalText:
      "En registrering har skickats in men är ännu inte bekräftad. Ingen slutsats om bekräftelse kan dras innan status är 'Bekräftad'.",
  };
}

function statusNotConfirmed({ hash, observedBlockNumber, submission }) {
  const txHash = submission?.txHash || null;
  return {
    ok: true,
    statusCode: "NOT_CONFIRMED",
    statusText: "Ej bekräftad",
    hash,
    confirmedAtUnix: null,
    evidence: observedBlockNumber ? { observedBlockNumber } : null,
    submission: txHash ? { txHash } : null,
    legalText:
      "Ingen bekräftad notering kunde konstateras vid kontrolltillfället. Detta är inte ett påstående om framtida bekräftelse.",
  };
}

function statusUnknown({ hash, detail }) {
  return {
    ok: false,
    statusCode: "UNKNOWN",
    statusText: "Kunde inte kontrolleras",
    hash: hash || null,
    confirmedAtUnix: null,
    evidence: null,
    submission: null,
    error: "Verify temporarily unavailable",
    detail,
    legalText:
      "Status kunde inte kontrolleras på grund av tekniskt fel. Ingen slutsats kan dras utifrån detta svar.",
  };
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

function getTimeoutMs(env) {
  const raw = String(env.RPC_TIMEOUT_MS || "").trim();
  if (!raw) return 20_000;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && n <= 60_000 ? Math.floor(n) : 20_000;
}

async function readProofWithEvidence({ publicClient, contractAddress, hash }) {
  // getProof(bytes32) -> (uint256 timestamp, address submitter)
  const res = await publicClient.readContract({
    address: contractAddress,
    abi: PROOFY_ABI,
    functionName: "getProof",
    args: [hash],
  });

  const ts = Array.isArray(res) ? res[0] : res?.timestamp ?? 0n;
  const submitter = Array.isArray(res) ? res[1] : res?.submitter ?? null;

  const timestamp = toSafeUnixSeconds(ts);
  const exists = timestamp !== 0;

  const observedBlockNumber = await publicClient.getBlockNumber();

  return {
    exists,
    timestamp,
    submitter: submitter || null,
    observedBlockNumber: observedBlockNumber.toString(),
  };
}

/**
 * Om tx skickas in kan vi förbättra sanningshalten:
 * - receipt hittas => tx är mined (kan vara success/reverted)
 * - transaction hittas men receipt saknas => tx är broadcast/pending
 * - inget hittas => tx okänd
 */
async function resolveTxState(publicClient, txHash) {
  if (!txHash) return { known: false, state: "UNKNOWN" };

  // 1) receipt (mined)
  try {
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
    if (receipt) {
      const blockNumber = receipt.blockNumber
        ? receipt.blockNumber.toString()
        : null;
      return {
        known: true,
        state: "MINED",
        receiptStatus: receipt.status || null,
        observedBlockNumber: blockNumber,
      };
    }
  } catch {
    // ignore
  }

  // 2) pending/broadcast
  try {
    const tx = await publicClient.getTransaction({ hash: txHash });
    if (tx) return { known: true, state: "PENDING" };
  } catch {
    // ignore
  }

  return { known: false, state: "UNKNOWN" };
}

export async function onRequest({ request, env }) {
  const origin = pickCorsOrigin(request?.headers?.get("Origin"), env);

  if (request.method === "OPTIONS") return corsPreflight(origin);

  if (request.method !== "GET" && request.method !== "POST") {
    return json(405, { ok: false, error: "Method Not Allowed" }, origin);
  }

  // Accept hash from GET query or POST body. Optional tx for bättre UX.
  let hash = "";
  let tx = "";

  if (request.method === "GET") {
    const url = new URL(request.url);
    hash = String(
      (url.searchParams.get("hash") || url.searchParams.get("id") || "").trim()
    );
    tx = String((url.searchParams.get("tx") || "").trim());
  } else {
    const body = await request.json().catch(() => ({}));
    hash = String(body?.hash || "").trim();
    tx = String(body?.tx || "").trim();
  }

  if (!isValidBytes32Hex(hash)) {
    return json(
      400,
      { ok: false, error: "Invalid hash format", statusCode: "BAD_REQUEST" },
      origin
    );
  }

  // tx valfri. Om ogiltig: ignorera (inte hårt fel).
  if (tx && !isValidTxHash(tx)) tx = "";

  const rpcUrl = String(env.AMOY_RPC_URL || "").trim();
  const contractAddress = String(env.PROOFY_CONTRACT_ADDRESS || "").trim();

  if (!rpcUrl || !contractAddress) {
    return json(500, { ok: false, error: "Server misconfiguration" }, origin);
  }
  if (!isAddress(contractAddress)) {
    return json(
      500,
      { ok: false, error: "Server misconfiguration (bad contract address)" },
      origin
    );
  }

  try {
    const timeout = getTimeoutMs(env);

    const publicClient = createPublicClient({
      chain: polygonAmoy,
      transport: http(rpcUrl, { timeout }),
    });

    await assertAmoyChain(publicClient);

    // 1) Sanning: är den bekräftad i kontraktet?
    const proof = await readProofWithEvidence({
      publicClient,
      contractAddress,
      hash,
    });

    if (proof.exists) {
      return json(200, statusConfirmed({ hash, ...proof }), origin);
    }

    // 2) Inte bekräftad: om tx finns, kolla om tx faktiskt existerar
    if (tx) {
      const txState = await resolveTxState(publicClient, tx);

      if (txState.known) {
        const observedBlockNumber =
          txState.observedBlockNumber || proof.observedBlockNumber;

        return json(
          200,
          statusSubmittedUnconfirmed({
            hash,
            observedBlockNumber,
            submission: { txHash: tx },
          }),
          origin
        );
      }
      // Om tx okänd: fall tillbaka till NOT_CONFIRMED utan submission.
    }

    return json(
      200,
      statusNotConfirmed({
        hash,
        observedBlockNumber: proof.observedBlockNumber,
      }),
      origin
    );
  } catch (e) {
    return json(503, statusUnknown({ hash, detail: sanitizeError(e) }), origin);
  }
}
