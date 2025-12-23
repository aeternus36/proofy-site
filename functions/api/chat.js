export async function onRequest({ request, env }) {
  const jsonHeaders = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  };

  // CORS/preflight — nödvändigt om widgeten skickar JSON-header (vanligt)
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...jsonHeaders,
        "Access-Control-Allow-Origin": request.headers.get("Origin") || "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  // Endast POST
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method Not Allowed" }), {
      status: 405,
      headers: {
        ...jsonHeaders,
        "Access-Control-Allow-Origin": request.headers.get("Origin") || "*",
      },
    });
  }

  try {
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          ok: false,
          error:
            "OPENAI_API_KEY saknas i Cloudflare Pages → Settings → Variables and Secrets.",
        }),
        {
          status: 500,
          headers: {
            ...jsonHeaders,
            "Access-Control-Allow-Origin": request.headers.get("Origin") || "*",
          },
        }
      );
    }

    const body = await request.json().catch(() => ({}));
    const messages = Array.isArray(body.messages) ? body.messages : [];

    // behåll senaste 20, tillåt endast user/assistant, trimma content
    const cleaned = messages.slice(-20).map((m) => ({
      role: m?.role === "assistant" ? "assistant" : "user",
      content: String(m?.content ?? "").slice(0, 4000),
    }));

    const system = {
      role: "system",
      content:
        "Du är Proofy Assist. Svara på svenska, kort och tydligt. " +
        "Hjälp med demo, pilot, säkerhet och hur filverifiering fungerar. " +
        "Håll en professionell ton. " +
        "Om användaren frågar om priser, svara att Proofy är gratis att testa och eventuell prissättning meddelas av teamet vid behov. " +
        "Undvik att nämna sidor som inte finns – föreslå bara '/register.html', '/verify.html' eller '/index.html'. " +
        "Om något är oklart, föreslå nästa steg eller be användaren kontakta kontakt@proofy.se.",
    };

    const payload = {
      model: "gpt-4.1-mini",
      messages: [system, ...cleaned],
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
          error: "OpenAI request failed",
          status: r.status,
        }),
        {
          status: 500,
          headers: {
            ...jsonHeaders,
            "Access-Control-Allow-Origin": request.headers.get("Origin") || "*",
          },
        }
      );
    }

    const answer =
      j?.choices?.[0]?.message?.content ||
      "Jag kunde tyvärr inte generera ett svar just nu.";

    const ctas = [
      { label: "Skapa Verifierings-ID", url: "/register.html" },
      { label: "Verifiera underlag", url: "/verify.html" },
      { label: "Om Proofy", url: "/index.html" },
    ];

    return new Response(JSON.stringify({ ok: true, answer, ctas }), {
      headers: {
        ...jsonHeaders,
        "Access-Control-Allow-Origin": request.headers.get("Origin") || "*",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: "Serverfel i /api/chat" }), {
      status: 500,
      headers: {
        ...jsonHeaders,
        "Access-Control-Allow-Origin": request.headers.get("Origin") || "*",
      },
    });
  }
}
