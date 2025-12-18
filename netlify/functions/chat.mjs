// netlify/functions/chat.js
const OpenAI = require("openai");

function json(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
    body: JSON.stringify(obj),
  };
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return json(405, { ok: false, error: "Use POST" });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return json(500, {
        ok: false,
        error: "OPENAI_API_KEY is missing",
      });
    }

    const body = JSON.parse(event.body || "{}");
    const message = (body.message || "").trim();

    if (!message) {
      return json(400, { ok: false, error: "Missing message" });
    }

    const client = new OpenAI({ apiKey });

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Du är Proofy Assist, en svensk supportassistent för dokumentverifiering.",
        },
        { role: "user", content: message },
      ],
      temperature: 0.2,
    });

    return json(200, {
      ok: true,
      reply: response.choices[0].message.content,
    });
  } catch (e) {
    return json(500, {
      ok: false,
      error: String(e.message || e),
    });
  }
};
