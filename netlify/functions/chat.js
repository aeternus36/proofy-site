/**
 * Netlify Function: Proofy Assist (SV/EN)
 * Endpoint: POST /.netlify/functions/chat
 * Body: { message: string, locale?: "sv"|"en" }
 *
 * Required env:
 *   OPENAI_API_KEY
 */

import fs from "node:fs";
import path from "node:path";

function readKnowledge() {
  try {
    const p = path.join(process.cwd(), "netlify", "functions", "data", "knowledge.md");
    return fs.readFileSync(p, "utf8");
  } catch (e) {
    // Fallback: try relative to function bundle
    try {
      const p2 = path.join(process.cwd(), "data", "knowledge.md");
      return fs.readFileSync(p2, "utf8");
    } catch {
      return "";
    }
  }
}

// Best-effort rate limit (resets on cold start)
const WINDOW_MS = 60_000;
const MAX_REQ = 40;
const hits = new Map();

function allow(ip) {
  const now = Date.now();
  const rec = hits.get(ip) || { start: now, n: 0 };
  if (now - rec.start > WINDOW_MS) { rec.start = now; rec.n = 0; }
  rec.n += 1;
  hits.set(ip, rec);
  return rec.n <= MAX_REQ;
}

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const ip =
    event.headers["x-nf-client-connection-ip"] ||
    (event.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    "unknown";

  if (!allow(ip)) {
    return {
      statusCode: 429,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reply: "Too many requests. Please try again soon." }),
    };
  }

  try {
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reply: "Server misconfigured: missing OPENAI_API_KEY." }),
      };
    }

    const { message, locale } = JSON.parse(event.body || "{}");
    if (!message || typeof message !== "string") {
      return { statusCode: 400, body: "Missing message" };
    }

    const lang = locale === "en" ? "en" : "sv";
    const KNOWLEDGE = readKnowledge();

    const system =
      lang === "sv"
        ? `
Du är Proofy Assist, en AI-assistent för proofy.se.

Hårda regler:
- Svara endast med stöd av KUNSKAPSBASEN nedan.
- Om svaret inte tydligt finns: säg att du inte vet och föreslå demo/pilot eller att kontakta Proofy (kontakt@proofy.se).
- Ge aldrig juridisk rådgivning. Om frågan är juridisk: säg det och föreslå jurist/revisor.
- Hitta inte på priser, certifieringar, garantier, integrationer eller funktioner som inte uttryckligen stöds av KUNSKAPSBASEN.
- Var tydlig med begränsningar (Proofy verifierar oförändring, inte “rätt innehåll”).

Svarsformat:
- Kort och tydligt först.
- Om relevant: punktlista med nästa steg.
- Om relevant: avsluta med “Vill du boka en demo?” och hänvisa till /#kontakt eller mail.
`
        : `
You are Proofy Assist, an AI assistant for proofy.se.

Hard rules:
- Answer only using the KNOWLEDGE BASE below.
- If the answer is not clearly supported: say you don't know and suggest a demo/pilot or contacting Proofy (kontakt@proofy.se).
- Never provide legal advice. If the question is legal: state that and suggest a lawyer/auditor.
- Do not invent pricing, certifications, guarantees, integrations, or features not supported by the KNOWLEDGE BASE.
- Be explicit about limitations (Proofy verifies unchanged files, not “correct content”).

Response style:
- Lead with a clear short answer.
- Add bullets with next steps if relevant.
- If relevant: end with “Would you like to book a demo?” and point to /#kontakt or email.
`;

    // Use Chat Completions (stable parsing)
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: (system + "\n\nKUNSKAPSBAS:\n" + (KNOWLEDGE || "")).trim() },
          { role: "user", content: message.trim() },
        ],
        temperature: 0.2,
        max_tokens: 500,
      }),
    });

    const data = await r.json();

    const reply =
      data?.choices?.[0]?.message?.content?.trim() ||
      (lang === "sv" ? "Jag kan tyvärr inte svara på det just nu." : "I can’t answer that right now.");

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reply }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reply: "Technical error. Please try again later." }),
    };
  }
};

