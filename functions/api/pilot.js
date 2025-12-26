export async function onRequestPost(context) {
  try {
    const req = context.request;
    const form = await req.formData();

    // Honeypot
    const bot = (form.get("bot-field") || "").toString().trim();
    if (bot) return new Response("OK", { status: 200 });

    const name = (form.get("name") || "").toString().trim();
    const email = (form.get("email") || "").toString().trim();
    const company = (form.get("company") || "").toString().trim();
    const role = (form.get("role") || "").toString().trim();
    const message = (form.get("message") || "").toString().trim();

    if (!name || !email || !company) {
      return new Response("Saknar obligatoriska fält.", { status: 400 });
    }
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailOk) {
      return new Response("Ogiltig e-postadress.", { status: 400 });
    }

    // Miljövariabler i Cloudflare Pages:
    // CONTACT_TO = "kontakt@proofy.se"
    // CONTACT_FROM = "no-reply@proofy.se"
    // CONTACT_FROM_NAME = "Proofy"
    const TO = context.env.CONTACT_TO || "kontakt@proofy.se";
    const FROM = context.env.CONTACT_FROM || "no-reply@proofy.se";
    const FROM_NAME = context.env.CONTACT_FROM_NAME || "Proofy";

    const subject = `Pilotförfrågan – ${company}`;

    const lines = [
      "Ny PILOT-förfrågan från proofy.se/pilot",
      "",
      `Namn: ${name}`,
      `E-post: ${email}`,
      `Byrå / företag: ${company}`,
      `Roll: ${role || "—"}`,
      "",
      "Case (valfritt):",
      message || "—"
    ];
    const textBody = lines.join("\n");

    // MailChannels via Cloudflare
    const payload = {
      personalizations: [{ to: [{ email: TO }] }],
      from: { email: FROM, name: FROM_NAME },
      reply_to: { email, name },
      subject,
      content: [{ type: "text/plain", value: textBody }]
    };

    const r = await fetch("https://api.mailchannels.net/tx/v1/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!r.ok) {
      const errText = await r.text().catch(() => "");
      console.log("MailChannels error:", r.status, errText);
      return new Response("Kunde inte skicka just nu. Försök igen eller mejla kontakt@proofy.se.", { status: 502 });
    }

    return Response.redirect(`${new URL(req.url).origin}/thanks.html`, 302);

  } catch (e) {
    console.log("Pilot form exception:", e);
    return new Response("Tekniskt fel. Försök igen eller mejla kontakt@proofy.se.", { status: 500 });
  }
}
