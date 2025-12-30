// /functions/api/pilot.js  (NY/ERSÄTT HELA FILEN)
//
// Cloudflare Pages Function: /api/pilot
// - JSON + formData + x-www-form-urlencoded
// - Anti-spam: honeypot + proofy_token/proofy_ts (steg 3)
// - Returnerar ALLTID JSON
// - Mail via Resend
// - (Valfritt) Rate limit via KV-binding: PROOFY_RL

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS, GET",
  "access-control-allow-headers": "content-type",
};

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

function safeTrim(v) {
  return String(v ?? "").trim();
}

function isLikelyEmail(email) {
  const e = safeTrim(email).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function readBody(request) {
  const ct = (request.headers.get("content-type") || "").toLowerCase();

  try {
    if (ct.includes("application/json")) {
      const data = await request.json();
      return { ok: true, data: data && typeof data === "object" ? data : {} };
    }

    if (ct.includes("multipart/form-data") || ct.includes("application/x-www-form-urlencoded")) {
      const fd = await request.formData();
      return { ok: true, data: Object.fromEntries(fd.entries()) };
    }

    const text = await request.text();
    const t = safeTrim(text);
    if (!t) return { ok: true, data: {} };

    try {
      const parsed = JSON.parse(t);
      return { ok: true, data: parsed && typeof parsed === "object" ? parsed : {} };
    } catch {
      return {
        ok: false,
        status: 400,
        error: "Body måste vara JSON eller formulärdata.",
        detail: "Kunde inte tolka request body som JSON.",
        received: t.slice(0, 200),
      };
    }
  } catch (err) {
    return {
      ok: false,
      status: 400,
      error: "Ogiltig JSON i request body.",
      detail: String(err?.message || err),
    };
  }
}

async function sendViaResend({ env, from, to, replyTo, subject, html }) {
  const apiKey = env?.RESEND_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      sent: false,
      error: "RESEND_API_KEY saknas.",
      hint: "Lägg till RESEND_API_KEY i Cloudflare Pages → Settings → Variables and Secrets (Production) och deploya om.",
    };
  }

  const url = "https://api.resend.com/emails";
  const payload = { from, to, subject, html };
  if (replyTo) payload.reply_to = replyTo;

  const controller = new AbortController();
  const timeoutMs = 8000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  let text = "";
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    text = await res.text();
  } catch (err) {
    const msg = String(err?.message || err);
    const aborted = msg.toLowerCase().includes("aborted") || msg.toLowerCase().includes("timeout");
    return {
      ok: false,
      sent: false,
      error: aborted ? "Timeout när vi försökte kontakta Resend." : "Kunde inte nå Resend (network/fetch).",
      detail: msg,
      hint: "Kontrollera RESEND_API_KEY och att FROM-adress/domän är korrekt/verifierad i Resend.",
    };
  } finally {
    clearTimeout(timeoutId);
  }

  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }

  if (!res.ok) {
    return {
      ok: false,
      sent: false,
      error: "Resend avvisade utskicket.",
      resend_status: res.status,
      resend_response: parsed,
      hint: "Vanlig orsak: FROM-adressen/domänen är inte verifierad i Resend. Kontrollera Resend → Domains.",
    };
  }

  return { ok: true, sent: true, resend_response: parsed };
}

