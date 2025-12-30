// functions/api/form-token.js
// Cloudflare Pages Function: /api/form-token
// Returnerar alltid JSON med tydliga felorsaker.
//
// Kräver env (Production):
// - FORM_TOKEN_SECRET (minst 32 tecken, slumpad sträng)
// Valfritt:
// - ALLOWED_ORIGINS = "https://proofy.se,https://www.proofy.se"

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

function safeTrim(v) {
  return String(v ?? "").trim();
}

function getAllowedOrigins(env) {
  const raw = safeTrim(env?.ALLOWED_ORIGINS);
  if (!raw) return ["https://proofy.se", "https://www.proofy.se"];
  return raw.split(",").map(s => s.trim()).filter(Boolean);
}

async function sha256Hex(str) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(str));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== "GET") {
    return json({ ok: false, error: "Use GET" }, 405);
  }

  const secret = safeTrim(env?.FORM_TOKEN_SECRET);
  if (!secret) {
    return json(
      {
        ok: false,
        error: "FORM_TOKEN_SECRET saknas i Pages (Production).",
        fix: [
          "Cloudflare Dashboard → Workers & Pages → proofy-site",
          "Settings → Variables & Secrets",
          "Lägg till FORM_TOKEN_SECRET (Production) och deploya om",
        ],
      },
      500
    );
  }

  // (Valfritt) origin/referer-check. Vi loggar info i svaret om den failar.
  const allowed = getAllowedOrigins(env);
  const origin = safeTrim(request.headers.get("origin"));
  const referer = safeTrim(request.headers.get("referer"));
  const host = safeTrim(request.headers.get("host")).toLowerCase();

  const allowedByHeader =
    allowed.some((d) => origin.startsWith(d)) ||
    allowed.some((d) => referer.startsWith(d)) ||
    host === "proofy.se" ||
    host === "www.proofy.se";

  if (!allowedByHeader) {
    return json(
      {
        ok: false,
        error: "Not allowed (origin/referer/host).",
        debug: { origin, referer, host, allowed },
      },
      403
    );
  }

  const issued = Date.now();
  const hash = await sha256Hex(`${issued}.${secret}`);
  const token = `${issued}.${hash}`;

  return json({ ok: true, token }, 200);
}
