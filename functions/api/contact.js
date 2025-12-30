// functions/api/contact.js
// Cloudflare Pages Function: /api/contact
// - Kräver proofy_token + proofy_ts (anti-bot)
// - Origin/Referer-skydd (same-site)
// - Honeypots
// - Tidsfälla (minst 300ms innan submit; revisor-vänligt)
// - Token-giltighet (max 30 min)
// - Gratis rate limiting via Cloudflare KV (5/10 min per IP)
// - Skickar mail via Resend
// - Returnerar alltid JSON (soft-fail vid misstänkt trafik)

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

function countLinks(text) {
  const t = String(text || "").toLowerCase();
  const m = t.match(/https?:\/\/|www\.|bit\.ly|t\.co|tinyurl|ow\.ly/g);
  return m ? m.length : 0;
}

async function readBody(request) {
  const ct = (request.headers.get("content-type") || "").toLowerCase();

  try {
    if (ct.includes("application/json")) {
      const data = await request.json();
      return { ok: true, data: data && typeof data === "object" ? data : {} };
    }

    if (
      ct.includes("multipart/form-data") ||
      ct.includes("application/x-www-form-urlencoded")
    ) {
      const fd = await request.formData();
      return { ok: true, data: Object.fromEntries(fd.entries()) };
    }

    // fallback
    const text = await request.text();
    const t = safeTrim(text);
    if (!t) return { ok: true, data: {} };

    const parsed = JSON.parse(t);
    return {
      ok: true,
      data: parsed && typeof parsed === "object" ? parsed : {},
    };
  } catch {
    return { ok: false };
  }
}

