// functions/api/contact.js
// Cloudflare Pages Function: /api/contact
// - Honeypots
// - Rate limit via KV (om RL_KV finns)
// - Anti-spam: proofy_token + proofy_ts
// - Returnerar JSON alltid
// - Viktigt: om token saknas -> tydligt fel (400) för legit användare,
//   men soft-blockar misstänkt trafik.

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
  if (!raw) return ["https://proofy.se", "https://www.proofy.se"];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isAllowedRequest(request, env) {
  const origin = safeTrim(request.headers.get("origin"));
  const referer = safeTrim(request.headers.get("referer"));
  const host = safeTrim(request.headers.get("host")).toLowerCase();
  const allowed = getAllowedOrigins(env);

  if (allowed.some((d) => origin.startsWith(d))) return true;
  if (allowed.some((d) => referer.startsWith(d))) return true;

  // Fallback: same-host (för privacy-lägen som strippat headers)
  if (host === "proofy.se" || host === "www.proofy.se") return true;

  return false;
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

    const text = await request.text();
    const t = safeTrim(text);
    if (!t) return { ok: true, data: {} };

    const parsed = JSON.parse(t);
    return { ok: true, data: parsed && typeof parsed === "object" ? parsed : {} };
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

async function rateLimit({ env, key, limit, windowSec }) {
  const kv = env?.RL_KV;
  if (!kv) return { ok: true, mode: "no_kv" };

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

  const softBlock = () => json({ ok: true, sent: false, ignored: true }, 200);

  if (request.method !== "POST") {
    return json({ ok: false, sent: false, error: "Use POST" }, 405);
  }

  if (!isAllowedRequest(request, env)) {
    return softBlock();
  }

  const parsed = await readBody(request);
  if (!parsed.ok) {
    return softBlock();
  }

  const data = parsed.data || {};

  // Honeypots
  const botFieldOld = safeTrim(data["bot-field"]);
  const botFieldNew = safeTrim(data["company_website"]);
  if (botFieldOld || botFieldNew) {
    return softBlock();
  }

  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for") ||
    "unknown";

  // Rate limit (rimligt för B2B test): 30 / 10 min
  const rl = await rateLimit({ env, key: ip, limit: 30, windowSec: 600 });
  if (!rl.ok) {
    return softBlock();
  }

  // Token + timestamp
  const secret = safeTrim(env?.FORM_TOKEN_SECRET);
  const token = safeTrim(data.proofy_token);
  const clientTs = Number(data.proofy_ts || 0);

  // ✅ Här gör vi ett tydligt fel (400) om token saknas, så du ser det direkt.
  // Det här är fortfarande säkert, för spam körs ändå i honeypots/rate-limit/filters.
  if (!secret || !token || !clientTs || !token.includes(".")) {
    return json(
      {
        ok: false,
        sent: false,
        error:
          "Tekniskt fel: formulärtoken saknas. Ladda om sidan och försök igen. Om felet kvarstår, mejla kontakt@proofy.se.",
      },
      400
    );
  }

  const [issuedStr, hash] = token.split(".", 2);
  const issued = Number(issuedStr);
  if (!issued || !hash) {
    return json(
      { ok: false, sent: false, error: "Tekniskt fel: ogiltig formulärtoken." },
      400
    );
  }

  const now = Date.now();

  // Token giltighet max 30 min
  if (now - issued > 30 * 60 * 1000) {
    return json(
      { ok: false, sent: false, error: "Sessionen gick ut. Ladda om sidan och försök igen." },
      400
    );
  }

  // Timingfälla: endast supersnabbt + kort meddelande blockas
  const messagePreview = safeTrim(data.message);
  if (now - clientTs < 300 && messagePreview.length < 20) {
    return softBlock();
  }

  const expected = await sha256Hex(`${issuedStr}.${secret}`);
  if (!timingSafeEqualHex(expected, hash)) {
    return json(
      { ok: false, sent: false, error: "Tekniskt fel: tokenvalidering misslyckades. Ladda om sidan och försök igen." },
      400
    );
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

  // Länkar: hårt filter (vill du tillåta 1 länk, ändra till >=2)
  if (countLinks(message) >= 1) {
    return softBlock();
  }

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
