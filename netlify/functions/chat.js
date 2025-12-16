/**
 * Netlify Function: Proofy Concierge Chat (SV/EN)
 * Endpoint: POST /.netlify/functions/chat
 * Body: { message: string, locale?: "sv"|"en" }
 *
 * Required env:
 *   OPENAI_API_KEY
 */
const fs = require("fs");
const path = require("path");

const KNOWLEDGE_PATH = path.join(process.cwd(), "knowledge.md");
let KNOWLEDGE = "";
try {
  KNOWLEDGE = fs.readFileSync(KNOWLEDGE_PATH, "utf8");
} catch {
  KNOWLEDGE = "Proofy knowledge base file missing.";
}

// Best-effort in-memory rate limit (resets on cold start)
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

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

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
    const { message, locale } = JSON.parse(event.body || "{}");
    if (!message || typeof message !== "string") {
      return { statusCode: 400, body: "Missing message" };
    }
    const lang = locale === "en" ? "en" : "sv";

    const system = lang === "sv"
      ? [
          "Du är Proofy Concierge, en AI-assistent för proofy.se.",
          "",
          "Hårda regler:",
          "- Svara endast med stöd av KUNSKAPSBASEN nedan. Använd den som källa.",
          "- Om svaret inte tydligt finns: säg att du inte vet och föreslå demo/pilot eller att kontakta Proofy (kontakt@proofy.se).",
          "- Ge aldrig juridisk rådgivning. Om frågan är juridisk: säg det och föreslå jurist/revisor.",
          "- Hitta inte på priser, certifieringar, garantier, integrationer eller funktioner som inte uttryckligen stöds av KUNSKAPSBASEN.",
          "- Var tydlig med begränsningar (Proofy verifierar oförändring, inte “rätt innehåll”).",
          "",
          "Svarsformat:",
          "- Kort och tydligt först.",
          "- Om relevant: punktlista med nästa steg.",
          "- Om relevant: avsluta med “Vill du boka en demo?” och hänvisa till /#kontakt eller mail.",
        ].join("\n")
      : [
          "You are Proofy Concierge, an AI assistant for proofy.se.",
          "",
          "Hard rules:",
          "- Answer only using the KNOWLEDGE BASE below. Treat it as the source of truth.",
          "- If the answer is not clearly supported: say you don't know and suggest a demo/pilot or contacting Proofy (kontakt@proofy.se).",
          "- Never provide legal advice. If the question is legal: state that and suggest a lawyer/auditor.",
          "- Do not invent pricing, certifications, guarantees, integrations, or features not supported by the KNOWLEDGE BASE.",
          "- Be explicit about limitations (Proofy verifies unchanged files, not “correct content”).",
          "",
          "Response style:",
          "- Lead with a clear short answer.",
          "- Add bullets with next steps if relevant.",
          "- If relevant: end with “Would you like to book a demo?” and point to /#kontakt or email.",
        ].join("\n");

    if (!process.env.OPENAI_API_KEY) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reply: lang === "sv"
            ? "Servern saknar OPENAI_API_KEY. Lägg in den i Netlify: Site settings → Environment variables."
            : "Server is missing OPENAI_API_KEY. Add it in Netlify: Site settings → Environment variables."
        }),
      };
    }

    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          { role: "system", content: `${system}\n\nKNOWLEDGE BASE:\n${KNOWLEDGE}` },
          { role: "user", content: message.trim() },
        ],
        max_output_tokens: 650,
      }),
    });

    const data = await resp.json().catch(() => ({}));
    const reply =
      data.output_text ||
      (lang === "sv"
        ? "Jag kan tyvärr inte svara på det just nu."
        : "I can’t answer that right now.");

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reply }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reply: "Technical error. Please try again later.",
      }),
    };
  }
};
