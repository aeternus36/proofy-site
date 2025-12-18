import OpenAI from "openai";

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });
}

export async function onRequestPost({ request, env }) {
  try {
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) return json({ ok: false, error: "Missing OPENAI_API_KEY" }, 500);

    const body = await request.json().catch(() => ({}));
    const message = String(body.message || "").trim();
    if (!message) return json({ ok: false, error: "Missing message" }, 400);

    const client = new OpenAI({ apiKey });

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: "Du är Proofy Assist, en svensk supportassistent för dokumentverifiering." },
        { role: "user", content: message },
      ],
    });

    return json({ ok: true, reply: response.choices?.[0]?.message?.content || "" }, 200);
  } catch (e) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
}

export async function onRequestGet() {
  return json({ ok: false, error: "Use POST" }, 405);
}

