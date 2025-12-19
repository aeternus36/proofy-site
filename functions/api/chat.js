export async function onRequest(context) {
  const { request, env } = context;

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method === "GET") {
    return new Response(
      JSON.stringify({
        ok: true,
        route: "/api/chat",
        hint: "POST JSON {message:\"...\"} eller {messages:[{role,content}]}",
        hasOpenAIKey: !!env.OPENAI_API_KEY,
        model: env.OPENAI_MODEL || "gpt-4.1-mini",
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        },
      }
    );
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method Not Allowed" }), {
      status: 405,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
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
            ...corsHeaders,
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
          },
        }
      );
    }

    const body = await request.json().catch(() => ({}));
    const singleMessage =
      typeof body?.message === "string" ? body.message.trim() : "";

    const incomingMessages = Array.isArray(body?.messages) ? body.messages : [];

    let cleaned = [];

    if (incomingMessages.length > 0) {
      cleaned = incomingMessages.slice(-20).map((m) => ({
        role: m?.role === "assistant" ? "assistant" : "user",
        content: String(m?.content ?? "").slice(0, 4000),
      }));
    } else if (singleMessage) {
      cleaned = [{ role: "user", content: singleMessage.slice(0, 4000) }];
    } else {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Body måste innehålla 'message' (string) eller 'messages' (array).",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
          },
        }
      );
    }

    const system = {
      role: "system",
      content:
        "Du är Proofy Assist, en AI-chatt som hjälper användare på svenska. Proofy är en tjänst för att verifiera att en fil existerade vid en viss tidpunkt genom SHA-256-hashning och tidsstämpling. Proofy lagrar aldrig filinnehåll. " +
        "Du ska aldrig ge juridiska råd, och du får inte föreslå att användaren kontaktar en jurist. " +
        "Vid juridiska frågor svarar du neutralt och hänvisar till Proofys kontaktsida eller supportmejl. " +
        "Var kort, tydlig, professionell och hjälp användaren att förstå Proofys tekniska funktion.",
    };

    const payload = {
      model: env.OPENAI_MODEL || "gpt-4.1-mini",
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
          details: j,
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
          },
        }
      );
    }

    const text = j?.choices?.[0]?.message?.content || "";

    // 🔐 Enkel fallback om modellen ändå föreslår jurist (säkerhetsnät)
    const containsLegalHint = /jurist|advokat|laglig|rättslig/i.test(text);
    const fallback = `Proofy är ett tekniskt verktyg för att visa att en fil existerade vid en viss tidpunkt. Vi ger inte juridisk rådgivning. Om du är osäker kan du kontakta vår support via kontakt@proofy.se eller läsa mer på vår hemsida.`;

    const finalReply = containsLegalHint ? fallback : text;

    const ctas = [
      { label: "Hasha & registrera fil", url: "/hash.html" },
      { label: "Verifiera fil", url: "/verify.html" },
      { label: "Säkerhet", url: "/security.html" },
    ];

    return new Response(
      JSON.stringify({
        ok: true,
        answer: finalReply,
        reply: finalReply,
        message: finalReply,
        ctas,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "Serverfel i /api/chat",
        details: String(e?.message || e),
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
