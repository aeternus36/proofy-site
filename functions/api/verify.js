import { createPublicClient, http, isHex } from "viem";
import { polygonAmoy } from "viem/chains";

/**
 * Proofy /api/verify
 *
 * Juridik:
 * - Aldrig "bekräftad" utan att en bekräftad notering kan läsas.
 * - Om ingen bekräftelse finns: "Ej bekräftad" eller "Inskickad – ej bekräftad" (om submission finns).
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

function isValidBytes32Hex(hash) {
  return (
    typeof hash === "string" &&
    hash.startsWith("0x") &&
    hash.length === 66 &&
    isHex(hash)
  );
}

// txHash är 32 bytes => 0x + 64 hex
function isValidTxHash(tx) {
  return (
    typeof tx === "string" &&
    tx.startsWith("0x") &&
    tx.length === 66 &&
    isHex(tx)
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

function toSafeUint64(ts) {
  const v = BigInt(ts ?? 0n);
  if (v <= 0n) return 0;
  const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
  return v <= maxSafe ? Number(v) : Number(maxSafe);
}

function sanitizeError(e) {
  const msg =
    (e && typeof e === "object" && "shortMessage" in e && e.shortMessage) ||
    (e && typeof e === "object" && "message" in e && e.message) ||
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

function statusNotConfirmed({ hash, observedBlockNumber }) {
  return {
    ok: true,
    statusCode: "NOT_CONFIRMED",
    statusText: "Ej bekräftad",
    hash,
    confirmedAtUnix: null,
    evidence: observedBlockNumber ? { observedBlockNumber } : null,
    submission: null,
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

export async function onRequest({ request, env }) {
  const origin = request.headers.get("Origin") || "";

  if (request.method === "OPTIONS") return corsPreflight(origin || "*");
  if (request.method !== "GET" && request.method !== "POST") {
    return json(405, { ok: false, error: "Method Not Allowed" }, origin);
  }

  // Accept hash from GET query or POST body. Optional tx for better UX.
  let hash = "";
  let tx = "";

  if (request.method === "GET") {
    const url = new URL(request.url);
    hash = String((url.searchParams.get("hash") || url.searchParams.get("id") || "").trim());
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
      transport: http(rpcUrl),
    });

    const proof = await readGetWithEvidence({
      publicClient,
      contractAddress,
      hash,
    });

    if (proof.exists) {
      return json(200, statusConfirmed({ hash, ...proof }), origin);
    }

    // Om någon redan har skickat in en registrering (txHash finns), visa "Inskickad – ej bekräftad"
    if (tx) {
      return json(
        200,
        statusSubmittedUnconfirmed({
          hash,
          observedBlockNumber: proof.observedBlockNumber,
          submission: { txHash: tx },
        }),
        origin
      );
    }

    return json(
      200,
      statusNotConfirmed({ hash, observedBlockNumber: proof.observedBlockNumber }),
      origin
    );
  } catch (e) {
    return json(503, statusUnknown({ hash, detail: sanitizeError(e) }), origin);
  }
}
