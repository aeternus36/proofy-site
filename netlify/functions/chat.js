import fs from "fs";
import path from "path";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function handler(event) {
  try {
    const body = JSON.parse(event.body || "{}");
    const incomingMessages = Array.isArray(body.messages) ? body.messages : [];
    const messages = incomingMessages.slice(-10);

    const knowledgePath = path.join(
      process.cwd(),
      "netlify/functions/data/knowledge.md"
    );

    let knowledge = "";
    if (fs.existsSync(knowledgePath)) {
      const raw = fs.readFileSync(knowledgePath, "utf8");
      const splitToken = "\n---\n\n# Proofy Concierge – Knowledge Base (EN)";
      knowledge = raw.split(splitToken)[0].trim();
    }

    const systemPrompt = `
Du är Proofy Assist för Proofy.se.
Skriv professionell, tydlig svenska. Ingen juridisk rådgivning.

Du MÅSTE svara i giltig JSON enligt exakt detta schema – inget före, inget efter:

{
  "answer": "text",
  "ctas": [
    {"label":"Starta pilot","url":"https://proofy.se/pilot"},
    {"label":"Boka demo","url":"https://proofy.se/boka-demo"}
  ],
  "lead": null
}

Kunskapsbas:
${knowledge}
`.trim();

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
    });

    const raw = completion.choices[0].message.content.trim();

    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      // ABSOLUT fallback – aldrig tomt svar
      payload = {
        answer: raw || "Vill du berätta lite mer om vad du vill verifiera?",
        ctas: [
          { label: "Boka demo", url: "https://proofy.se/boka-demo" },
          { label: "Starta pilot", url: "https://proofy.se/pilot" },
        ],
        lead: null,
      };
    }

    if (!payload.answer || typeof payload.answer !== "string") {
      payload.answer = "Vill du beskriva vilket underlag det gäller?";
    }

    if (!Array.isArray(payload.ctas)) {
      payload.ctas = [
        { label: "Boka demo", url: "https://proofy.se/boka-demo" },
        { label: "Starta pilot", url: "https://proofy.se/pilot" },
      ];
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        answer: "Det blev ett tekniskt fel. Vill du att vi tar det via demo?",
        ctas: [
          { label: "Boka demo", url: "https://proofy.se/boka-demo" },
        ],
        lead: null,
      }),
    };
  }
}
