export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    // 1) Läs input robust (stöd både JSON och form-post)
    const ct = request.headers.get("content-type") || "";
    let data = {};

    if (ct.includes("application/json")) {
      data = await request.json();
    } else {
      // Form post (multipart/form-data eller x-www-form-urlencoded)
      const fd = await request.formData();
      data = Object.fromEntries(fd.entries());
    }

    const name = (data.name || "").toString().trim();
    const email = (data.email || "").toString().trim();
    const company = (data.company || "").toString().trim();
    const volume = (data.volume || "").toString().trim();
    const message = (data.message || "").toString().trim();

    if (!name || !email || !message) {
      return json({ ok: false, error: "Fyll i namn, e-post och meddelande." }, 400);
    }

    // 2) Exempel: skicka via extern mail-API (INTE SMTP direkt från Cloudflare)
    // Du måste ha en riktig mail-leverantör (t.ex. Resend, Mailgun, Postmark, SendGrid)
    // och lägga API-nyckel i env.
    //
    // Om du redan har en leverantör i din kod: lägg den här och se till att env-variabler finns.
    //
    // Nedan är ett "stub"-svar så du kan få 200 OK direkt och verifiera flödet.
    // Byt ut stubben mot din riktiga sändning.

    // TODO: ersätt med din email-sändning
    // await sendEmailViaProvider({ env, name, email, company, volume, message });

    // 3) Returnera OK
    return json({ ok: true }, 200);

  } catch (err) {
    // Viktigt: returnera kontrollerat fel istället för att krascha => slipper 502
    return json(
      { ok: false, error: "Serverfel i /api/contact", detail: String(err?.message || err) },
      500
    );
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
