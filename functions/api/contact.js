// functions/api/contact.js
// Cloudflare Pages Function: /api/contact
// - Stöd: JSON + formData + x-www-form-urlencoded
// - Skickar mail via Resend (fetch)
// - Returnerar ALLTID JSON (ingen 502 pga crash)

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
  // enkel men stabil kontroll
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
  // Returnerar: { ok:true, data } eller { ok:false, error, detail, status }
  const ct = (request.headers.get("content-type") || "").toLowerCase();

  try {
    if (ct.includes("application/json")) {
      // OBS: om body inte är JSON -> kastar exception -> fångas här och returneras snyggt
      const data = await request.json();
      return { ok: true, data: data && typeof data === "object" ? data : {} };
    }

    // Form posts (multipart/form-data eller x-www-form-urlencoded)
    if (
      ct.includes("multipart/form-data") ||
      ct.includes("application/x-www-form-urlencoded")
    ) {
      const fd = await request.formData();
      return { ok: true, data: Object.fromEntries(fd.entries()) };
    }

    // Fallback: försök läsa text och tolka som JSON om möjligt
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
      status: 500,
      error: "RESEND_API_KEY saknas.",
      hint:
        "Lägg till RESEND_API_KEY i Cloudflare Pages → Settings → Variables and Secrets (Production) och deploya om.",
    };
  }

  // Resend endpoint
  const url = "https://api.resend.com/emails";

  const payload = { from, to, subject, html };
  if (replyTo) payload.reply_to = replyTo;

  let res;
  let text;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    text = await res.text();
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error: "Kunde inte nå Resend (network/fetch).",
      detail: String(err?.message || err),
    };
  }

  // Resend svarar ofta JSON, men vi tar text säkert
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }

  if (!res.ok) {
    // Vanligaste orsaken: FROM-domänen är inte verifierad i Resend.
    return {
      ok: false,
      status: 502,
      error: "Resend avvisade utskicket.",
      resend_status: res.status,
      resend_response: parsed,
      hint:
        "Vanlig orsak: FROM-adressen/domänen är inte verifierad i Resend. Testa tillfälligt from='onboarding@resend.dev' eller verifiera proofy.se i Resend → Domains.",
    };
  }

  return { ok: true, status: 200, resend_response: parsed };
}

export async function onRequest(context) {
  const { request, env } = context;

  // OPTIONS (CORS preflight)
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { ...CORS_HEADERS } });
  }

  // GET: health/info (så du ser att endpointen lever)
  if (request.method === "GET") {
    return json(
      {
        ok: true,
        endpoint: "/api/contact",
        methods: ["POST"],
        expects: "application/json OR form-data OR x-www-form-urlencoded",
      },
      200
    );
  }

  // Endast POST för att skicka
  if (request.method !== "POST") {
    return json({ ok: false, error: "Use POST" }, 405);
  }

  try {
    // 1) Läs body robust
    const parsed = await readBody(request);
    if (!parsed.ok) {
      return json(
        {
          ok: false,
          error: parsed.error,
          detail: parsed.detail,
          received: parsed.received,
        },
        parsed.status || 400
      );
    }

    const data = parsed.data || {};

    // 2) Honeypot (om du har bot-field i formuläret)
    const botField = safeTrim(data["bot-field"]);
    if (botField) {
      // Låtsas OK (skicka inget)
      return json({ ok: true, ignored: true }, 200);
    }

    // 3) Normalisera fält
    const name = safeTrim(data.name);
    const email = safeTrim(data.email).toLowerCase();
    const company = safeTrim(data.company);
    const volume = safeTrim(data.volume);
    const message = safeTrim(data.message);

    // 4) Validering
    if (!name || !email || !message) {
      return json({ ok: false, error: "Fyll i namn, e-post och meddelande." }, 400);
    }
    if (!isLikelyEmail(email)) {
      return json({ ok: false, error: "E-postadressen verkar inte vara giltig." }, 400);
    }

    // 5) Bygg mail
    const createdAt = new Date().toISOString();
    const ip =
      request.headers.get("cf-connecting-ip") ||
      request.headers.get("x-forwarded-for") ||
      "";
    const ua = request.headers.get("user-agent") || "";

    const CONTACT_TO = env?.CONTACT_TO || "kontakt@proofy.se";
    const FROM_NAME = env?.CONTACT_FROM_NAME || "Proofy";

    // OBS: Om proofy.se inte är verifierad i Resend kommer detta ofta faila.
    // Du kan testa med: onboarding@resend.dev tills domänen är verifierad.
    const FROM_ADDR = env?.CONTACT_FROM || "onboarding@resend.dev";

    const from = `${FROM_NAME} <${FROM_ADDR}>`;
    const subject = `Ny demo/pilot-förfrågan – ${name}`;

    const html = `
      <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;">
        <h2 style="margin:0 0 12px;">Ny kontaktförfrågan via proofy.se</h2>
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

        <h3 style="margin:16px 0 8px;">Meddelande</h3>
        <pre style="white-space:pre-wrap; background:#f7f7f8; padding:12px; border-radius:10px; border:1px solid #eee; max-width:760px;">${escapeHtml(
          message
        )}</pre>

        <div style="margin-top:12px; color:#666; font-size:12px;">
          Tid: ${escapeHtml(createdAt)}<br/>
          ${ip ? `IP: ${escapeHtml(ip)}<br/>` : ""}
          ${ua ? `User-Agent: ${escapeHtml(ua)}<br/>` : ""}
        </div>
      </div>
    `;

    // 6) Skicka via Resend
    const sendResult = await sendViaResend({
      env,
      from,
      to: CONTACT_TO,
      replyTo: email,
      subject,
      html,
    });

    if (!sendResult.ok) {
      // Viktigt: returnera JSON istället för att låta något krascha → inga 502
      return json(
        {
          ok: false,
          error: sendResult.error,
          hint: sendResult.hint,
          resend_status: sendResult.resend_status,
          resend_response: sendResult.resend_response,
          detail: sendResult.detail,
        },
        sendResult.status || 502
      );
    }

    // 7) OK
    return json({ ok: true, resend: sendResult.resend_response }, 200);
  } catch (err) {
    // SISTA skyddsnätet: aldrig 502
    return json(
      { ok: false, error: "Serverfel i /api/contact", detail: String(err?.message || err) },
      500
    );
  }
}
