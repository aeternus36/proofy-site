export async function onRequestPost({ request, env }) {
  try {
    /* --------------------------------------------------
       1) Läs input (stöd JSON + form)
    -------------------------------------------------- */
    const contentType = request.headers.get("content-type") || "";
    let data = {};

    if (contentType.includes("application/json")) {
      data = await request.json();
    } else {
      const fd = await request.formData();
      data = Object.fromEntries(fd.entries());
    }

    const name = String(data.name || "").trim();
    const email = String(data.email || "").trim();
    const company = String(data.company || "").trim();
    const volume = String(data.volume || "").trim();
    const message = String(data.message || "").trim();

    if (!name || !email || !message) {
      return json(
        { ok: false, error: "Fyll i namn, e-post och meddelande." },
        400
      );
    }

    /* --------------------------------------------------
       2) Kontrollera ENV (aldrig krascha!)
    -------------------------------------------------- */
    if (!env.RESEND_API_KEY) {
      return json(
        {
          ok: false,
          error:
            "Servern saknar RESEND_API_KEY. Lägg till den i Cloudflare Pages → Variables and Secrets."
        },
        500
      );
    }

    const toEmail = env.CONTACT_TO || "kontakt@proofy.se";
    const fromEmail = env.CONTACT_FROM || "no-reply@proofy.se";

    /* --------------------------------------------------
       3) Skicka mejl via Resend
    -------------------------------------------------- */
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: `Proofy <${fromEmail}>`,
        to: [toEmail],
        reply_to: email,
        subject: "Ny demo / pilot-förfrågan – Proofy",
        html: `
          <h2>Ny förfrågan</h2>
          <p><b>Namn:</b> ${escape(name)}</p>
          <p><b>E-post:</b> ${escape(email)}</p>
          <p><b>Byrå / företag:</b> ${escape(company || "-")}</p>
          <p><b>Ungefärlig volym:</b> ${escape(volume || "-")}</p>
          <p><b>Meddelande:</b><br/>${escape(message)}</p>
        `
      })
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      return json(
        {
          ok: false,
          error: "Kunde inte skicka mejl.",
          detail: errText
        },
        502
      );
    }

    /* --------------------------------------------------
       4) Klart
    -------------------------------------------------- */
    return json({ ok: true });

  } catch (err) {
    // ABSOLUT VIKTIGT: aldrig låta funktionen krascha
    return json(
      {
        ok: false,
        error: "Internt serverfel i kontaktfunktionen.",
        detail: String(err?.message || err)
      },
      500
    );
  }
}

/* --------------------------------------------------
   Helpers
-------------------------------------------------- */

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function escape(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
