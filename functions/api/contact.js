/**
 * /functions/api/contact.js  (Cloudflare Pages Function)
 *
 * Route:  /api/contact
 *
 * Förväntade env-variabler (Cloudflare Pages → Settings → Variables and Secrets):
 *  - RESEND_API_KEY           (Secret)  (ex: re_....)
 *  - CONTACT_TO              (Plaintext) ex: kontakt@proofy.se
 *  - CONTACT_FROM            (Plaintext) ex: no-reply@proofy.se  (måste vara verifierad i Resend)
 *  - CONTACT_FROM_NAME       (Plaintext) ex: Proofy
 *
 * Valfria:
 *  - CONTACT_REPLY_TO        (Plaintext) ex: kontakt@proofy.se
 *  - CONTACT_SUBJECT_PREFIX  (Plaintext) ex: "[Proofy] "
 *
 * Viktigt:
 *  - Resend kräver att "from"-domänen är verifierad, annars får du 4xx från Resend.
 *  - Den här koden försöker aldrig använda Node-bibliotek (inga imports), bara fetch.
 */

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

const CORS_HEADERS = {
  // Samma origin räcker egentligen, men detta gör felsökning lättare.
  // Om du vill låsa ner: byt "*" mot "https://proofy.se"
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, GET, OPTIONS",
  "access-control-allow-headers": "content-type",
};

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...JSON_HEADERS, ...CORS_HEADERS, ...extraHeaders },
  });
}

function safeTrim(v) {
  return (v ?? "").toString().trim();
}

function isLikelyEmail(email) {
  // Enkel validering (tillräcklig för kontaktformulär)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function escapeHtml(str) {
  return (str ?? "").toString().replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "\"": return "&quot;";
      case "'": return "&#039;";
      default: return c;
    }
  });
}

/**
 * Parse request-body robust.
 * - application/json
 * - x-www-form-urlencoded
 * - multipart/form-data
 */
async function readBody(request) {
  const ct = (request.headers.get("content-type") || "").toLowerCase();

  // JSON
  if (ct.includes("application/json")) {
    const text = await request.text();
    if (!text.trim()) return { ok: true, data: {} };

    try {
      const parsed = JSON.parse(text);
      // Skydda mot att folk skickar fel typ
      if (parsed && typeof parsed === "object") return { ok: true, data: parsed };
      return { ok: false, status: 400, error: "JSON-body måste vara ett objekt." };
    } catch (e) {
      return {
        ok: false,
        status: 400,
        error:
          "Ogiltig JSON. Skicka en JSON-body som t.ex. {\"name\":\"...\",\"email\":\"...\",\"message\":\"...\"}.",
        detail: String(e?.message || e),
        received: text.slice(0, 200),
      };
    }
  }

  // Form posts (urlencoded eller multipart)
  // OBS: request.formData() fungerar bara om body faktiskt är formdata/urlencoded.
  // Därför: fallback-läs text och försök urlencoded om formData kastar.
  try {
    const fd = await request.formData();
    const data = Object.fromEntries(fd.entries());
    return { ok: true, data };
  } catch (_) {
    // Fallback: urlencoded via text
    const text = await request.text();
    if (!text.trim()) return { ok: true, data: {} };

    try {
      const params = new URLSearchParams(text);
      const data = {};
      for (const [k, v] of params.entries()) data[k] = v;
      return { ok: true, data };
    } catch (e) {
      return {
        ok: false,
        status: 400,
        error: "Kunde inte läsa formulärdata.",
        detail: String(e?.message || e),
      };
    }
  }
}

/**
 * Skicka mail via Resend.
 * Docs: https://resend.com/docs/api-reference/emails/send-email
 */