async function sha256Hex(str) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(str));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqualHex(a, b) {
  a = String(a || "");
  b = String(b || "");
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

// Gratis rate limiting via KV: 5 försök per 10 min per IP.
// Kräver KV binding: RL_KV -> namespace PROOFY_RL
async function rateLimit({ env, key, limit, windowSec }) {
  const kv = env?.RL_KV;
  if (!kv) return { ok: true }; // om KV saknas: fail-open (övriga skydd finns)

  const now = Date.now();
  const bucket = Math.floor(now / (windowSec * 1000));
  const k = `rl:${key}:${bucket}`;

  const cur = Number(await kv.get(k)) || 0;
  if (cur >= limit) return { ok: false };

  await kv.put(k, String(cur + 1), { expirationTtl: windowSec + 15 });
  return { ok: true };
}

async function sendViaResend({ env, from, to, replyTo, subject, html }) {
  const apiKey = env?.RESEND_API_KEY;
  if (!apiKey) return { ok: false, sent: false };

  const url = "https://api.resend.com/emails";
  const payload = { from, to, subject, html };
  if (replyTo) payload.reply_to = replyTo;

  const controller = new AbortController();
  const timeoutMs = 8000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    // läs men exponera inte detaljer (dataminimering)
    await res.text().catch(() => "");

    if (!res.ok) return { ok: false, sent: false };
    return { ok: true, sent: true };
  } catch {
    return { ok: false, sent: false };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "https://proofy.se",
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "content-type",
      },
    });
  }

  if (request.method !== "POST") {
    return json({ ok: false, sent: false }, 405);
  }

  // Stoppa cross-site posts tidigt (soft-fail)
  if (!isAllowedOrigin(request, env)) {
    return json({ ok: true, sent: false, ignored: true }, 200);
  }

  const parsed = await readBody(request);
  if (!parsed.ok) {
    return json({ ok: true, sent: false, ignored: true }, 200);
  }

  const data = parsed.data || {};

  // Honeypots
  const botFieldOld = safeTrim(data["bot-field"]);
  const botFieldNew = safeTrim(data["company_website"]);
  if (botFieldOld || botFieldNew) {
    return json({ ok: true, sent: false, ignored: true }, 200);
  }

  // IP (för rate limit)
  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for") ||
    "unknown";

  // Rate limit (soft-fail)
  const rl = await rateLimit({ env, key: ip, limit: 5, windowSec: 600 });
  if (!rl.ok) {
    return json({ ok: true, sent: false, ignored: true }, 200);
  }

  // Token + timestamp (måste finnas)
  const secret = env?.FORM_TOKEN_SECRET;
  const token = safeTrim(data.proofy_token);
  const clientTs = Number(data.proofy_ts || 0);

  if (!secret || !token.includes(".") || !clientTs) {
    return json({ ok: true, sent: false, ignored: true }, 200);
  }

  const [issuedStr, hash] = token.split(".", 2);
  const issued = Number(issuedStr);
  if (!issued || !hash) {
    return json({ ok: true, sent: false, ignored: true }, 200);
  }

  const now = Date.now();

  // Token-giltighet: max 30 min
  if (now - issued > 30 * 60 * 1000) {
    return json({ ok: true, sent: false, ignored: true }, 200);
  }

  // Tidsfälla: minst 300ms innan submit (revisor-vänligt)
  // Extra villkor: korta meddelanden + supersnabbt = typiskt bot-mönster
  const messagePreview = safeTrim(data.message);
  if (now - clientTs < 300 && messagePreview.length < 20) {
    return json({ ok: true, sent: false, ignored: true }, 200);
  }

  // Verifiera token hash = SHA256(issued + "." + secret)
  const expected = await sha256Hex(`${issuedStr}.${secret}`);
  if (!timingSafeEqualHex(expected, hash)) {
    return json({ ok: true, sent: false, ignored: true }, 200);
  }

  // Fält
  const name = safeTrim(data.name);
  const email = safeTrim(data.email).toLowerCase();
  const company = safeTrim(data.company);
  const volume = safeTrim(data.volume);
  const message = safeTrim(data.message);

  if (!name || !email || !message) {
    return json(
      { ok: false, sent: false, error: "Fyll i namn, e-post och beskrivning." },
      400
    );
  }
  if (!isLikelyEmail(email)) {
    return json(
      { ok: false, sent: false, error: "E-postadressen verkar inte vara giltig." },
      400
    );
  }

  // Spamfilter: länkar i meddelande är ofta spam (tillåt 0 länkar)
  if (countLinks(message) >= 1) {
    return json({ ok: true, sent: false, ignored: true }, 200);
  }

  const createdAt = new Date().toISOString();

  // Resend inställningar
  const CONTACT_TO = env?.CONTACT_TO || "kontakt@proofy.se";
  const FROM_NAME = env?.CONTACT_FROM_NAME || "Proofy";
  const FROM_ADDR = env?.CONTACT_FROM || "onboarding@resend.dev";
  const from = `${FROM_NAME} <${FROM_ADDR}>`;

  const subject = `Ny förfrågan (demo/pilot) – ${name}`;

  const html = `
    <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;">
      <h2 style="margin:0 0 12px;">Ny förfrågan via proofy.se</h2>
      <table style="border-collapse:collapse; width:100%; max-width:760px;">
        <tr><td style="padding:6px 10px; border:1px solid #eee;"><b>Namn</b></td><td style="padding:6px 10px; border:1px solid #eee;">${escapeHtml(
          name
        )}</td></tr>
        <tr><td style="padding:6px 10px; border:1px solid #eee;"><b>E-post</b></td><td style="padding:6px 10px; border:1px solid #eee;">${escapeHtml(
          email
        )}</td></tr>
        ${
          company
            ? `<tr><td style="padding:6px 10px; border:1px solid #eee;"><b>Byrå/företag</b></td><td style="padding:6px 10px; border:1px solid #eee;">${escapeHtml(
                company
              )}</td></tr>`
            : ""
        }
        ${
          volume
            ? `<tr><td style="padding:6px 10px; border:1px solid #eee;"><b>Volym</b></td><td style="padding:6px 10px; border:1px solid #eee;">${escapeHtml(
                volume
              )}</td></tr>`
            : ""
        }
      </table>

      <h3 style="margin:16px 0 8px;">Beskrivning</h3>
      <pre style="white-space:pre-wrap; background:#f7f7f8; padding:12px; border-radius:10px; border:1px solid #eee; max-width:760px;">${escapeHtml(
        message
      )}</pre>

      <div style="margin-top:12px; color:#666; font-size:12px;">
        Tid: ${escapeHtml(createdAt)}<br/>
        IP: ${escapeHtml(ip)}
      </div>
    </div>
  `;

  const sendResult = await sendViaResend({
    env,
    from,
    to: CONTACT_TO,
    replyTo: email,
    subject,
    html,
  });

  if (!sendResult.ok) {
    return json(
      {
        ok: false,
        sent: false,
        error: "Kunde inte skickas. Försök igen eller mejla kontakt@proofy.se.",
      },
      200
    );
  }

  return json({ ok: true, sent: true }, 200);
}
