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
    const cleaned = messages
      .slice(-20)
      .map((m) => ({
        role: m?.role === "assistant" ? "assistant" : "user",
        content: String(m?.content ?? "").slice(0, 4000),
      }))
      // CHANGE: filtrera tomma inlägg (stabilare prompt + mindre token)
      .filter((m) => m.content.trim().length > 0);

    const system = {
      role: "system",
      // CHANGE: Förbättrad system-prompt för revisors-UX + noteringsläge
      content: `Du är Proofy Assist – ett professionellt stöd för revisorer och redovisningskonsulter.

Mål:
- Hjälp användaren snabbt komma vidare (handling), inte läsa en manual.
- Var saklig och trygg. Ingen marknadsföring. Inga tekniska buzzwords.

Terminologi:
- Säg alltid “Verifierings-ID”, “referensunderlag”, “registreringstid”, “spårbarhet”.
- Undvik: hash, blockchain, transaktion, on-chain.

Avgränsning (viktigt):
- Proofy visar om en filversion är oförändrad jämfört med referensen (tekniskt fingeravtryck).
- Proofy bedömer inte innehållets sakliga riktighet.
- Proofy lagrar inte dokumentinnehåll.

Svarsstil:
- Svenska. Kort och konkret: normalt 2–5 meningar.
- Struktur: 1) besked 2) kort varför 3) nästa steg.
- Skriv inte länkar i brödtext. Anta att UI har knappar.

Noteringsläge (“verifieringsnotering”):
- Om användaren ber om “verifieringsnotering”, “notering i revisionsfil”, “arbetsprogram” eller liknande:
  - Svara med en klistra-in-text i neutral byråton.
  - Om fakta saknas, använd tydliga platshållare i hakparentes, t.ex. [Verifierings-ID], [Datum/tid], [Resultat: Oförändrat/Avvikelse], [Underlag/filnamn].
  - Noteringen ska alltid innehålla: syfte, metod (filversion), resultat, avgränsning (ej innehåll), datum/tid.
  - Max 10 rader. Inga juridiska slutsatser.

Prisfråga:
- Svara: “Gratis att testa. Ev. prissättning tas vid pilot/byråupplägg av teamet.”

Tillåtna sidor att nämna (endast om användaren behöver vägledning):
- /register.html, /verify.html, /index.html

Om oklart:
- Ställ max en kort följdfråga eller föreslå nästa steg.`,
    };

    const payload = {
      model: "gpt-4.1-mini",
      messages: [system, ...cleaned],
      temperature: 0.35, // CHANGE: mer konsekvent byråton, mindre svammel
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
          // CHANGE: felsökningshjälp utan att läcka hemligheter
          detail: j?.error?.message || undefined,
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
