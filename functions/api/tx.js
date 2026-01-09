import { createPublicClient, http, isHex } from "viem";
import { polygonAmoy } from "viem/chains";

/**
 * tx.js
 * GET /api/tx?tx=<0x...>
 * Returnerar mined/pending/status för en txHash.
 *
 * UI berörs inte av denna fil.
 */

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
      // Tillåt även POST för att undvika preflight-problem i vissa fetch-wrappers
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "Content-Type",
      "access-control-max-age": "86400",
      vary: "Origin",
    },
  });
}

function sanitizeError(e) {
  const msg =
    (e && typeof e === "object" && (e.shortMessage || e.message)) || String(e);
  return String(msg).slice(0, 400);
}

function isValidTxHash(tx) {
  return (
    typeof tx === "string" &&
    /^0x[0-9a-fA-F]{64}$/.test(tx.trim()) &&
    isHex(tx.trim())
  );
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

export async function onRequest({ request, env }) {
  const origin = pickCorsOrigin(request?.headers?.get("Origin"), env);

  if (request.method === "OPTIONS") return corsPreflight(origin);
  if (request.method !== "GET") {
    return json(405, { ok: false, error: "Method Not Allowed" }, origin);
  }

  const url = new URL(request.url);
  const tx = String(url.searchParams.get("tx") || "").trim();

  if (!isValidTxHash(tx)) {
    return json(400, { ok: false, error: "Invalid tx" }, origin);
  }

  const rpcUrl = String(env.AMOY_RPC_URL || "").trim();
  if (!rpcUrl) {
    return json(500, { ok: false, error: "Server misconfiguration" }, origin);
  }

  try {
    const timeout = getTimeoutMs(env);

    const publicClient = createPublicClient({
      chain: polygonAmoy,
      transport: http(rpcUrl, { timeout }),
    });

    await assertAmoyChain(publicClient);

    // 1) Receipt först (mined)
    const receipt = await publicClient
      .getTransactionReceipt({ hash: tx })
      .catch(() => null);

    if (receipt) {
      // confirmations: best-effort (om vi kan läsa latest block)
      let confirmations = null;
      try {
        const latest = await publicClient.getBlockNumber();
        if (typeof latest === "bigint" && typeof receipt.blockNumber === "bigint") {
          const diff = latest - receipt.blockNumber;
          confirmations = diff >= 0n ? (diff + 1n).toString() : "0";
        }
      } catch {
        confirmations = null;
      }

      return json(
        200,
        {
          ok: true,
          mined: true,
          pending: false,
          status: receipt.status, // "success" | "reverted"
          blockNumber: receipt.blockNumber?.toString?.() ?? null,
          confirmations,
          to: receipt.to ?? null,
          from: receipt.from ?? null,
          transactionHash: receipt.transactionHash ?? tx,
          gasUsed: receipt.gasUsed?.toString?.() ?? null,
          effectiveGasPrice: receipt.effectiveGasPrice?.toString?.() ?? null,
        },
        origin
      );
    }

    // 2) Om ingen receipt: kolla om tx finns (pending/broadcast)
    const txObj = await publicClient.getTransaction({ hash: tx }).catch(() => null);
    if (txObj) {
      return json(
        200,
        {
          ok: true,
          mined: false,
          pending: true,
          transactionHash: tx,
        },
        origin
      );
    }

    // 3) Okänd tx (kan vara fel nätverk, ej broadcastad, eller RPC saknar historik)
    return json(
      200,
      {
        ok: true,
        mined: false,
        pending: false,
        transactionHash: tx,
      },
      origin
    );
  } catch (e) {
    return json(
      503,
      { ok: false, error: "Tx lookup failed", detail: sanitizeError(e) },
      origin
    );
  }
}
