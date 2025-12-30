// functions/api/form-token.js
// Cloudflare Pages Function: /api/form-token
// Skapar anti-spam token som frontend lägger i hidden fields:
// - proofy_token: "<issuedMs>.<sha256(issuedMs + '.' + secret)>"
// - frontend sätter proofy_ts = Date.now() precis innan submit
//
// Kräver env:
// - FORM_TOKEN_SECRET = lång hemlig sträng
// (valfritt) ALLOWED_ORIGINS = "https://proofy.se,https://www.proofy.se"

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function safeTrim(v) {
  return String(v ?? "").trim();
}

function getAllowedOrigins(env) {
  const raw = safeTrim(env?.ALLOWED_ORIGINS);
  if (raw) {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return ["https://proofy.se", "https://www.proofy.se"];
}

function isAllowedOrigin(request, env) {
  const origin = safeTrim(request.headers.get("origin"));
  const referer = safeTrim(request.headers.get("referer"));
  const allowed = getAllowedOrigins(env);
  return allowed.some((d) => origin.startsWith(d) || referer.startsWith(d));
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

  // Endast GET
  if (request.method !== "GET") {
    return json({ ok: false, error: "Use GET" }, 405);
  }

  // Blocka cross-site (CSRF-skydd), soft men tydligt
  if (!isAllowedOrigin(request, env)) {
    return json({ ok: false, error: "Origin not allowed" }, 403);
  }

  const secret = safeTrim(env?.FORM_TOKEN_SECRET);
  if (!secret) {
    return json({ ok: false, error: "FORM_TOKEN_SECRET saknas" }, 500);
  }

  const issued = Date.now();
  const hash = await sha256Hex(`${issued}.${secret}`);
  const token = `${issued}.${hash}`;

  return json({ ok: true, token }, 200);
}
