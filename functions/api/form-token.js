// functions/api/form-token.js
// Cloudflare Pages Function: /api/form-token
// Returnerar { ok:true, token:"<issued>.<sha256(issued.secret)>" }
//
// Kräver env (Production):
// - FORM_TOKEN_SECRET
// Valfritt:
// - ALLOWED_ORIGINS="https://proofy.se,https://www.proofy.se"

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
  if (!raw) return ["https://proofy.se", "https://www.proofy.se"];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function isAllowedRequest(request, env) {
  const origin = safeTrim(request.headers.get("origin"));
  const referer = safeTrim(request.headers.get("referer"));
  const host = safeTrim(request.headers.get("host")).toLowerCase();
  const allowed = getAllowedOrigins(env);

  // 1) Tillåt om Origin matchar
  if (origin && allowed.some((d) => origin.startsWith(d))) return true;

  // 2) Tillåt om Referer matchar
  if (referer && allowed.some((d) => referer.startsWith(d))) return true;

  // 3) Tillåt om host är din egna domän (viktigt när man öppnar direkt i adressfältet)
  if (host === "proofy.se" || host === "www.proofy.se") return true;

  return false;
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

  if (!isAllowedRequest(request, env)) {
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
