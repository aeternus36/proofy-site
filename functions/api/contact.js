export async function onRequestPost(context) {
  const { request, env } = context;

  // CORS (om du vill kunna posta från andra domäner i framtiden)
  const corsHeaders = {
    "access-control-allow-origin": env.CORS_ORIGIN || "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
  };

  try {
    // 0) OPTIONS preflight (om någon browser triggar det)
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // 1) Läs input robust (stöd både JSON och form-post)
    const ct = request.headers.get("content-type") || "";
    let data = {};

    if (ct.includes("application/json")) {
      data = await request.json().catch(() => ({}));
    } else if (ct.includes("application/x-www-form-urlencoded")) {
      const text = await request.text();
      const params = new URLSearchParams(text);
      data = Object.fromEntries(params.entries());
    } else {
      // multipart/form-data eller annat som formData klarar
      const fd = await request.formData();
      data = Object.fromEntries(fd.entries());
    }

    // 2) Honeypot
    const botField = (data["bot-field"] || "").toString().trim();
    if (botField) {
      // Låtsas OK men gör inget (spamskydd)
      return json({ ok: true }, 200, corsHeaders);
    }

    const name = (data.name || "").toString().trim();
    const email = (data.email || "").toString().trim();
    const company = (data.company || "").toString().trim();
    const volume = (data.volume || "").toString().trim();
    const message = (data.message || "").toString().trim();

    if (!name || !email || !message) {
      return json(
        { ok: false, error: "Fyll i namn, e-post och meddelande." },
        400,
        corsHeaders
      );
    }

    // Minimal e-postvalidering (tillräckligt för att stoppa uppenbara fel)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ ok: false, error: "Ange en giltig e-postadress." }, 400, corsHeaders);
    }

    // 3) Konfiguration
    const to = (env.CONTACT_TO || "kontakt@proofy.se").trim();
    const from = (env.CONTACT_FROM || "Proofy <no-reply@proofy.se>").trim();
    const subjPrefix = (env.CONTACT_SUBJECT_PREFIX || "Proofy demo").trim();

    if (!env.RESEND_API_KEY) {
      // Detta är bättre än att låtsas "ok:true"
      return json(
        {
          ok: false,
          error:
            "Servern saknar RESEND_API_KEY. Lägg till den i Cloudflare Pages → Variables and Secrets.",
        },
        500,
        corsHeaders
      );
    }

    // 4) Bygg mejl (för revisorer/jurister: tydlig, spårbar, komplett)
    const subject = `${subjPrefix}: ${name}${company ? " – " + company : ""}`;

    const plain = [
      "Ny demo-/pilotförfrågan via proofy.se",
      "",
      `Namn: ${name}`,
      `E-post: ${email}`,
      `Byrå/företag: ${company || "—"}`,
      `Ungefärlig volym: ${volume || "—"}`,
      "",
      "Meddelande:",
      message,
      "",
      `Tidpunkt (UTC): ${new Date().toISOString()}`,
      `User-Agent: ${request.headers.get("user-agent") || "—"}`,
      `IP (CF-Connecting-IP): ${request.headers.get("cf-connecting-ip") || "—"}`,
    ].join("\n");

    // 5) Skicka via Resend
    // Viktigt: sätt Reply-To till användaren så du kan svara direkt.
    const resendResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "authorization": `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        text: plain,
        reply_to: email,
      }),
    });

    const resendData = await resendResp.json().catch(() => ({}));

    // 6) Returnera OK endast om leverantören accepterade
    if (!resendResp.ok) {
      const errMsg =
        (resendData && (resendData.message || resendData.error)) ||
        `E-posttjänsten svarade med HTTP ${resendResp.status}`;

      return json(
        {
          ok: false,
          error:
            "Kunde inte skicka just nu. Försök igen eller mejla kontakt@proofy.se.",
          detail: errMsg,
        },
        502,
        corsHeaders
      );
    }

    return json(
      {
        ok: true,
        id: resendData.id || null,
      },
      200,
      corsHeaders
    );
  } catch (err) {
    return json(
      {
        ok: false,
        error: "Serverfel i /api/contact",
        detail: String(err?.message || err),
      },
      500,
      corsHeaders
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
