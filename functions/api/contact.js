// functions/api/contact.js
// Cloudflare Pages Function: /api/contact
// - Stöd: JSON + formData + x-www-form-urlencoded
// - Skickar mail via Resend (fetch) med timeout
// - Returnerar ALLTID JSON (aldrig HTML)
// - Returnerar sent:true ENBART när Resend accepterat utskicket

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
      error: "RESEND_API_KEY saknas.",
      hint:
        "Lägg till RESEND_API_KEY i Cloudflare Pages → Settings → Variables and Secrets (Production) och deploya om.",
    };
  }

  const url = "https://api.resend.com/emails";
  const payload = { from, to, subject, html };
  if (replyTo) payload.reply_to = replyTo;

  const controller = new AbortController();
  const timeoutMs = 10000;
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
      error: aborted
        ? "Timeout när vi försökte kontakta Resend."
        : "Kunde inte nå Resend (network/fetch).",
      detail: msg,
      hint:
        "Kontrollera RESEND_API_KEY och att FROM-adress/domän är korrekt. Testa temporärt CONTACT_FROM=onboarding@resend.dev.",
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
      error: "Resend avvisade utskicket.",
      resend_status: res.status,
      resend_response: parsed,
      hint:
        "Vanlig orsak: FROM-adressen/domänen är inte verifierad i Resend eller att sändning inte är aktiverad. Kontrollera Resend → Domains (Verified + Enable Sending).",
    };
  }

  return { ok: true, resend_response: parsed };
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
        endpoint: "/api/contact",
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
        {
          ok: false,
          sent: false,
          error: parsed.error,
          detail: parsed.detail,
          received: parsed.received,
        },
        400
      );
    }

    const data = parsed.data || {};

    // Honeypot: stöd för båda fälten (gamla + nya)
    const hpOld = safeTrim(data["bot-field"]);
    const hpNew = safeTrim(data["company_website"]);
    if (hpOld || hpNew) {
      // Viktigt: svara tydligt så frontend INTE redirectar till /thanks
      return json({ ok: false, sent: false, ignored: true, error: "Spam-skydd triggades." }, 200);
    }

    const name = safeTrim(data.name);
    const email = safeTrim(data.email).toLowerCase();
    const company = safeTrim(data.company);
    const volume = safeTrim(data.volume);
    const message = safeTrim(data.message);

    if (!name || !email || !message) {
      return json({ ok: false, sent: false, error: "Fyll i namn, e-post och meddelande." }, 400);
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

    const CONTACT_TO = env?.CONTACT_TO || "kontakt@proofy.se";
    const FROM_NAME = env?.CONTACT_FROM_NAME || "Proofy";
    const FROM_ADDR = env?.CONTACT_FROM || "onboarding@resend.dev";

    const from = `${FROM_NAME} <${FROM_ADDR}>`;
    const subject = `Ny demo/pilot-förfrågan – ${name}`;

    const html = `
      <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;">
        <h2 style="margin:0 0 12px;">Ny kontaktförfrågan via proofy.se</h2>
        <table style="border-collapse:collapse; width:100%; max-width:760px;">
          <tr><td style="padding:6px 10px; border:1px solid #eee;"><b>Namn</b></td><td style="padding:6px 10px; border:1px solid #eee;">${escapeHtml(name)}</td></tr>
          <tr><td style="padding:6px 10px; border:1px solid #eee;"><b>E-post</b></td><td style="padding:6px 10px; border:1px solid #eee;">${escapeHtml(email)}</td></tr>
          ${
            company
              ? `<tr><td style="padding:6px 10px; border:1px solid #eee;"><b>Byrå/företag</b></td><td style="padding:6px 10px; border:1px solid #eee;">${escapeHtml(company)}</td></tr>`
              : ""
          }
          ${
            volume
              ? `<tr><td style="padding:6px 10px; border:1px solid #eee;"><b>Volym</b></td><td style="padding:6px 10px; border:1px solid #eee;">${escapeHtml(volume)}</td></tr>`
              : ""
          }
        </table>

        <h3 style="margin:16px 0 8px;">Meddelande</h3>
        <pre style="white-space:pre-wrap; background:#f7f7f8; padding:12px; border-radius:10px; border:1px solid #eee; max-width:760px;">${escapeHtml(message)}</pre>

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
          error: sendResult.error || "Kunde inte skicka via Resend.",
          hint: sendResult.hint,
          resend_status: sendResult.resend_status,
          resend_response: sendResult.resend_response,
          detail: sendResult.detail,
        },
        200
      );
    }

    // ✅ Viktigt: sent:true endast när Resend accepterat
    return json({ ok: true, sent: true, resend: sendResult.resend_response }, 200);
  } catch (err) {
    return json(
      { ok: false, sent: false, error: "Serverfel i /api/contact", detail: String(err?.message || err) },
      200
    );
  }
}
