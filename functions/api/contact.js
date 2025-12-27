// /functions/api/contact.js
// Cloudflare Pages Function
// - OPTIONS: CORS preflight
// - GET: enkel health/info (för att slippa "404-sida" när du testar i browsern)
// - POST: tar emot form eller JSON, skickar mail via Resend

export async function onRequest(context) {
  const { request, env } = context;

  // ---- CORS/HEADERS (samma tänk som i din nuvarande) ----
  const headers = corsHeaders(request);

  // 1) Preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  // 2) GET (så att /api/contact inte ser "trasig" ut när du öppnar i webbläsaren)
  //    (Din tidigare variant gav 405 — vilket är OK — men här får du en tydligare JSON)
  if (request.method === "GET") {
    return json(
      {
        ok: true,
        route: "/api/contact",
        methods: ["POST"],
        note:
          "Detta endpoint tar emot POST. Öppnar du den i webbläsaren görs GET och då får du detta svar."
      },
      200,
      headers
    );
  }

  // 3) Tillåt endast POST för att skicka
  if (request.method !== "POST") {
    return json(
      { ok: false, error: "Method Not Allowed. Use POST." },
      405,
      headers
    );
  }

  try {
    // ---- 1) Läs input robust ----
    const ct = (request.headers.get("content-type") || "").toLowerCase();
    let data = {};

    if (ct.includes("application/json")) {
      data = await request.json();
    } else {
      // Stöd både multipart/form-data och application/x-www-form-urlencoded
      const fd = await request.formData();
      data = Object.fromEntries(fd.entries());
    }

    // ---- 2) Honeypot (om du skickar bot-field i form) ----
    const botField = String(data["bot-field"] || "").trim();
    if (botField) {
      // Låtsas OK (skicka inget)
      return json({ ok: true }, 200, headers);
    }

    // ---- 3) Plocka fält ----
    const name = String(data.name || "").trim();
    const email = String(data.email || "").trim();
    const company = String(data.company || "").trim();
    const volume = String(data.volume || "").trim();
    const message = String(data.message || "").trim();

    if (!name || !email || !message) {
      return json(
        { ok: false, error: "Fyll i namn, e-post och meddelande." },
        400,
        headers
      );
    }

    // ---- 4) Validera env ----
    // Du har dessa i Cloudflare enligt din screenshot:
    // CONTACT_FROM, CONTACT_FROM_NAME, CONTACT_TO, RESEND_API_KEY
    if (!env.RESEND_API_KEY) {
      return json(
        {
          ok: false,
          error:
            "Servern saknar RESEND_API_KEY. Lägg till den i Cloudflare Pages → Variables and Secrets."
        },
        500,
        headers
      );
    }

    if (!env.CONTACT_FROM || !env.CONTACT_TO) {
      return json(
        {
          ok: false,
          error:
            "Servern saknar CONTACT_FROM/CONTACT_TO. Kontrollera Cloudflare Pages → Variables and Secrets."
        },
        500,
        headers
      );
    }

    const fromName = env.CONTACT_FROM_NAME || "Proofy";
    const fromEmail = env.CONTACT_FROM; // t.ex. no-reply@proofy.se
    const toEmail = env.CONTACT_TO;     // t.ex. kontakt@proofy.se

    // ---- 5) Skapa mail ----
    const subject = `Ny demo/pilot-förfrågan – ${name}`;
    const html = buildHtml({
      name,
      email,
      company,
      volume,
      message
    });

    // ---- 6) Skicka via Resend ----
    // OBS: om du använder egen domän i "from" måste den vara verifierad hos Resend,
    // annars kan Resend neka eller leveransen hamna i spam.
    const resendResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: [toEmail],
        reply_to: email,
        subject,
        html
      })
    });

    if (!resendResp.ok) {
      const detail = await safeText(resendResp);
      return json(
        {
          ok: false,
          error: "Mail kunde inte skickas (Resend-fel).",
          status: resendResp.status,
          detail
        },
        502,
        headers
      );
    }

    // (Valfritt) läs tillbaka id etc
    const payload = await resendResp.json().catch(() => ({}));

    return json(
      { ok: true, id: payload?.id || null },
      200,
      headers
    );
  } catch (err) {
    // Viktigt: returnera kontrollerat fel istället för 502 utan info
    return json(
      {
        ok: false,
        error: "Serverfel i /api/contact",
        detail: String(err?.message || err)
      },
      500,
      headers
    );
  }
}

/* ---------------- Helpers ---------------- */

function corsHeaders(request) {
  const origin = request.headers.get("origin") || "*";
  return new Headers({
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
}

function json(obj, status = 200, headers) {
  const h = headers instanceof Headers ? headers : new Headers(headers || {});
  // Se till att content-type är JSON
  if (!h.get("content-type")) {
    h.set("content-type", "application/json; charset=utf-8");
  }
  h.set("cache-control", "no-store");

  return new Response(JSON.stringify(obj), {
    status,
    headers: h
  });
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildHtml({ name, email, company, volume, message }) {
  const msg = escapeHtml(message).replace(/\n/g, "<br>");
  return `
    <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; line-height:1.45">
      <h2 style="margin:0 0 12px">Ny kontakt från Proofy.se</h2>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse; width:100%; max-width:720px">
        <tr><td style="padding:6px 0; width:180px"><b>Namn</b></td><td style="padding:6px 0">${escapeHtml(name)}</td></tr>
        <tr><td style="padding:6px 0"><b>E-post</b></td><td style="padding:6px 0">${escapeHtml(email)}</td></tr>
        <tr><td style="padding:6px 0"><b>Byrå / företag</b></td><td style="padding:6px 0">${escapeHtml(company || "-")}</td></tr>
        <tr><td style="padding:6px 0"><b>Ungefärlig volym</b></td><td style="padding:6px 0">${escapeHtml(volume || "-")}</td></tr>
      </table>
      <hr style="margin:14px 0; border:none; border-top:1px solid #e6e6e6" />
      <div style="white-space:normal">${msg}</div>
    </div>
  `;
}

async function safeText(res) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
