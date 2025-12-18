// netlify/functions/chat.mjs
import OpenAI from "openai";

function json(statusCode, obj) {
  return new Response(JSON.stringify(obj), {
    status: statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "POST,OPTIONS",
    },
  });
}

export default async (request) => {
  try {
    if (request.method === "OPTIONS") return json(204, {});
    if (request.method !== "POST") return json(405, { ok: false, error: "Use POST" });

    const apiKey = process.env.OPENAI_API_KEY || "";
    if (!apiKey) {
      return json(500, { ok: false, error: "OPENAI_API_KEY is missing" });
    }

    const body = await request.json().catch(() => ({}));
    const userMessage = (body?.message || "").trim();

    if (!userMessage) {
      return json(400, { ok: false, error: "Missing message" });
    }

    const client = new OpenAI({ apiKey });

    // Enkel, stabil chat – går att ändra till din exakta “persona”
    const system = `
Du är Proofy Assist, en hjälpsam svensk support-assistent för tjänsten Proofy.
Du ska svara kort, tydligt och sakligt.
Du får aldrig be om privata nycklar eller känslig data.
Om frågan gäller verifiering: förklara att dokumentet aldrig laddas upp; endast hash används.
`;

    const resp = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: system.trim() },
        { role: "user", content: userMessage },
      ],
      temperature: 0.2,
    });

    const text = resp.choices?.[0]?.message?.content || "";

    return json(200, { ok: true, reply: text });
  } catch (e) {
    const msg = String(e?.message || e);
    return json(500, { ok: false, error: msg });
  }
};
