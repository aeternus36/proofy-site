export async function onRequest(context) {
  const { request, env } = context;

  // Alltid JSON + CORS
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type"
  };

  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  // Endast POST
  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({ ok: false, error: "Use POST" }),
      { status: 405, headers }
    );
  }

  try {
    const ct = request.headers.get("content-type") || "";
    let data = {};

    if (ct.includes("application/json")) {
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
      return new Response(
        JSON.stringify({ ok: false, error: "Missing required fields" }),
        { status: 400, headers }
      );
    }

    // 🔹 Logga alltid – viktigt för Cloudflare
    console.log("CONTACT FORM:", {
      name,
      email,
      company,
      volume,
      message
    });

    // 🔹 Om RESEND inte finns – returnera tydligt
    if (!env.RESEND_API_KEY) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "RESEND_API_KEY saknas i Cloudflare Pages"
        }),
        { status: 500, headers }
      );
    }

    // 🔹 Skicka mail via Resend
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: `${env.CONTACT_FROM_NAME || "Proofy"} <${env.CONTACT_FROM}>`,
        to: [env.CONTACT_TO],
        reply_to: email,
        subject: `Ny demo/pilot-förfrågan – ${name}`,
        html: `
          <h2>Ny kontaktförfrågan</h2>
          <p><b>Namn:</b> ${name}</p>
          <p><b>E-post:</b> ${email}</p>
          <p><b>Byrå:</b> ${company}</p>
          <p><b>Volym:</b> ${volume}</p>
          <p><b>Meddelande:</b><br/>${message}</p>
        `
      })
    });

    const resendText = await resendRes.text();

    if (!resendRes.ok) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Resend API error",
          detail: resendText
        }),
        { status: 502, headers }
      );
    }

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "Server error",
        detail: String(err?.message || err)
      }),
      { status: 500, headers }
    );
  }
}
