import { createPublicClient, http, isHex, isAddress } from "viem";
import { polygonAmoy } from "viem/chains";
import { ABI as PROOFY_ABI } from "./abi.js";

/**
 * Proofy /api/verify
 *
 * Juridik (kontraktssanning):
 * - Aldrig "Bekräftad" utan att kontraktets get() visar bekräftad notering.
 * - "Inskickad – ej bekräftad" endast om tx är känd och ännu inte har ett mined-resultat som gör den "Ej bekräftad".
 * - Vid tekniskt fel: "Kunde inte kontrolleras".
 *
 * Statuskoder (stabila):
 * - CONFIRMED
 * - SUBMITTED_UNCONFIRMED
 * - NOT_CONFIRMED
 * - UNKNOWN
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

function getTimeoutMs(env) {
  const raw = String(env.RPC_TIMEOUT_MS || "").trim();
  if (!raw) return 20_000;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && n <= 60_000 ? Math.floor(n) : 20_000;
}

function makeRequestId() {
  try {
    if (
      globalThis.crypto &&
      typeof globalThis.crypto.randomUUID === "function"
    ) {
      return globalThis.crypto.randomUUID();
    }
  } catch {
    // ignore
  }
  return `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

/**
 * statusCode:
 * - CONFIRMED
 * - SUBMITTED_UNCONFIRMED
 * - NOT_CONFIRMED
 * - UNKNOWN
 */

function statusConfirmed({
  hash,
  timestamp,
  registeredBlockNumber,
  observedBlockNumber,
}) {
  return {
    ok: true,
    statusCode: "CONFIRMED",
    statusText: "Bekräftad",
    hash,
    confirmedAtUnix: timestamp,
    evidence: {
      // Register-evidens (kontraktssanning)
      registeredBlockNumber: registeredBlockNumber || null,
      // Observed = vad denna RPC just nu ser (diagnostik, ej registreringsbevis)
      observedBlockNumber: observedBlockNumber || null,
    },
    submission: null,
    legalText: "Det finns en bekräftad notering för detta kontrollvärde.",
  };
}

function statusSubmittedUnconfirmed({
  hash,
  observedBlockNumber,
  txHash,
  txState,
}) {
  return {
    ok: true,
    statusCode: "SUBMITTED_UNCONFIRMED",
    statusText: "Inskickad – ej bekräftad",
    hash,
    confirmedAtUnix: null,
    evidence: observedBlockNumber ? { observedBlockNumber } : null,
    submission: txHash ? { txHash, txState: txState || null } : null,
    legalText:
      "En transaktionsreferens är känd men bekräftelse kan ännu inte redovisas. Ingen slutsats om bekräftelse kan dras innan status är 'Bekräftad'.",
  };
}

