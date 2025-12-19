export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json().catch(() => ({}));
    const messages = Array.isArray(body.messages) ? body.messages : [];

    // Basic guardrails
    const cleanMessages = messages
      .slice(-20)
      .map((m) => ({
        role: m?.role === "assistant" ? "assistant" : "user",
        content: String(m?.content || "").slice(0, 4000),
      }));

    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "OPENAI_API_KEY saknas i Cloudflare Pages (Secrets).",
        }),
        { status: 500, headers: { "Content-Type": "application/json; charset=utf-8" } }
      );
    }

    // System prompt: matcha Proofy-ton och håll det kort.
    const system = {
      role: "system",
      content:
        "Du är Proofy Assist. Svara kort, tydligt och affärsmässigt på svenska. " +
        "Fokusera på pilot, demo, säkerhet, och hur filverifiering fungerar. " +
        "Om någon frågar om teknik: förklara enkelt. Om du är osäker: be om precisering.",
    };

    // Chat Completions API (stabilt och enkelt)
    const payload = {
      model: "gpt-4.1-mini",
      messages: [system, ...cleanMessages],
      temperature: 0.4,
    };

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const j = await r.json().catch(() => ({}));

    if (!r.ok) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "OpenAI-fel",
          details: j,
        }),
        { status: 500, headers: { "Content-Type": "application/json; charset=utf-8" } }
      );
    }

    const answer = j?.choices?.[0]?.message?.content || "Jag kunde tyvärr inte generera ett svar just nu.";

    // CTAs som du använder i widgeten
    const ctas = [
      { label: "Hasha & registrera fil", url: "/hash.html" },
      { label: "Verifiera fil", url: "/verify.html" },
      { label: "Säkerhet", url: "/security.html" },
    ];

    return new Response(JSON.stringify({ ok: true, answer, ctas }), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: "Serverfel i /api/chat" }),
      { status: 500, headers: { "Content-Type": "application/json; charset=utf-8" } }
    );
  }
}

export async function onRequest({ request, env }) {
  if (request.method === "POST") return onRequestPost({ request, env });
  return new Response(JSON.stringify({ ok: false, error: "Method Not Allowed" }), {
    status: 405,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
