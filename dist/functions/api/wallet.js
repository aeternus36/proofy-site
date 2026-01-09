

import { createPublicClient, http, isHex, isAddress, formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
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
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    Vary: "Origin",
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
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "Content-Type",
      "access-control-max-age": "86400",
      Vary: "Origin",
    },
  });
}

function sanitizeError(e) {
  const msg =
    (e && typeof e === "object" && (e.shortMessage || e.message)) || String(e);
  return String(msg).slice(0, 500);
}

function normalizeHexWith0x(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
}

function isValidPrivateKeyHex(pk) {
  return (
    typeof pk === "string" &&
    /^0x[0-9a-fA-F]{64}$/.test(pk.trim()) &&
    isHex(pk.trim())
  );
}

function normalizeAddress(addr) {
  if (typeof addr !== "string") return "";
  return addr.trim();
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

export async function onRequest({ request, env }) {
  const origin = pickCorsOrigin(request?.headers?.get("Origin"), env);

  if (request?.method === "OPTIONS") return corsPreflight(origin);
  if (request?.method && request.method !== "GET") {
    return json(405, { ok: false, error: "Method Not Allowed" }, origin);
  }

  try {
    const rpcUrl = String(env.AMOY_RPC_URL || "").trim();

    // Föredra publik adress för ren statuskontroll (ingen hemlighet behövs).
    const configuredAddress = normalizeAddress(env.PROOFY_WALLET_ADDRESS);

    // Fallback: härledning av adress via hemlig nyckel (endast om adress saknas).
    const privateKey = normalizeHexWith0x(env.PROOFY_PRIVATE_KEY);

    if (!rpcUrl) {
      return json(
        500,
        {
          ok: false,
          error: "Saknar AMOY_RPC_URL (anslutningsadress till nätverket).",
        },
        origin
      );
    }

    let address = "";

    if (configuredAddress) {
      if (!isAddress(configuredAddress)) {
        return json(
          500,
          {
            ok: false,
            error:
              "PROOFY_WALLET_ADDRESS är angiven men har fel format (förväntad adress).",
          },
          origin
        );
      }
      address = configuredAddress;
    } else {
      if (!isValidPrivateKeyHex(privateKey)) {
        return json(
          500,
          {
            ok: false,
            error:
              "Saknar tjänsteadress. Ange PROOFY_WALLET_ADDRESS (rekommenderas) eller korrekt PROOFY_PRIVATE_KEY.",
          },
          origin
        );
      }
      const account = privateKeyToAccount(privateKey);
      address = account.address;
    }

    const client = createPublicClient({
      chain: polygonAmoy,
      transport: http(rpcUrl, { timeout: 20_000 }),
    });

    const [chainId, balance] = await Promise.all([
      assertAmoyChain(client),
      client.getBalance({ address }),
    ]);

    // Exakt, revisionsvänlig representation:
    // - balanceBaseUnit: minsta enhet som sträng
    // - balanceDisplay: decimalsträng utan flyttalsavrundning
    const balanceBaseUnit = balance.toString();
    const balanceDisplay = formatUnits(balance, 18);

    return json(
      200,
      {
        ok: true,
        chainId,
        address,
        balanceBaseUnit,
        balanceDisplay,
        note:
          "Visar tillgängliga medel för att kunna betala nätverksavgifter vid registrering.",
      },
      origin
    );
  } catch (e) {
    return json(
      500,
      { ok: false, error: sanitizeError(e) },
      origin
    );
  }
}
