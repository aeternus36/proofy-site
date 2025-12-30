// functions/api/pilot.js
// Cloudflare Pages Function: /api/pilot
// - JSON + formData + x-www-form-urlencoded
// - Anti-spam: honeypot + token från /api/form-token (FORM_TOKEN_SECRET)
// - Returnerar ALLTID JSON (så frontend kan visa pill + redirect)
// - Mail via Resend (timeout)

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

async function sha256Hex(str) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(str));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Verifierar token från /api/form-token:
// token = "<issued>.<sha256(`${issued}.${FORM_TOKEN_SECRET}`)>"
async function verifyFormToken({ env, token, clientTs }) {
  const secret = safeTrim(env?.FORM_TOKEN_SECRET);
  if (!secret) return { ok: false, reason: "FORM_TOKEN_SECRET saknas" };

  const t = safeTrim(token);
  const ts = Number(safeTrim(clientTs));
  if (!t || !Number.isFinite(ts)) return { ok: false, reason: "Token eller timestamp saknas." };

  const now = Date.now();

  // 1) Timestamp rimlig (±10 min)
  if (Math.abs(now - ts) > 10 * 60 * 1000) {
    return { ok: false, reason: "Ogiltig tid (timestamp utanför tillåtet fönster)." };
  }

  // 2) tokenformat
  const parts = t.split(".");
  if (parts.length !== 2) return { ok: false, reason: "Ogiltigt tokenformat." };

  const issued = Number(parts[0]);
  const hash = parts[1];

  if (!Number.isFinite(issued) || issued < 1_600_000_000_000) {
    return { ok: false, reason: "Ogiltig token-tid." };
  }

  // 3) token får inte vara för gammal
  if (now - issued > 10 * 60 * 1000) {
    return { ok: false, reason: "Token har gått ut. Ladda om sidan och försök igen." };
  }

  // 4) matcha hash exakt som /api/form-token gör
  const expected = await sha256Hex(`${issued}.${secret}`);
  if (expected !== hash) {
    return { ok: false, reason: "Token matchar inte. Ladda om sidan och försök igen." };
  }

  return { ok: true };
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
    const aborted =
      msg.toLowerCase().includes("aborted") ||
      msg.toLowerCase().includes("abort") ||
      msg.toLowerCase().includes("timeout");

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
      hint: "Vanlig orsak: FROM-adressen/domänen är inte verifierad i Resend, eller 'Enable Sending' är av. Kontrollera Resend → Domains.",
    };
  }

  return { ok: true, sent: true, resend_response: parsed };
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
      return json(
        { ok: false, sent: false, error: parsed.error, detail: parsed.detail, received: parsed.received },
        400
      );
    }

    const data = parsed.data || {};

    // Honeypots
    const botFieldOld = safeTrim(data["bot-field"]);
    const botFieldNew = safeTrim(data["company_website"]);
    if (botFieldOld || botFieldNew) {
      return json({ ok: true, ignored: true, sent: false }, 200);
    }

    // Token (från /api/form-token)
    const token = safeTrim(data.proofy_token);
    const clientTs = safeTrim(data.proofy_ts);
    const v = await verifyFormToken({ env, token, clientTs });
    if (!v.ok) {
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
    const ip =
      request.headers.get("cf-connecting-ip") ||
      request.headers.get("x-forwarded-for") ||
      "";
    const ua = request.headers.get("user-agent") || "";

    const TO = env?.PILOT_TO || env?.CONTACT_TO || "kontakt@proofy.se";
    const FROM_NAME = env?.CONTACT_FROM_NAME || "Proofy";
    const FROM_ADDR = env?.CONTACT_FROM || "onboarding@resend.dev";

    const from = `${FROM_NAME} <${FROM_ADDR}>`;
    const subject = `Pilotförfrågan – ${company}`;

    const html = `
      <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;">
        <h2 style="margin:0 0 12px;">Ny pilotförfrågan via proofy.se/pilot</h2>
        <table style="border-collapse:collapse; width:100%; max-width:760px;">
          <tr><td style="padding:6px 10px; border:1px solid #eee;"><b>Namn</b></td><td style="padding:6px 10px; border:1px solid #eee;">${escapeHtml(name)}</td></tr>
          <tr><td style="padding:6px 10px; border:1px solid #eee;"><b>E-post</b></td><td style="padding:6px 10px; border:1px solid #eee;">${escapeHtml(email)}</td></tr>
          <tr><td style="padding:6px 10px; border:1px solid #eee;"><b>Byrå / företag</b></td><td style="padding:6px 10px; border:1px solid #eee;">${escapeHtml(company)}</td></tr>
          ${role ? `<tr><td style="padding:6px 10px; border:1px solid #eee;"><b>Roll</b></td><td style="padding:6px 10px; border:1px solid #eee;">${escapeHtml(role)}</td></tr>` : ""}
        </table>

        <h3 style="margin:16px 0 8px;">Case (valfritt)</h3>
        <pre style="white-space:pre-wrap; background:#f7f7f8; padding:12px; border-radius:10px; border:1px solid #eee; max-width:760px;">${escapeHtml(message || "—")}</pre>

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
      { ok: false, sent: false, error: "Serverfel i /api/pilot", detail: String(err?.message || err) },
      200
    );
  }
}
