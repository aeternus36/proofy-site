// functions/api/form-token.js
// Cloudflare Pages Function: /api/form-token
// Robust token-utfärdare som fungerar även om Origin saknas.
// Token-format: <ts>.<hash> där hash = SHA256(ts + "." + secret)

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

function isAllowedRequest(request) {
  const origin = safeTrim(request.headers.get("origin"));
  const referer = safeTrim(request.headers.get("referer"));

  const allowed = ["https://proofy.se", "https://www.proofy.se"];

  // Tillåt om EITHER origin eller referer matchar
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

  if (request.method !== "GET") {
    return json({ ok: false }, 405);
  }

  // Fail closed: dela bara ut token till din egen site
  if (!isAllowedRequest(request)) {
    return json({ ok: false }, 403);
  }

  const secret = env?.FORM_TOKEN_SECRET;
  if (!secret) {
    return json({ ok: false, error: "FORM_TOKEN_SECRET saknas." }, 500);
  }

  const ts = Date.now().toString();
  const hash = await sha256Hex(`${ts}.${secret}`);

  return json({ ok: true, token: `${ts}.${hash}` }, 200);
}
