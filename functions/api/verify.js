import { createPublicClient, http, isHex } from "viem";
import { polygonAmoy } from "viem/chains";

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

const PROOFY_ABI = [
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

const DEFAULTS = {
  // Om du vill hård-styra CORS origins:
  // env.ALLOWED_ORIGINS = "https://proofy.se,https://www.proofy.se"
};

function json(status, obj, origin) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    Vary: "Origin",
    "X-Content-Type-Options": "nosniff",
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
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
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

// txHash är 32 bytes => 0x + 64 hex
function isValidTxHash(tx) {
  return (
    typeof tx === "string" &&
    /^0x[0-9a-fA-F]{64}$/.test(tx.trim()) &&
    isHex(tx.trim())
  );
}

function isValidAddressHex(addr) {
  return (
    typeof addr === "string" &&
    /^0x[0-9a-fA-F]{40}$/.test(addr.trim()) &&
    isHex(addr.trim())
  );
}

function toSafeUint64(ts) {
  const v = BigInt(ts ?? 0n);
  if (v <= 0n) return 0;
  const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
  return v <= maxSafe ? Number(v) : Number(maxSafe);
}

function sanitizeError(e) {
  const msg =
    (e && typeof e === "object" && (e.shortMessage || e.message)) ||
    String(e);
  return String(msg).slice(0, 600);
}

/**
 * Gemensam statusmodell
 * statusCode:
 * - CONFIRMED
 * - SUBMITTED_UNCONFIRMED
 * - NOT_CONFIRMED
 * - UNKNOWN
 */
function statusConfirmed({ hash, timestamp, observedBlockNumber }) {
  return {
    ok: true,
    statusCode: "CONFIRMED",
    statusText: "Bekräftad",
    hash,
    confirmedAtUnix: timestamp,
    evidence: { observedBlockNumber },
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
  // submission är valfri: om vi vet txHash men den inte lett till bekräftelse ännu
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
}

async function readGetWithEvidence({ publicClient, contractAddress, hash }) {
  const [ok, ts] = await publicClient.readContract({
    address: contractAddress,
    abi: PROOFY_ABI,
    functionName: "get",
    args: [hash],
  });

  const timestamp = toSafeUint64(ts);
  const exists = Boolean(ok) && timestamp !== 0;

  const observedBlockNumber = await publicClient.getBlockNumber();
  return {
    exists,
    timestamp,
    observedBlockNumber: observedBlockNumber.toString(),
  };
}

/**
 * Om tx skickas in kan vi förbättra sanningshalten:
 * - receipt hittas => tx är mined (kan vara success/revert)
 * - transaction hittas men receipt saknas => tx är broadcast/pending
 * - inget hittas => tx okänd (behandla som ej angiven)
 */
async function resolveTxState(publicClient, txHash) {
  if (!txHash) return { known: false, state: "UNKNOWN" };

  // 1) receipt (mined)
  try {
    const receipt = await publicClient.getTransactionReceipt({
      hash: txHash,
    });
    if (receipt) {
      // status kan vara "success" eller "reverted" (viem), men vi ska inte dra juridiska slutsatser av revert
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
    // receipt finns ofta inte om tx är pending eller okänd
  }

  // 2) transaction (pending/broadcast)
  try {
    const tx = await publicClient.getTransaction({ hash: txHash });
    if (tx) {
      return { known: true, state: "PENDING" };
    }
  } catch {
    // okänd
  }

  return { known: false, state: "UNKNOWN" };
}

export async function onRequest({ request, env }) {
  const origin = pickCorsOrigin(request.headers.get("Origin"), env);

  if (request.method === "OPTIONS") return corsPreflight(origin);

  if (request.method !== "GET" && request.method !== "POST") {
    return json(405, { ok: false, error: "Method Not Allowed" }, origin);
  }

  // Accept hash from GET query or POST body. Optional tx for better UX.
  let hash = "";
  let tx = "";

  if (request.method === "GET") {
    const url = new URL(request.url);
    hash = String(
      (url.searchParams.get("hash") ||
        url.searchParams.get("id") ||
        "").trim()
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

  // tx är valfri. Om den är med men ogiltig: behandla som ej angiven (inte hårt fel).
  if (tx && !isValidTxHash(tx)) tx = "";

  const rpcUrl = String(env.AMOY_RPC_URL || "").trim();
  const contractAddress = String(env.PROOFY_CONTRACT_ADDRESS || "").trim();

  if (!rpcUrl || !contractAddress) {
    return json(500, { ok: false, error: "Server misconfiguration" }, origin);
  }
  if (!isValidAddressHex(contractAddress)) {
    return json(
      500,
      { ok: false, error: "Server misconfiguration (bad contract address)" },
      origin
    );
  }

  try {
    const publicClient = createPublicClient({
      chain: polygonAmoy,
      // timeout för edge-runtime
      transport: http(rpcUrl, { timeout: 20_000 }),
    });

    await assertAmoyChain(publicClient);

    // 1) Sanning: är den bekräftad i kontraktet?
    const proof = await readGetWithEvidence({
      publicClient,
      contractAddress,
      hash,
    });

    if (proof.exists) {
      return json(200, statusConfirmed({ hash, ...proof }), origin);
    }

    // 2) Om inte bekräftad: om tx finns, kolla om tx faktiskt existerar (pending/mined)
    if (tx) {
      const txState = await resolveTxState(publicClient, tx);

      // Om tx är känd (pending/mined) -> "Inskickad – ej bekräftad"
      if (txState.known) {
        // Om mined kan vi sätta observedBlockNumber från receipt (om den finns),
        // annars behåll proof.observedBlockNumber.
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

      // Om tx är okänd: behandla som ej given (för att inte påstå submission)
      // Fall tillbaka till NOT_CONFIRMED utan submission.
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
