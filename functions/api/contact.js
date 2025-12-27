export async function onRequest(context) {
  const { request } = context;

  // Tillåt CORS/OPTIONS om du behöver (skadar inte)
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }

  if (request.method !== "POST") {
    return json(
      { ok: false, error: "Method Not Allowed. Use POST." },
      405,
      corsHeaders()
    );
  }

  try {
    const ct = (request.headers.get("content-type") || "").toLowerCase();
    let data = {};

    if (ct.includes("application/json")) {
      data = await request.json();
    } else if (ct.includes("application/x-www-form-urlencoded")) {
      const text = await request.text();
      data = Object.fromEntries(new URLSearchParams(text));
    } else {
      // multipart/form-data eller annat
      const fd = await request.formData();
      data = Object.fromEntries(fd.entries());
    }

    // Honeypot
    const botField = String(data["bot-field"] || "").trim();
    if (botField) {
      // Låtsas OK men skicka inget
      return json({ ok: true }, 200, corsHeaders());
    }

    const name = String(data.name || "").trim();
    const email = String(data.email || "").trim();
    const company = String(data.company || "").trim();
    const volume = String(data.volume || "").trim();
    const message = String(data.message || "").trim();

    if (!name || !email || !message) {
      return json(
        { ok: false, error: "Fyll i namn, e-post och meddelande." },
        400,
        corsHeaders()
      );
    }

    // ====== EMAIL (Resend) ======
    // Du måste lägga in RESEND_API_KEY i Cloudflare Pages → Settings → Variables and Secrets (Production)
    const RESEND_API_KEY = context.env.RESEND_API_KEY;
    const CONTACT_TO = context.env.CONTACT_TO || "kontakt@proofy.se";
    const CONTACT_FROM = context.env.CONTACT_FROM || "no-reply@proofy.se";
    const CONTACT_FROM_NAME = context.env.CONTACT_FROM_NAME || "Proofy";

    if (!RESEND_API_KEY) {
      // Viktigt: returnera 500 tydligt så du ser felet direkt
      return json(
        {
          ok: false,
          error:
            "Servern saknar RESEND_API_KEY. Lägg till den i Cloudflare Pages → Settings → Variables and Secrets (Production) och deploya om.",
        },
        500,
        corsHeaders()
      );
    }

    // Resend kräver ofta att FROM-domänen är verifierad.
    // Om du inte verifierat proofy.se i Resend, använd en verifierad avsändare tills vidare.
    const subject = `Ny demo/pilot-förfrågan – ${name}${company ? " (" + company + ")" : ""}`;

    const html = `
      <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;line-height:1.45">
        <h2 style="margin:0 0 12px">Ny demo/pilot-förfrågan</h2>
        <table style="border-collapse:collapse">
          <tr><td style="padding:6px 10px;color:#555">Namn</td><td style="padding:6px 10px"><b>${escapeHtml(name)}</b></td></tr>
          <tr><td style="padding:6px 10px;color:#555">E-post</td><td style="padding:6px 10px"><b>${escapeHtml(email)}</b></td></tr>
          <tr><td style="padding:6px 10px;color:#555">Byrå/Företag</td><td style="padding:6px 10px">${escapeHtml(company || "-")}</td></tr>
          <tr><td style="padding:6px 10px;color:#555">Volym</td><td style="padding:6px 10px">${escapeHtml(volume || "-")}</td></tr>
        </table>
        <div style="margin-top:14px;padding:12px;border:1px solid #eee;border-radius:10px">
          <div style="color:#555;font-size:12px;margin-bottom:6px">Meddelande</div>
          <div style="white-space:pre-wrap">${escapeHtml(message)}</div>
        </div>
        <p style="margin-top:14px;color:#666;font-size:12px">
          Skickat via proofy.se kontaktformulär.
        </p>
      </div>
    `;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "authorization": `Bearer ${RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: `${CONTACT_FROM_NAME} <${CONTACT_FROM}>`,
        to: [CONTACT_TO],
        reply_to: email,
        subject,
        html,
      }),
    });

    const resendBody = await resendRes.text();

    if (!resendRes.ok) {
      return json(
        {
          ok: false,
          error:
            "Mejl kunde inte skickas via Resend. Kontrollera att FROM-domänen är verifierad och att RESEND_API_KEY är korrekt.",
          detail: resendBody.slice(0, 800),
        },
        502,
        corsHeaders()
      );
    }

    return json({ ok: true }, 200, corsHeaders());

  } catch (err) {
    return json(
      { ok: false, error: "Serverfel i /api/contact", detail: String(err?.message || err) },
      500,
      corsHeaders()
    );
  }
}

function json(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
  };
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
