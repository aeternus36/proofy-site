import fs from "fs";
import path from "path";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function handler(event) {
  try {
    const body = JSON.parse(event.body || "{}");
    const incomingMessages = Array.isArray(body.messages) ? body.messages : [];
    const messages = incomingMessages.slice(-10);

    const knowledgePath = path.join(process.cwd(), "netlify/functions/data/knowledge.md");

    let knowledge = "";
    if (fs.existsSync(knowledgePath)) {
      const raw = fs.readFileSync(knowledgePath, "utf8");
      const splitToken = "\n---\n\n# Proofy Concierge – Knowledge Base (EN)";
      knowledge = raw.split(splitToken)[0].trim();
    }

    const systemPrompt = `
Du är Proofy Assist för Proofy.se.
Skriv professionell, tydlig svenska. Undvik AI-ton. Ingen juridisk rådgivning.

Du MÅSTE svara med ENDAST giltig JSON (inget före/efter):
{
  "answer": "text",
  "ctas": [
    {"label":"Starta pilot","url":"https://proofy.se/pilot.html"},
    {"label":"Boka demo","url":"https://proofy.se/#kontakt"},
    {"label":"Mejla oss","url":"mailto:kontakt@proofy.se"}
  ],
  "lead": null
}

Kunskapsbas:
${knowledge}
`.trim();

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
    });

    const raw = (completion.choices?.[0]?.message?.content || "").trim();

    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = {
        answer: raw || "Vill du beskriva vilket underlag det gäller, så föreslår jag rätt upplägg?",
        ctas: [
          { label: "Starta pilot", url: "https://proofy.se/pilot.html" },
          { label: "Boka demo", url: "https://proofy.se/#kontakt" },
          { label: "Mejla oss", url: "mailto:kontakt@proofy.se" }
        ],
        lead: null
      };
    }

    if (!payload || typeof payload !== "object") payload = {};
    if (typeof payload.answer !== "string" || !payload.answer.trim()) {
      payload.answer = "Vill du beskriva vilket underlag det gäller, så föreslår jag rätt upplägg?";
    }
    if (!Array.isArray(payload.ctas) || payload.ctas.length < 2) {
      payload.ctas = [
        { label: "Starta pilot", url: "https://proofy.se/pilot.html" },
        { label: "Boka demo", url: "https://proofy.se/#kontakt" },
        { label: "Mejla oss", url: "mailto:kontakt@proofy.se" }
      ];
    }
    if (!("lead" in payload)) payload.lead = null;

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    };
  } catch (err) {
    // Viktigt: returnera 200 + JSON så frontend alltid kan visa ett begripligt svar
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        answer: "Tekniskt fel just nu. Mejla kontakt@proofy.se så hjälper vi dig direkt.",
        ctas: [
          { label: "Mejla oss", url: "mailto:kontakt@proofy.se" },
          { label: "Boka demo", url: "https://proofy.se/#kontakt" }
        ],
        lead: null
      }),
    };
  }
}
