// netlify/functions/chat.mjs
import OpenAI from "openai";

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST,OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });
}

export default async (request) => {
  try {
    // CORS preflight
    if (request.method === "OPTIONS") return json({ ok: true }, 204);

    if (request.method !== "POST") {
      return json({ ok: false, error: "Use POST" }, 405);
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return json({ ok: false, error: "OPENAI_API_KEY is missing" }, 500);
    }

    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const message = String(body?.message ?? "").trim();
    if (!message) {
      return json({ ok: false, error: "Missing message" }, 400);
    }

    const client = new OpenAI({ apiKey });

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Du är Proofy Assist, en svensk supportassistent för dokumentverifiering. Svara kort, tydligt och praktiskt.",
        },
        { role: "user", content: message },
      ],
      temperature: 0.2,
    });

    const reply = response?.choices?.[0]?.message?.content?.trim() || "";

    return json({ ok: true, reply }, 200);
  } catch (e) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
};
