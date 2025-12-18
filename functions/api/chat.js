// functions/api/chat.js
import OpenAI from "openai";

function corsHeaders(env) {
  const allow = (env?.ALLOW_ORIGIN || process.env.ALLOW_ORIGIN || "*").trim() || "*";
  return {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": allow,
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
  };
}

function json(env, status, obj) {
  return new Response(JSON.stringify(obj), { status, headers: corsHeaders(env) });
}

function getEnv(context, key) {
  return (context?.env?.[key] || process.env[key] || "").trim();
}

export async function onRequest(context) {
  const { request } = context;

  if (request.method === "OPTIONS") return json(context.env, 204, {});
  if (request.method === "GET") {
    // Gör det lätt att testa i webbläsaren
    const hasKey = !!getEnv(context, "OPENAI_API_KEY");
    return json(context.env, 200, {
      ok: true,
      service: "proofy-chat",
      method: "GET",
      hasOpenAIKey: hasKey,
      note: "POST /api/chat med {message:\"...\"} för att chatta."
    });
  }

  if (request.method !== "POST") {
    return json(context.env, 405, { ok: false, userMessage: "Metoden stöds inte." });
  }

  const apiKey = getEnv(context, "OPENAI_API_KEY");
  if (!apiKey) {
    // Lugnt, revisionsvänligt
    return json(context.env, 500, {
      ok: false,
      userMessage: "Chatten är inte tillgänglig just nu. Försök igen senare."
    });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return json(context.env, 400, { ok: false, userMessage: "Ogiltig begäran. Försök igen." });
  }

  const message = String(body?.message || "").trim();
  if (!message) {
    return json(context.env, 400, { ok: false, userMessage: "Skriv ett meddelande först." });
  }

  try {
    const client = new OpenAI({ apiKey });

    // Enkel, stabil chat. (Du kan senare byta modell/striktare policy.)
    const resp = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Du är Proofy Assist. Svara kort, sakligt och revisionsvänligt." },
        { role: "user", content: message }
      ],
      temperature: 0.2,
    });

    const text = resp?.choices?.[0]?.message?.content?.trim() || "";

    return json(context.env, 200, { ok: true, reply: text });
  } catch {
    // Inga råa fel till användare
    return json(context.env, 500, {
      ok: false,
      userMessage: "Chatten är tillfälligt otillgänglig. Försök igen om en stund."
    });
  }
}

