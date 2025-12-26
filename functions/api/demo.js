export async function onRequestPost({ request, env }) {
  try {
    const contentType = request.headers.get("content-type") || "";

    let name = "", email = "", company = "", volume = "", message = "";

    if (contentType.includes("application/json")) {
      const body = await request.json().catch(() => ({}));
      name = (body.name || "").trim();
      email = (body.email || "").trim();
      company = (body.company || "").trim();
      volume = (body.volume || "").trim();
      message = (body.message || "").trim();
    } else {
      const form = await request.formData();
      name = String(form.get("name") || "").trim();
      email = String(form.get("email") || "").trim();
      company = String(form.get("company") || "").trim();
      volume = String(form.get("volume") || "").trim();
      message = String(form.get("message") || "").trim();
    }

    // Enkel server-side validering
    if (!name || !email || !message) {
      return json({ ok: false, error: "Saknar obligatoriska fält (namn, e-post, meddelande)." }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ ok: false, error: "Ogiltig e-postadress." }, 400);
    }

    const toEmail = env.DEMO_TO_EMAIL || "kontakt@proofy.se"; // sätt som env var om du vill
    const subject = `Proofy demo: ${company ? company + " – " : ""}${name}`;
    const text =
`Ny demo-förfrågan

Namn: ${name}
E-post: ${email}
Byrå/företag: ${company || "—"}
Volym: ${volume || "—"}

Meddelande:
${message}

Skickat: ${new Date().toISOString()}
`;

    // MailChannels (fungerar bra på Cloudflare Workers/Pages)
    const mailRes = await fetch("https://api.mailchannels.net/tx/v1/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: toEmail }] }],
        from: { email: "no-reply@proofy.se", name: "Proofy" },
        reply_to: { email, name },
        subject,
        content: [{ type: "text/plain", value: text }]
      })
    });

    if (!mailRes.ok) {
      const errText = await mailRes.text().catch(() => "");
      return json({ ok: false, error: "Kunde inte skicka e-post.", debug: errText.slice(0, 500) }, 502);
    }

    return json({ ok: true }, 200);
  } catch (e) {
    return json({ ok: false, error: e?.message || "Serverfel." }, 500);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