function hexToBytes(hex) {
  const clean = String(hex || "").trim();
  if (!/^[0-9a-f]+$/i.test(clean) || clean.length % 2 !== 0) return null;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function hmacSha256Hex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  const bytes = new Uint8Array(sig);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

async function verifyProofyToken({ env, token, clientTs }) {
  const secret = env?.PROOFY_FORM_SECRET;
  if (!secret) {
    return { ok: false, reason: "PROOFY_FORM_SECRET saknas i env." };
  }

  const t = safeTrim(token);
  const ts = Number(safeTrim(clientTs));
  if (!t || !Number.isFinite(ts)) {
    return { ok: false, reason: "Token eller timestamp saknas." };
  }

  // 1) kontrollera att submit-tiden är rimlig (skydd mot bots)
  const now = Date.now();
  const skewMs = Math.abs(now - ts);
  if (skewMs > 10 * 60 * 1000) {
    return { ok: false, reason: "Ogiltig tid (timestamp utanför tillåtet fönster)." };
  }

  // 2) tokenformat: "<issuedAt>.<hexsig>"
  const parts = t.split(".");
  if (parts.length !== 2) {
    return { ok: false, reason: "Ogiltigt tokenformat." };
  }

  const issuedAt = Number(parts[0]);
  const sigHex = parts[1];
  if (!Number.isFinite(issuedAt) || issuedAt < 1_600_000_000_000) {
    return { ok: false, reason: "Ogiltig token-tid." };
  }
  if (!hexToBytes(sigHex) || sigHex.length < 32) {
    return { ok: false, reason: "Ogiltig token-signatur." };
  }

  // 3) token får inte vara för gammal
  if (now - issuedAt > 10 * 60 * 1000) {
    return { ok: false, reason: "Token har gått ut. Ladda om sidan och försök igen." };
  }

  // 4) verifiera signaturen (matchar /api/form-token)
  const expected = await hmacSha256Hex(secret, String(issuedAt));
  if (expected !== sigHex) {
    return { ok: false, reason: "Token matchar inte. Ladda om sidan och försök igen." };
  }

  return { ok: true };
}

async function rateLimit({ env, request, key, limit = 8, windowSec = 60 }) {
  // Kräver KV-binding: env.PROOFY_RL
  const kv = env?.PROOFY_RL;
  if (!kv) return { ok: true, skipped: true };

  const now = Math.floor(Date.now() / 1000);
  const bucket = Math.floor(now / windowSec);
  const k = `${key}:${bucket}`;

  const currentRaw = await kv.get(k);
  const current = Number(currentRaw || "0");
  if (current >= limit) return { ok: false };

  const next = current + 1;
  await kv.put(k, String(next), { expirationTtl: windowSec * 2 });
  return { ok: true };
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { ...CORS_HEADERS } });
  }

  if (request.method === "GET") {
    return json(
      {
        ok: true,
        endpoint: "/api/pilot",
        methods: ["POST"],
        expects: "application/json OR form-data OR x-www-form-urlencoded",
      },
      200
    );
  }

  if (request.method !== "POST") {
    return json({ ok: false, sent: false, error: "Use POST" }, 405);
  }

  try {
    const parsed = await readBody(request);
    if (!parsed.ok) {
      return json({ ok: false, sent: false, error: parsed.error, detail: parsed.detail, received: parsed.received }, 400);
    }

    const data = parsed.data || {};

    // Honeypots
    const botFieldOld = safeTrim(data["bot-field"]);
    const botFieldNew = safeTrim(data["company_website"]);
    if (botFieldOld || botFieldNew) {
      return json({ ok: true, ignored: true, sent: false }, 200);
    }

    // Rate limit (per IP)
    const ip =
      request.headers.get("cf-connecting-ip") ||
      request.headers.get("x-forwarded-for") ||
      "";
    const rl = await rateLimit({ env, request, key: `pilot:${ip || "noip"}`, limit: 6, windowSec: 60 });
    if (!rl.ok) {
      return json({ ok: false, sent: false, error: "För många försök. Vänta en minut och prova igen." }, 200);
    }

    // Anti-spam token (steg 3)
    const token = safeTrim(data.proofy_token);
    const clientTs = safeTrim(data.proofy_ts);
    const v = await verifyProofyToken({ env, token, clientTs });
    if (!v.ok) {
      // Returnera INTE ignored här – det ska vara ett tydligt fel så du kan debugga.
      return json({ ok: false, sent: false, error: v.reason }, 200);
    }

    const name = safeTrim(data.name);
    const email = safeTrim(data.email).toLowerCase();
    const company = safeTrim(data.company);
    const role = safeTrim(data.role);
    const message = safeTrim(data.message);

    if (!name || !email || !company) {
      return json({ ok: false, sent: false, error: "Fyll i namn, e-post och byrå/företag." }, 400);
    }
    if (!isLikelyEmail(email)) {
      return json({ ok: false, sent: false, error: "E-postadressen verkar inte vara giltig." }, 400);
    }

    const createdAt = new Date().toISOString();
    const ua = request.headers.get("user-agent") || "";

    // Env:
    // PILOT_TO (valfritt, annars fallback till CONTACT_TO eller kontakt@proofy.se)
    // CONTACT_FROM (måste vara verifierad i Resend)
    // CONTACT_FROM_NAME
    const TO =
      env?.PILOT_TO ||
      env?.CONTACT_TO ||
      "kontakt@proofy.se";

    const FROM_NAME = env?.CONTACT_FROM_NAME || "Proofy";
    const FROM_ADDR = env?.CONTACT_FROM || "onboarding@resend.dev";

    const from = `${FROM_NAME} <${FROM_ADDR}>`;
    const subject = `Ny pilotförfrågan – ${name}`;

    const html = `
      <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;">
        <h2 style="margin:0 0 12px;">Ny pilotförfrågan via proofy.se</h2>

        <table style="border-collapse:collapse; width:100%; max-width:760px;">
          <tr><td style="padding:6px 10px; border:1px solid #eee;"><b>Namn</b></td><td style="padding:6px 10px; border:1px solid #eee;">${escapeHtml(name)}</td></tr>
          <tr><td style="padding:6px 10px; border:1px solid #eee;"><b>E-post</b></td><td style="padding:6px 10px; border:1px solid #eee;">${escapeHtml(email)}</td></tr>
          <tr><td style="padding:6px 10px; border:1px solid #eee;"><b>Byrå/Företag</b></td><td style="padding:6px 10px; border:1px solid #eee;">${escapeHtml(company)}</td></tr>
          ${role ? `<tr><td style="padding:6px 10px; border:1px solid #eee;"><b>Roll</b></td><td style="padding:6px 10px; border:1px solid #eee;">${escapeHtml(role)}</td></tr>` : ""}
        </table>

        ${message ? `<h3 style="margin:16px 0 8px;">Meddelande</h3>
        <pre style="white-space:pre-wrap; background:#f7f7f8; padding:12px; border-radius:10px; border:1px solid #eee; max-width:760px;">${escapeHtml(message)}</pre>` : ""}

        <div style="margin-top:12px; color:#666; font-size:12px;">
          Tid: ${escapeHtml(createdAt)}<br/>
          ${ip ? `IP: ${escapeHtml(ip)}<br/>` : ""}
          ${ua ? `User-Agent: ${escapeHtml(ua)}<br/>` : ""}
        </div>
      </div>
    `;

    const sendResult = await sendViaResend({
      env,
      from,
      to: TO,
      replyTo: email,
      subject,
      html,
    });

    if (!sendResult.ok) {
      return json(
        {
          ok: false,
          sent: false,
          error: sendResult.error,
          hint: sendResult.hint,
          resend_status: sendResult.resend_status,
          resend_response: sendResult.resend_response,
          detail: sendResult.detail,
        },
        200
      );
    }

    return json({ ok: true, sent: true, resend: sendResult.resend_response }, 200);
  } catch (err) {
    return json(
      {
        ok: false,
        sent: false,
        error: "Serverfel i /api/pilot",
        detail: String(err?.message || err),
      },
      200
    );
  }
}
