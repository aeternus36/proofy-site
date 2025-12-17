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

    // Trimma historik: mindre repetition + lägre kostnad
    const messages = incomingMessages.slice(-10);

    const knowledgePath = path.join(
      process.cwd(),
      "netlify/functions/data/knowledge.md"
    );

    let knowledge = "";
    if (fs.existsSync(knowledgePath)) {
      const raw = fs.readFileSync(knowledgePath, "utf8");

      // Skicka bara SV-delen (så boten inte plockar engelska)
      const splitToken = "\n---\n\n# Proofy Concierge – Knowledge Base (EN)";
      knowledge = raw.split(splitToken)[0].trim();
    }

    const systemPrompt = `
Du är Proofy Assist för Proofy.se. Du skriver på naturlig, professionell svenska.
Proofy ger ett verifierings-ID kopplat till filens hash för att visa match/ingen match i efterhand. Proofy lagrar inte dokumentinnehåll.

Regler:
- Svara sakligt och tydligt. Kort när det räcker.
- Undvik upprepningar och mall-fraser.
- Ingen juridisk rådgivning och inga löften om juridiska utfall.
- Hitta inte på funktioner, priser, standarder eller certifieringar som inte står i kunskapsbasen.
- Avsluta alltid med 2–3 tydliga CTA.
- Ställ max en följdfråga när det hjälper.

Du måste returnera ENDAST giltig JSON:
{
  "answer": "text",
  "ctas": [
    {"label":"Starta pilot","url":"https://proofy.se/pilot"},
    {"label":"Boka demo","url":"https://proofy.se/boka-demo"},
    {"label":"Kontakta oss","url":"https://proofy.se/kontakt"}
  ],
  "lead": {"question":"text"} eller null
}

Kunskapsbas:
${knowledge}
`.trim();

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.25,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "system",
          content:
            "Upprepa inte samma formuleringar. Om du redan förklarat något: sammanfatta kort eller ge ett konkret exempel.",
        },
        ...messages,
      ],
    });

    const raw = completion?.choices?.[0]?.message?.content?.trim() || "";

    // Parse JSON med fallback
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = {
        answer: raw || "Vill du beskriva vilket underlag det gäller, så föreslår jag rätt upplägg?",
        ctas: [
          { label: "Boka demo", url: "https://proofy.se/boka-demo" },
          { label: "Starta pilot", url: "https://proofy.se/pilot" },
          { label: "Kontakta oss", url: "https://proofy.se/kontakt" },
        ],
        lead: null,
      };
    }

    // Guard: CTA måste finnas
    if (!Array.isArray(payload.ctas) || payload.ctas.length < 2) {
      payload.ctas = [
        { label: "Boka demo", url: "https://proofy.se/boka-demo" },
        { label: "Starta pilot", url: "https://proofy.se/pilot" },
        { label: "Kontakta oss", url: "https://proofy.se/kontakt" },
      ];
    }

    if (!("lead" in payload)) payload.lead = null;
    if (!payload.answer) payload.answer = "Vill du berätta lite mer om vad du vill verifiera?";

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        answer:
          "Det blev ett tekniskt fel. Försök igen, eller kontakta oss så hjälper vi dig direkt.",
        ctas: [
          { label: "Kontakta oss", url: "https://proofy.se/kontakt" },
          { label: "Boka demo", url: "https://proofy.se/boka-demo" },
        ],
        lead: null,
      }),
    };
  }
}
