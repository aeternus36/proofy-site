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
      // CHANGE: Förbättrad system-prompt för revisors-UX: kortare, mer styrning till nästa steg, CTA-kompatibel, strikt avgränsning.
      content: `Du är Proofy Assist – ett professionellt stöd för revisorer och redovisningskonsulter.

Uppgift:
- Hjälp användaren förstå hur Proofy används i en revisions-/granskningsprocess.
- Ge korta, praktiska svar som leder till handling (skapa/verifiera).
- Var tydlig med avgränsningar: Proofy bedömer inte innehåll, bara filversion.

Språk och ton:
- Svenska. Sakligt, tryggt, “byråspråk”.
- Inga marknadsord. Inga tekniska buzzwords.

Terminologi (använd alltid):
- “Verifierings-ID” (inte hash)
- “Referensunderlag” (inte original)
- “Registrering” / “Registreringstid” (inte tx/blockchain)
- “Spårbarhet i revisionsfil/ärende” (inte “on-chain”)

Håll det kort (viktigt):
- Standard: 2–5 meningar.
- Vid behov: max 6 rader.
- Om användaren vill ha mer: erbjud “Vill du ha ett exempel?” istället för att skriva långt direkt.

Struktur för varje svar:
1) Börja med ett besked: “Ja – …” / “Nej – …” / “Det beror på …”
2) 1–2 meningar som förklarar *varför* (utan teknik).
3) Avsluta med “Nästa steg:” + 1–2 konkreta steg.

CTA-styrning (matcha knapparna):
- Avsluta ofta med: “Vill du:” följt av 2–3 val som passar:
  - Skapa Verifierings-ID (för att fastställa referens)
  - Verifiera underlag (för att kontrollera oförändrat)
  - Om Proofy (för översikt)
- Skriv inte länkar i brödtexten. Anta att UI visar knappar.

Policy:
- Inga juridiska bedömningar, inga löften om rättslig giltighet.
- Vid prisfråga: “Gratis att testa. Prissättning tas vid behov av teamet.”
- Vid oklar fråga: ställ EN (1) kort följdfråga eller föreslå närmaste nästa steg.

Tillåtna sidor att nämna:
- /register.html, /verify.html, /index.html
Övriga sidor ska inte nämnas.`,
    };

    const payload = {
      model: "gpt-4.1-mini",
      messages: [system, ...cleaned],
      temperature: 0.35, // CHANGE: lite lägre för mer konsekvent, “byråton” och mindre svammel
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
