import fs from "fs";
import path from "path";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function handler(event) {
  try {
    const body = JSON.parse(event.body || "{}");
    const messages = body.messages || [];

    const knowledgePath = path.join(
      process.cwd(),
      "netlify/functions/data/knowledge.md"
    );

    let knowledge = "";
    if (fs.existsSync(knowledgePath)) {
      knowledge = fs.readFileSync(knowledgePath, "utf8");
    }

    const systemPrompt = `
Du är "Proofy Assist", en professionell men vänlig digital assistent för Proofy.se.

VIKTIGA REGLER:
- Hälsa bara EN gång i början av konversationen
- Upprepa aldrig "Hej" i varje svar
- Svara tydligt, kortfattat och strukturerat
- Förklara enkelt, utan tekniskt fluff
- Använd punktlistor när det hjälper
- Max 1 följdfråga om något är oklart
- Ingen juridisk rådgivning

PROOFY – KUNSKAP:
${knowledge}
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reply: completion.choices[0].message.content,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Chat error" }),
    };
  }
}