function statusNotConfirmed({ hash, observedBlockNumber, txHash, reason }) {
  return {
    ok: true,
    statusCode: "NOT_CONFIRMED",
    statusText: "Ej bekräftad",
    hash,
    confirmedAtUnix: null,
    evidence: observedBlockNumber ? { observedBlockNumber } : null,
    submission: txHash ? { txHash } : null,
    legalText:
      reason ||
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
  const res = await publicClient.readContract({
    address: contractAddress,
    abi: PROOFY_ABI,
    functionName: "get",
    args: [hash],
  });

  const ok = Array.isArray(res) ? res[0] : res?.ok ?? false;
  const ts = Array.isArray(res) ? res[1] : res?.ts ?? 0n;
  const blockNo = Array.isArray(res) ? res[2] : res?.blockNo ?? 0n;

  const timestamp = Number(ts);

  // ✅ Robust: håll blockNo som BigInt -> string (ingen Number-avrundning)
  let registeredBlockBig = 0n;
  try {
    registeredBlockBig = typeof blockNo === "bigint" ? blockNo : BigInt(blockNo);
  } catch {
    registeredBlockBig = 0n;
  }

  const exists =
    Boolean(ok) &&
    Number.isFinite(timestamp) &&
    timestamp > 0 &&
    registeredBlockBig > 0n;

  // "Observed" = vad denna RPC just nu ser, inte ett bevis om tx eller registreringsblock.
  const observedBlockNumber = await publicClient.getBlockNumber();

  return {
    exists,
    timestamp: exists ? timestamp : 0,
    registeredBlockNumber: exists ? registeredBlockBig.toString() : null,
    observedBlockNumber: observedBlockNumber.toString(),
  };
}

async function resolveTxState(publicClient, txHash) {
  if (!txHash) return { known: false, state: "UNKNOWN" };

  // 1) receipt => mined
  try {
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
    if (receipt) {
      const blockNumber = receipt.blockNumber
        ? receipt.blockNumber.toString()
        : null;
      return {
        known: true,
        state: "MINED",
        receiptStatus: receipt.status || null, // "success" | "reverted" (viem)
        observedBlockNumber: blockNumber,
      };
    }
  } catch {
    // ignore
  }

  // 2) tx => pending i mempool
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

  // ✅ 5/5 audit: servergenererad tid (UTC epoch) i ALLA JSON-svar
  const serverTimeUnix = Math.floor(Date.now() / 1000);
  const timeSource = "server";
  const requestId = makeRequestId();

  if (request.method === "OPTIONS") return corsPreflight(origin);

  if (request.method !== "GET" && request.method !== "POST") {
    // Håll juridisk status inom de fyra statuskoderna.
    return json(
      405,
      {
        ok: false,
        statusCode: "UNKNOWN",
        statusText: "Kunde inte kontrolleras",
        errorCode: "METHOD_NOT_ALLOWED",
        error: "Method Not Allowed",
        hash: null,
        confirmedAtUnix: null,
        evidence: null,
        submission: null,
        legalText:
          "Status kunde inte kontrolleras: felaktig metod för verifieringstjänsten.",
        requestId,
        serverTimeUnix,
        timeSource,
      },
      origin
    );
  }

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
    // Håll juridisk status inom de fyra statuskoderna.
    return json(
      400,
      {
        ok: false,
        statusCode: "UNKNOWN",
        statusText: "Kunde inte kontrolleras",
        errorCode: "BAD_REQUEST",
        error: "Invalid hash format",
        hash: null,
        confirmedAtUnix: null,
        evidence: null,
        submission: null,
        legalText:
          "Status kunde inte kontrolleras: ogiltigt kontrollvärde (Verifierings-ID).",
        requestId,
        serverTimeUnix,
        timeSource,
      },
      origin
    );
  }

  if (tx && !isValidTxHash(tx)) tx = "";

  const rpcUrl = String(env.AMOY_RPC_URL || "").trim();
  const contractAddress = String(env.PROOFY_CONTRACT_ADDRESS || "").trim();

  if (!rpcUrl || !contractAddress) {
    return json(
      500,
      {
        ok: false,
        statusCode: "UNKNOWN",
        statusText: "Kunde inte kontrolleras",
        error: "Server misconfiguration",
        hash,
        confirmedAtUnix: null,
        evidence: null,
        submission: null,
        legalText:
          "Status kunde inte kontrolleras: tjänsten är tillfälligt felkonfigurerad.",
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
        statusCode: "UNKNOWN",
        statusText: "Kunde inte kontrolleras",
        error: "Server misconfiguration (bad contract address)",
        hash,
        confirmedAtUnix: null,
        evidence: null,
        submission: null,
        legalText:
          "Status kunde inte kontrolleras: tjänsten är tillfälligt felkonfigurerad.",
        requestId,
        serverTimeUnix,
        timeSource,
      },
      origin
    );
  }

  try {
    const publicClient = createPublicClient({
      chain: polygonAmoy,
      transport: http(rpcUrl, { timeout: getTimeoutMs(env) }),
    });

    await assertAmoyChain(publicClient);

    // 1) Kontraktssanning: finns den i kontraktet?
    const proof = await readGetWithEvidence({
      publicClient,
      contractAddress,
      hash,
    });

    if (proof.exists) {
      return json(
        200,
        {
          ...statusConfirmed({
            hash,
            timestamp: proof.timestamp,
            registeredBlockNumber: proof.registeredBlockNumber,
            observedBlockNumber: proof.observedBlockNumber,
          }),
          requestId,
          serverTimeUnix,
          timeSource,
        },
        origin
      );
    }

    // 2) Inte bekräftad i kontraktet: om tx angavs, skilj pending/mined-success/mined-reverted
    if (tx) {
      const txState = await resolveTxState(publicClient, tx);

      // Om tx inte är känd av RPC: då kan vi inte säga "inskickad".
      if (!txState.known) {
        return json(
          200,
          {
            ...statusNotConfirmed({
              hash,
              observedBlockNumber: proof.observedBlockNumber,
              txHash: null,
              reason:
                "Ingen bekräftad notering kunde konstateras. Angiven transaktionsreferens kunde inte verifieras vid kontrolltillfället.",
            }),
            requestId,
            serverTimeUnix,
            timeSource,
          },
          origin
        );
      }

      const observedBlockNumber =
        txState.observedBlockNumber || proof.observedBlockNumber;

      if (txState.state === "PENDING") {
        return json(
          200,
          {
            ...statusSubmittedUnconfirmed({
              hash,
              observedBlockNumber,
              txHash: tx,
              txState: "PENDING",
            }),
            requestId,
            serverTimeUnix,
            timeSource,
          },
          origin
        );
      }

      // MINED: om reverted => Ej bekräftad (tx finns men gav ingen bekräftelse)
      if (txState.state === "MINED" && txState.receiptStatus === "reverted") {
        return json(
          200,
          {
            ...statusNotConfirmed({
              hash,
              observedBlockNumber,
              txHash: tx,
              reason:
                "Ingen bekräftad notering kunde konstateras. Angiven transaktionsreferens är minad men gav ingen bekräftelse för detta kontrollvärde.",
            }),
            requestId,
            serverTimeUnix,
            timeSource,
          },
          origin
        );
      }

      // MINED success men fortfarande ej bekräftad i kontraktet => Ej bekräftad
      if (txState.state === "MINED") {
        return json(
          200,
          {
            ...statusNotConfirmed({
              hash,
              observedBlockNumber,
              txHash: tx,
              reason:
                "Ingen bekräftad notering kunde konstateras. Angiven transaktionsreferens är minad men bekräftelse för detta kontrollvärde kan inte redovisas.",
            }),
            requestId,
            serverTimeUnix,
            timeSource,
          },
          origin
        );
      }

      // Fallback (bör ej nås)
      return json(
        200,
        {
          ...statusNotConfirmed({
            hash,
            observedBlockNumber,
            txHash: tx,
          }),
          requestId,
          serverTimeUnix,
          timeSource,
        },
        origin
      );
    }

    // 3) Ingen tx och ej bekräftad i kontraktet
    return json(
      200,
      {
        ...statusNotConfirmed({
          hash,
          observedBlockNumber: proof.observedBlockNumber,
        }),
        requestId,
        serverTimeUnix,
        timeSource,
      },
      origin
    );
  } catch (e) {
    return json(
      503,
      {
        ...statusUnknown({ hash, detail: sanitizeError(e) }),
        requestId,
        serverTimeUnix,
        timeSource,
      },
      origin
    );
  }
}
