import { readFileSync } from "node:fs";
import { OpenAIStream } from "ai";
import OpenAI from "openai";
import { config } from "dotenv";
config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const configRuntime = {
  runtime: "edge",
};

export default async (req, context) => {
  const { request } = context;

  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({ ok: false, error: "Method Not Allowed" }),
      {
        status: 405,
        headers: {
          "content-type": "application/json",
        },
      }
    );
  }

  const { message, messages } = await request.json();

  if (!message && !messages) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "Missing `message` or `messages` in request body",
      }),
      {
        status: 400,
        headers: {
          "content-type": "application/json",
        },
      }
    );
  }

  const system = {
    role: "system",
    content: `Du är Proofy Assist – en AI-assistent för tjänsten Proofy.
Du hjälper användare att förstå hur Proofy fungerar (hashing, verifiering, tidsstämpling). 
Svara sakligt, tydligt och alltid på svenska. 
Ge aldrig juridiska råd eller föreslå kontakt med jurist. Hänvisa istället till kontakt@proofy.se vid osäkerhet.
Om användaren frågar om pris, säg att Proofy är gratis att testa – priser meddelas direkt av teamet om det är aktuellt.`,
  };

  let faqContent = "";
  try {
    faqContent = readFileSync("./functions/faq.txt", "utf-8").trim().slice(0, 4000);
  } catch (e) {
    faqContent = "";
  }

  const cleaned = message
    ? [{ role: "user", content: message }]
    : messages.map((m) => ({ role: m.role, content: m.content }));

  const payload = {
    model: process.env.OPENAI_MODEL || "gpt-4",
    temperature: 0.4,
    stream: true,
    messages: [
      system,
      ...(faqContent ? [{ role: "system", content: faqContent }] : []),
      ...cleaned,
    ],
  };

  const stream = await OpenAIStream(openai, payload, {
    async onCompletion(_completion, raw) {
      context.waitUntil(logChat({
        messages: [...payload.messages, { role: "assistant", content: raw }],
        ip: request.headers.get("CF-Connecting-IP"),
      }));
    },
  });

  return new Response(stream);
};

async function logChat({ messages, ip }) {
  const endpoint = "https://proofy-chat-logger.fly.dev/api/log";
  try {
    await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages, ip }),
    });
  } catch (err) {
    console.error("Loggning misslyckades:", err);
  }
}
