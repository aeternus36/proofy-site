// functions/api/form-token.js
// Cloudflare Pages Function: /api/form-token
// Syfte: utfärda signerad token för att stoppa direkt-POST spam.

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

function isAllowedOrigin(request) {
  const origin = safeTrim(request.headers.get("origin"));
  const referer = safeTrim(request.headers.get("referer"));

  const allowed = [
    "https://proofy.se",
    "https://www.proofy.se",
  ];

  return allowed.some((d) => origin.startsWith(d) || referer.startsWith(d));
}

async function hmacHex(secret, msg) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== "GET") {
    return json({ ok: false }, 405);
  }

  // Token ska bara delas ut till din site
  if (!isAllowedOrigin(request)) {
    return json({ ok: false }, 403);
  }

  const secret = env?.FORM_TOKEN_SECRET;
  if (!secret) {
    // Fail closed: utan secret ska token-endpoint inte användas
    return json({ ok: false, error: "FORM_TOKEN_SECRET saknas." }, 500);
  }

  const issued = Date.now().toString();
  const sig = await hmacHex(secret, issued);
  // token format: <issuedMs>.<sig>
  return json({ ok: true, token: `${issued}.${sig}` }, 200);
}
