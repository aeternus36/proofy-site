import { createPublicClient, http, isHex } from "viem";
import { polygonAmoy } from "viem/chains";

const DEFAULTS = {
  // Om du vill hård-styra CORS origins:
  // env.ALLOWED_ORIGINS = "https://proofy.se,https://www.proofy.se"
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
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    },
  });
}

function sanitizeError(e) {
  const msg =
    (e && typeof e === "object" && (e.shortMessage || e.message)) ||
    String(e);
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
}

export async function onRequest({ request, env }) {
  const origin = pickCorsOrigin(request.headers.get("Origin"), env);

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
    const publicClient = createPublicClient({
      chain: polygonAmoy,
      transport: http(rpcUrl, { timeout: 20_000 }),
    });

    await assertAmoyChain(publicClient);

    // 1) Försök receipt först (mined)
    const receipt = await publicClient
      .getTransactionReceipt({ hash: tx })
      .catch(() => null);

    if (receipt) {
      return json(
        200,
        {
          ok: true,
          mined: true,
          pending: false,
          status: receipt.status, // "success" | "reverted"
          blockNumber: receipt.blockNumber?.toString?.() ?? null,
          to: receipt.to ?? null,
          from: receipt.from ?? null,
          transactionHash: receipt.transactionHash ?? tx,
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

    // 3) Okänd tx (kan vara för gammal RPC, fel nätverk, eller helt enkelt inte existerar)
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
