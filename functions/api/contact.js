// functions/api/contact.js
// Cloudflare Pages Function: /api/contact
// Mål:
// - Stoppa direkt-POST spam (Origin/Referer + signed token + tidsfälla)
// - Minska dataläckage i svar
// - Behålla kompatibilitet med JSON + formData + x-www-form-urlencoded
// - Juridiskt: dataminimering (inte skicka onödigt i svar; undvik onödig loggning)

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

function isAllowedOrigin(request) {
  const origin = safeTrim(request.headers.get("origin"));
  const referer = safeTrim(request.headers.get("referer"));

  const allowed = [
    "https://proofy.se",
    "https://www.proofy.se",
  ];

  return allowed.some(d => origin.startsWith(d) || referer.startsWith(d));
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

    if (ct.includes("multipart/form-data") || ct.includes("application/x-www-form-urlencoded")) {
      const fd = await request.formData();
      return { ok: true, data: Object.fromEntries(fd.entries()) };
    }

    const text = await request.text();
    const t = safeTrim(text);
    if (!t) return { ok: true, data: {} };

    // sista försök: JSON
    const parsed = JSON.parse(t);
    return { ok: true, data: parsed && typeof parsed === "object" ? parsed : {} };
  } catch {
    // Fail closed, men svara “snällt” (bots ska inte få detaljer)
    return { ok: false };
  }
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
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqualHex(a, b) {
  // Enkel konstant-tid jämförelse för hex-strängar
  a = String(a || "");
  b = String(b || "");
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function sendViaResend({ env, from, to, replyTo, subject, html }) {
  const apiKey = env?.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, sent: false };
  }

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

    // Läs text men läck inte tillbaka i API-svar
    const _text = await res.text();

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

  // Endast POST. Ta bort GET health-check (minskar “scan surface”).
  if (request.method === "OPTIONS") {
    // CORS behövs egentligen inte för same-origin-form, men vi svarar ändå korrekt.
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

  // Blockera cross-site POST
  if (!isAllowedOrigin(request)) {
    // Soft-fail för att inte ge bots signal
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

  // Signed token + tidsfälla
  const secret = env?.FORM_TOKEN_SECRET;
  const token = safeTrim(data.proofy_token);
  const clientTs = Number(data.proofy_ts || 0);

  if (!secret || !token.includes(".") || !clientTs) {
    return json({ ok: true, sent: false, ignored: true }, 200);
  }

  const [issuedStr, sig] = token.split(".", 2);
  const issued = Number(issuedStr);
  if (!issued || !sig) {
    return json({ ok: true, sent: false, ignored: true }, 200);
  }

  const expected = await hmacHex(secret, issuedStr);
  if (!timingSafeEqualHex(expected, sig)) {
    return json({ ok: true, sent: false, ignored: true }, 200);
  }

  const now = Date.now();
  // token giltig i 30 min
  if (now - issued > 30 * 60 * 1000) {
    return json({ ok: true, sent: false, ignored: true }, 200);
  }

  // tidsfälla: måste ha tagit minst 2.5 sek att skicka
  if (now - clientTs < 2500) {
    return json({ ok: true, sent: false, ignored: true }, 200);
  }

  // Fält
  const name = safeTrim(data.name);
  const email = safeTrim(data.email).toLowerCase();
  const company = safeTrim(data.company);
  const volume = safeTrim(data.volume);
  const message = safeTrim(data.message);

  // Validering
  if (!name || !email || !message) {
    return json({ ok: false, sent: false, error: "Fyll i namn, e-post och beskrivning." }, 400);
  }
  if (!isLikelyEmail(email)) {
    return json({ ok: false, sent: false, error: "E-postadressen verkar inte vara giltig." }, 400);
  }

  // Spamfilter: länkar i message är nästan alltid spam
  if (countLinks(message) >= 1) {
    return json({ ok: true, sent: false, ignored: true }, 200);
  }

  // Dataminimering: ta inte med IP/UA i mailet som standard.
  // (Om du verkligen vill: lägg bakom env-fkn t.ex. INCLUDE_TECH_META=true)
  const createdAt = new Date().toISOString();

  const CONTACT_TO = env?.CONTACT_TO || "kontakt@proofy.se";
  const FROM_NAME = env?.CONTACT_FROM_NAME || "Proofy";
  const FROM_ADDR = env?.CONTACT_FROM || "onboarding@resend.dev";

  const from = `${FROM_NAME} <${FROM_ADDR}>`;
  const subject = `Ny förfrågan (demo/pilot) – ${name}`;

  const html = `
    <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;">
      <h2 style="margin:0 0 12px;">Ny förfrågan via proofy.se</h2>
      <table style="border-collapse:collapse; width:100%; max-width:760px;">
        <tr><td style="padding:6px 10px; border:1px solid #eee;"><b>Namn</b></td><td style="padding:6px 10px; border:1px solid #eee;">${escapeHtml(name)}</td></tr>
        <tr><td style="padding:6px 10px; border:1px solid #eee;"><b>E-post</b></td><td style="padding:6px 10px; border:1px solid #eee;">${escapeHtml(email)}</td></tr>
        ${company ? `<tr><td style="padding:6px 10px; border:1px solid #eee;"><b>Byrå/företag</b></td><td style="padding:6px 10px; border:1px solid #eee;">${escapeHtml(company)}</td></tr>` : ""}
        ${volume ? `<tr><td style="padding:6px 10px; border:1px solid #eee;"><b>Volym</b></td><td style="padding:6px 10px; border:1px solid #eee;">${escapeHtml(volume)}</td></tr>` : ""}
      </table>

      <h3 style="margin:16px 0 8px;">Beskrivning</h3>
      <pre style="white-space:pre-wrap; background:#f7f7f8; padding:12px; border-radius:10px; border:1px solid #eee; max-width:760px;">${escapeHtml(message)}</pre>

      <div style="margin-top:12px; color:#666; font-size:12px;">
        Tid: ${escapeHtml(createdAt)}
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
    // Ingen teknisk detalj tillbaka till klienten
    return json(
      { ok: false, sent: false, error: "Kunde inte skickas. Försök igen eller mejla kontakt@proofy.se." },
      200
    );
  }

  return json({ ok: true, sent: true }, 200);
}
