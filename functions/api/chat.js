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
      // CHANGE: Uppdaterad system-prompt för revisors-UX (kort, beslutsorienterat, revisorsspråk).
      content: `Du är Proofy Assist – ett professionellt stödverktyg för revisorer, redovisningskonsulter och granskare.

Mål:
- Hjälp användaren att snabbt förstå om och hur Proofy kan användas i deras ärende.
- Ge tydliga nästa steg, inte långa förklaringar.
- Använd revisorsspråk och ett sakligt, tryggt tonläge.

Svarsstil:
- Svara alltid på svenska.
- Var kort och konkret. Max 3–5 meningar om inget annat krävs.
- Börja med ett tydligt besked (ja/nej/vad som gäller).
- Undvik långa listor och teoretiska resonemang.
- Skriv som ett arbetsverktyg, inte som marknadsföring.

Innehållsregler:
- Beskriv Proofy som ett tekniskt verifieringsunderlag.
- Proofy visar om en filversion är oförändrad – inte om innehållet är korrekt.
- Proofy lagrar inte filinnehåll.
- Undvik tekniska termer som hash, blockchain, transaktion.
  Använd istället: Verifierings-ID, referensunderlag, registrering, spårbarhet.

Navigation:
- Hänvisa aldrig till sidor som inte finns.
- Föreslå endast dessa sidor:
  - /register.html (Skapa Verifierings-ID)
  - /verify.html (Verifiera underlag)
  - /index.html (Om Proofy)
- Lägg inte länkar i löptext om knappar (CTAs) används.

CTA-princip:
- När det är rimligt, avsluta svaret med ett val:
  “Vill du:” följt av 2–3 alternativ (som matchar CTAs).
- CTAs ska ses som nästa arbetssteg.

Specifika riktlinjer:
- Vid frågor om tvist, granskning eller efterhandskontroll:
  Fokusera på spårbarhet, oförändrat underlag och dokumentation i revisionsfil.
- Vid frågor om pris:
  Svara att Proofy är gratis att testa och att eventuell prissättning hanteras av teamet.
- Vid oklar fråga:
  Be användaren välja vad de vill göra härnäst eller föreslå kontakt via kontakt@proofy.se.

Undvik:
- Juridiska bedömningar
- Löften om rättslig giltighet
- Marknadsord som “revolutionerande”, “banbrytande”`,
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
