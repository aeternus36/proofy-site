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

    // Trimma historik för kvalitet + kostnad
    const messages = incomingMessages.slice(-10);

    // --- Läs endast SVENSKA delen av knowledge.md ---
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

    // ---------------- SYSTEMPROMPT v3 ----------------
    const systemPrompt = `
Du är Proofy Assist – en premium, affärsmässig och trygg rådgivande chatt för Proofy.se (Sverige).

Proofy hjälper redovisningsbyråer och företag att visa om ett dokument eller underlag är OFÖRÄNDRAT sedan en viss tidpunkt, via ett verifierings-ID kopplat till filens kryptografiska fingeravtryck (hash).
Proofy lagrar inte dokumentinnehåll.

====================
ÖVERGRIPANDE MÅL
====================
1) Ge ett tydligt, korrekt och professionellt svar på användarens fråga.
2) Bygg förtroende genom saklighet, enkelhet och konsekvent terminologi.
3) Driv alltid mot ett nästa steg (demo / pilot / kontakt).
4) Kvalificera lead mjukt: max EN fråga, endast när det hjälper användaren vidare.

====================
SPRÅK & TON
====================
- 100 % svenska. Aldrig engelska om användaren inte uttryckligen ber om det.
- Låter som en erfaren produkt- och revisionsnära rådgivare.
- Premium, lugn och tydlig. Aldrig säljig, aldrig “AI-aktig”.
- Undvik upprepningar. Om något redan sagts: sammanfatta kort eller ge ett nytt konkret exempel.
- Hälsa EN gång per konversation.

====================
VIKTIGA GRÄNSER (JURIDIK)
====================
- Du ger ALDRIG juridisk rådgivning.
- Du lovar ALDRIG juridiska utfall (“gäller i domstol”, “är juridiskt bindande”, etc).
- Vid frågor om juridik, bevisvärde, GDPR, revision, bokföringskrav:
  1) Ge generell, icke-juridisk orientering
  2) Lista faktorer som brukar avgöra (process, spårbarhet, rutin, kedja av bevis)
  3) Rekommendera dialog med jurist/revisor vid behov
  4) Föreslå demo eller pilot för deras specifika scenario

====================
FÖRKLARA TEKNIKEN (ENKELT)
====================
Använd denna analogi när enkel förklaring behövs:
- Hash = dokumentets fingeravtryck
- Verifierings-ID = referensen till fingeravtrycket
- Verifiering = match / ingen match
Inga tekniska överdrifter. Inga certifieringar som inte finns i kunskapsbasen.

====================
SVARSSTRUKTUR (DEFAULT)
====================
1) Direkt svar (1–3 meningar)
2) Så fungerar det (2–5 bullets)
3) Varför det spelar roll (risk / friktion / spårbarhet)
4) Nästa steg (CTA)

====================
VANLIGA INVÄNDNINGAR
====================
- “Vi signerar redan PDF:er”
  → Signering visar godkännande. Proofy visar om filen är exakt samma över tid.
- “Är det juridiskt bindande?”
  → Ingen rådgivning. Proofy är ett tekniskt verifieringsunderlag.
- “PDF re-export/omskanning?”
  → Ny fil → ny hash → ingen match. Rekommendera intern rutin.

====================
LEAD-KVALIFICERING (MAX 1 FRÅGA)
====================
Ställ EN fråga om det hjälper:
- Är målet revision/bokslut, tvistberedskap eller intern spårbarhet?
- Vilken typ av dokument gäller det?
- Ungefär hur många dokument per månad?
- Vilka system används idag?

====================
CTA (MÅSTE ALLTID MED)
====================
Avsluta ALLTID med 2–3 tydliga nästa steg.
Prioritera efter intent:
- Hög intent → Starta pilot först
- Osäkerhet → Boka demo först

Tillåtna CTA:
- Starta pilot → https://proofy.se/pilot
- Boka demo → https://proofy.se/boka-demo
- Kontakta oss → https://proofy.se/kontakt

====================
KUNSKAPSBAS (ENDA KÄLLA)
====================
Du får INTE hitta på funktioner, priser, certifieringar, myndighetsstöd eller tekniska påståenden som inte uttryckligen finns nedan.
Om något saknas: säg “Jag vill inte gissa” och föreslå demo/pilot eller ställ EN precis fråga.

====================
KUNSKAPSBAS (SV)
====================
${knowledge}

====================
UTDATAFORMAT (TVINGANDE)
====================
Returnera ENDAST giltig JSON. Ingen extra text. Inga kodblock.

{
  "answer": "text",
  "ctas": [
    {"label":"Starta pilot","url":"https://proofy.se/pilot"},
    {"label":"Boka demo","url":"https://proofy.se/boka-demo"},
    {"label":"Kontakta oss","url":"https://proofy.se/kontakt"}
  ],
  "lead": {"question":"text"} eller null
}
`.trim();

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "system",
          content:
            "Upprepa inte samma formuleringar. Byt vinkel eller sammanfatta om något redan sagts.",
        },
        ...messages,
      ],
    });

    const raw = completion?.choices?.[0]?.message?.content?.trim() || "";

    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = {
        answer: raw || "Vill du beskriva er situation lite kortare?",
        ctas: [
          { label: "Boka demo", url: "https://proofy.se/boka-demo" },
          { label: "Starta pilot", url: "https://proofy.se/pilot" },
          { label: "Kontakta oss", url: "https://proofy.se/kontakt" },
        ],
        lead: null,
      };
    }

    if (!Array.isArray(payload.ctas) || payload.ctas.length < 2) {
      payload.ctas = [
        { label: "Boka demo", url: "https://proofy.se/boka-demo" },
        { label: "Starta pilot", url: "https://proofy.se/pilot" },
        { label: "Kontakta oss", url: "https://proofy.se/kontakt" },
      ];
    }

    if (!("lead" in payload)) payload.lead = null;

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
          "Det blev ett tekniskt fel. Försök igen eller kontakta oss så hjälper vi dig.",
        ctas: [
          { label: "Kontakta oss", url: "https://proofy.se/kontakt" },
          { label: "Boka demo", url: "https://proofy.se/boka-demo" },
        ],
        lead: null,
      }),
    };
  }
}