async function sendViaResend({ env, payload }) {
  const apiKey = safeTrim(env.RESEND_API_KEY);
  if (!apiKey) {
    return {
      ok: false,
      status: 500,
      error: "Servern saknar RESEND_API_KEY. Lägg till den i Cloudflare Pages → Variables and Secrets.",
    };
  }

  const fromEmail = safeTrim(env.CONTACT_FROM) || "no-reply@proofy.se";
  const fromName = safeTrim(env.CONTACT_FROM_NAME) || "Proofy";
  const toEmail = safeTrim(env.CONTACT_TO) || "kontakt@proofy.se";
  const replyTo = safeTrim(env.CONTACT_REPLY_TO) || toEmail;

  const subjectPrefix = safeTrim(env.CONTACT_SUBJECT_PREFIX) || "[Proofy] ";
  const subject = `${subjectPrefix}Ny demo/pilot-förfrågan`;

  // Resend "from" format: "Name <email@domain>"
  const from = `${fromName} <${fromEmail}>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [toEmail],
      reply_to: replyTo,
      subject,
      html: payload.html,
      text: payload.text,
    }),
  });

  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch (_) { /* ignore */ }

  if (!res.ok) {
    // Resend returnerar ofta fel som JSON. Vi skickar tillbaka tydligt fel istället för 502.
    return {
      ok: false,
      status: 502, // upstream fail (mail provider)
      error: "Resend kunde inte skicka mailet.",
      resend_status: res.status,
      resend_response: data || text,
      hint:
        "Kontrollera att CONTACT_FROM-domänen är verifierad i Resend, och att RESEND_API_KEY har rätt behörighet.",
    };
  }

  return { ok: true, status: 200, resend: data || { raw: text } };
}

/**
 * Huvud-handler.
 * Vi hanterar GET/POST/OPTIONS här så du slipper 404/HTML/konstiga svar.
 */
export async function onRequest(context) {
  const { request, env } = context;

  // OPTIONS (CORS preflight)
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { ...CORS_HEADERS } });
  }

  // GET: visa att endpointen lever (och hur man ska posta)
  if (request.method === "GET") {
    return json(
      {
        ok: false,
        error: "Use POST",
        example_json: {
          name: "Test",
          email: "test@test.se",
          company: "Testbyrå AB",
          volume: "50-200/månad",
          message: "Hej! Detta är ett test.",
        },
      },
      200
    );
  }

  // Endast POST får faktiskt skicka kontakt
  if (request.method !== "POST") {
    return json({ ok: false, error: "Method Not Allowed. Use POST." }, 405);
  }

  try {
    // 1) Läs body robust
    const parsed = await readBody(request);
    if (!parsed.ok) {
      return json(
        { ok: false, error: parsed.error, detail: parsed.detail, received: parsed.received },
        parsed.status || 400
      );
    }

    const data = parsed.data || {};

    // Honeypot (om du har bot-field i formulär)
    const botField = safeTrim(data["bot-field"]);
    if (botField) {
      // Låtsas OK (skicka inget) för att inte ge spammare signaler
      return json({ ok: true, ignored: true }, 200);
    }

    // 2) Normalisera fält
    const name = safeTrim(data.name);
    const email = safeTrim(data.email).toLowerCase();
    const company = safeTrim(data.company);
    const volume = safeTrim(data.volume);
    const message = safeTrim(data.message);

    // 3) Validering
    if (!name || !email || !message) {
      return json({ ok: false, error: "Fyll i namn, e-post och meddelande." }, 400);
    }
    if (!isLikelyEmail(email)) {
      return json({ ok: false, error: "E-postadressen verkar inte vara giltig." }, 400);
    }

    // 4) Bygg mail-innehåll
    const createdAt = new Date().toISOString();
    const ip =
      request.headers.get("cf-connecting-ip") ||
      request.headers.get("x-forwarded-for") ||
      "";

    const userAgent = request.headers.get("user-agent") || "";

    const text = [
      "Ny kontaktförfrågan via proofy.se",
      "",
      `Namn: ${name}`,
      `E-post: ${email}`,
      company ? `Byrå/företag: ${company}` : "",
      volume ? `Volym: ${volume}` : "",
      "",
      "Meddelande:",
      message,
      "",
      `Tid: ${createdAt}`,
      ip ? `IP: ${ip}` : "",
      userAgent ? `User-Agent: ${userAgent}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const html = `
      <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;">
        <h2 style="margin:0 0 12px;">Ny kontaktförfrågan via proofy.se</h2>

        <table style="border-collapse:collapse; width:100%; max-width:720px;">
          <tr><td style="padding:6px 10px; border:1px solid #eee;"><b>Namn</b></td><td style="padding:6px 10px; border:1px solid #eee;">${escapeHtml(name)}</td></tr>
          <tr><td style="padding:6px 10px; border:1px solid #eee;"><b>E-post</b></td><td style="padding:6px 10px; border:1px solid #eee;">${escapeHtml(email)}</td></tr>
          ${company ? `<tr><td style="padding:6px 10px; border:1px solid #eee;"><b>Byrå/företag</b></td><td style="padding:6px 10px; border:1px solid #eee;">${escapeHtml(company)}</td></tr>` : ""}
          ${volume ? `<tr><td style="padding:6px 10px; border:1px solid #eee;"><b>Volym</b></td><td style="padding:6px 10px; border:1px solid #eee;">${escapeHtml(volume)}</td></tr>` : ""}
        </table>

        <h3 style="margin:16px 0 8px;">Meddelande</h3>
        <pre style="white-space:pre-wrap; background:#f7f7f8; padding:12px; border-radius:10px; border:1px solid #eee; max-width:720px;">${escapeHtml(message)}</pre>

        <div style="margin-top:12px; color:#666; font-size:12px;">
          Tid: ${escapeHtml(createdAt)}<br/>
          ${ip ? `IP: ${escapeHtml(ip)}<br/>` : ""}
          ${userAgent ? `User-Agent: ${escapeHtml(userAgent)}` : ""}
        </div>
      </div>
    `.trim();

    // 5) Skicka via Resend
    const sendResult = await sendViaResend({
      env,
      payload: { text, html },
    });

    if (!sendResult.ok) {
      // Viktigt: returnera tydlig info istället för att kasta → undvik 502 från Cloudflare.
      return json(
        {
          ok: false,
          error: sendResult.error,
          hint: sendResult.hint,
          resend_status: sendResult.resend_status,
          resend_response: sendResult.resend_response,
        },
        sendResult.status || 502
      );
    }

    // 6) OK
    return json({ ok: true }, 200);

  } catch (err) {
    // Om något oväntat händer: returnera kontrollerat fel (inte krascha).
    return json(
      {
        ok: false,
        error: "Serverfel i /api/contact",
        detail: String(err?.message || err),
      },
      500
    );
  }
}
