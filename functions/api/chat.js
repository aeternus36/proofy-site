export async function onRequest({ request, env }) {
  const jsonHeaders = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  };

  // CHANGE: CORS helper (minimerar duplicerad kod och minskar risk för avvikande headers)
  const corsOrigin = request.headers.get("Origin") || "*"; // CHANGE: konservativt - behåll beteendet

  // CORS/preflight — nödvändigt om widgeten skickar JSON-header (vanligt)
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...jsonHeaders,
        "Access-Control-Allow-Origin": corsOrigin,
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
        "Access-Control-Allow-Origin": corsOrigin,
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
            "Access-Control-Allow-Origin": corsOrigin,
          },
        }
      );
    }

    const body = await request.json().catch(() => ({}));
    const messages = Array.isArray(body.messages) ? body.messages : [];

    // behåll senaste 20, tillåt endast user/assistant, trimma content
    const cleaned = messages
      .slice(-20)
      .map((m) => ({
        role: m?.role === "assistant" ? "assistant" : "user",
        content: String(m?.content ?? "").slice(0, 4000),
      }))
      // CHANGE: filtrera bort tomma meddelanden för stabilare prompt + mindre tokenkostnad
      .filter((m) => m.content.trim().length > 0);

    const system = {
      role: "system",
      content:
        // CHANGE: mer revisors-/byråspråk + tydligare avgränsning utan att ändra funktionalitet
        "Du är Proofy Assist för revisorer och redovisningskonsulter. Svara på svenska, kort och tydligt. " +
        "Förklara praktiskt hur Proofy används i revisionsfil/arbetsprogram: skapa Verifierings-ID för referensunderlag och verifiera att en filversion är oförändrad. " +
        "Använd ord som Verifierings-ID, referensunderlag, registreringstid och spårbarhet. Undvik blockchain/tx/hash-termer om användaren inte uttryckligen ber om tekniska detaljer. " +
        "Håll professionell ton. Om användaren frågar om priser: svara att Proofy är gratis att testa och att ev. prissättning tas vid pilot/byråupplägg. " +
        "Föreslå bara dessa sidor: '/register.html', '/verify.html' eller '/index.html'. " +
        "Om något är oklart: föreslå nästa steg eller hänvisa till kontakt@proofy.se.",
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
      // CHANGE: bubbla upp mer felinfo (utan att läcka hemligheter) för felsökning
      return new Response(
        JSON.stringify({
          ok: false,
          error: "OpenAI request failed",
          status: r.status,
          detail: j?.error?.message || undefined,
        }),
        {
          status: 500,
          headers: {
            ...jsonHeaders,
            "Access-Control-Allow-Origin": corsOrigin,
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
        "Access-Control-Allow-Origin": corsOrigin,
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: "Serverfel i /api/chat" }), {
      status: 500,
      headers: {
        ...jsonHeaders,
        "Access-Control-Allow-Origin": corsOrigin,
      },
    });
  }
}
