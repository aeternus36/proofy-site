export async function onRequest(context) {
  const { request, env } = context;

  // --- CORS (så widgeten alltid kan läsa svaret) ---
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  // Preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Enkel test i webbläsaren: https://proofy.se/api/chat
  if (request.method === "GET") {
    return new Response(
      JSON.stringify({
        ok: true,
        route: "/api/chat",
        hint: "POST JSON {message:\"...\"} eller {messages:[{role,content}]}",
        hasOpenAIKey: !!env.OPENAI_API_KEY,
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

    // Läs body (stöd för flera format)
    const body = await request.json().catch(() => ({}));

    // Format A: { message: "hej" }
    const singleMessage = typeof body?.message === "string" ? body.message.trim() : "";

    // Format B: { messages: [{role, content}, ...] }
    const incomingMessages = Array.isArray(body?.messages) ? body.messages : [];

    // Bygg "cleaned" messages
    let cleaned = [];

    if (incomingMessages.length > 0) {
      cleaned = incomingMessages.slice(-20).map((m) => ({
        role: m?.role === "assistant" ? "assistant" : "user",
        content: String(m?.content ?? "").slice(0, 4000),
      }));
    } else if (singleMessage) {
      cleaned = [
        {
          role: "user",
          content: singleMessage.slice(0, 4000),
        },
      ];
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
        "Du är Proofy Assist. Svara på svenska, kort och tydligt. " +
        "Hjälp med demo, pilot, säkerhet och hur filverifiering fungerar. " +
        "Håll en professionell ton. Om något är oklart, föreslå nästa steg.",
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

    const text =
      j?.choices?.[0]?.message?.content ||
      "Jag kunde tyvärr inte generera ett svar just nu.";

    // CTAs (valfritt)
    const ctas = [
      { label: "Hasha & registrera fil", url: "/hash.html" },
      { label: "Verifiera fil", url: "/verify.html" },
      { label: "Säkerhet", url: "/security.html" },
    ];

    // Returnera *både* answer och reply för maximal kompatibilitet med widgetar
    return new Response(
      JSON.stringify({
        ok: true,
        answer: text,
        reply: text,
        message: text,
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
