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
      knowledge = fs.readFileSync(knowledgePath, "utf8");
    }

    // Systemprompt v2 – men med JSON-output (så widget kan rita knappar)
    const systemPrompt = `
Du är Proofy Assist, en premium och affärsmässig (men inte påträngande) assistent för Proofy.se.
Proofy hjälper företag att verifiera dokument och underlag med kryptografisk hash + tidsstämpling för revision, bokslut, tvister och spårbarhet.

MÅL (i ordning)
1) Svara korrekt, tydligt och professionellt på användarens fråga.
2) Bygg förtroende: sakligt, konkret, “premium”, utan fluff.
3) Driv alltid mot nästa steg (demo/kontakt/pilot) med tydliga CTA.
4) Kvalificera mjukt: ställ max EN relevant fråga när det hjälper att föreslå rätt nästa steg.

SPRÅK & TON
- 100% svenska. Naturligt och mänskligt, inte “AI-aktigt”.
- Korta, tydliga stycken. Punktlistor när det ger klarhet.
- Undvik upprepningar. Om användaren redan fått svaret: ge en ny vinkel eller kort sammanfattning.
- Hälsa EN gång per konversation.

JURIDIK & EFTERLEVNAD (VIKTIGT)
- Ingen juridisk rådgivning. Inga löften om utfall (“gäller i domstol”, “är fullt giltigt”, osv).
- Vid juridik/efterlevnad: generell orientering + faktorer som avgör + rekommendera jurist/revisor vid behov + föreslå demo/pilot.

TEKNIKEN (ENKEL FÖRKLARING)
- Hash = dokumentets fingeravtryck
- Tidsstämpel = klockslag från betrodd tidskälla
- Verifiering = kvitto på att innehållet inte ändrats sedan den tidpunkten

SVARSMALL (DEFAULT)
1) Direkt svar (1–3 meningar)
2) Så fungerar det (2–5 bullets)
3) Varför det spelar roll (1–3 bullets: risk/tid/friktion)
4) Nästa steg (CTA)

INVÄNDNINGAR (KORTA, PREMIUMSVAR)
- Kostnad: koppla till riskminskning + mindre revisionsfriktion. Föreslå pilot.
- “Vi signerar redan”: skillnad mellan godkännande (signatur) och verifierbar oförändradhet + tidpunkt (hash+tidsstämpling).
- “Domstol?”: ingen rådgivning; förklara kedja av bevis + vad Proofy bidrar med.

LEAD-KVALIFICERING (MAX 1 FRÅGA)
Ställ bara EN fråga om det hjälper:
- mål (revision/bokslut, tvist, spårbarhet)
- typ av dokument
- volym per månad
- system de använder idag

KUNSKAPSBAS
Du får inte hitta på funktioner, standarder, certifieringar, myndighetsgodkännanden eller priser som inte står i kunskapsbasen.
Om något saknas: säg “Jag vill inte gissa” och föreslå demo/pilot eller ställ EN precis fråga.

KUNSKAPSBAS:
${knowledge}

UTDATAFORMAT (MÅSTE FÖLJAS)
Returnera ENDAST giltig JSON (ingen extra text, inga kodblock):
{
  "answer": "…markdown/vanlig text…",
  "ctas": [
    {"label":"Starta pilot","url":"https://proofy.se/pilot"},
    {"label":"Boka demo","url":"https://proofy.se/boka-demo"},
    {"label":"Kontakta oss","url":"https://proofy.se/kontakt"}
  ],
  "lead": {"question":"…"} eller null
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
            "Upprepa inte samma formuleringar. Om du redan förklarat något: ge ett konkret exempel eller sammanfatta kort med ny vinkel.",
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
        answer:
          raw ||
          "Jag fick inget svar just nu. Vill du boka en demo så hjälper vi dig direkt.",
        ctas: [
          { label: "Boka demo", url: "https://proofy.se/boka-demo" },
          { label: "Starta pilot", url: "https://proofy.se/pilot" },
          { label: "Kontakta oss", url: "https://proofy.se/kontakt" },
        ],
        lead: null,
      };
    }

    // Server-side guard: CTA måste finnas
    if (!Array.isArray(payload.ctas) || payload.ctas.length < 2) {
      payload.ctas = [
        { label: "Boka demo", url: "https://proofy.se/boka-demo" },
        { label: "Starta pilot", url: "https://proofy.se/pilot" },
        { label: "Kontakta oss", url: "https://proofy.se/kontakt" },
      ];
    }

    if (!("lead" in payload)) payload.lead = null;
    if (!payload.answer) payload.answer = "Vill du berätta lite mer om er situation?";

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
        answer: "Det blev ett tekniskt fel. Försök igen, eller kontakta oss så hjälper vi dig direkt.",
        ctas: [
          { label: "Kontakta oss", url: "https://proofy.se/kontakt" },
          { label: "Boka demo", url: "https://proofy.se/boka-demo" },
        ],
        lead: null,
      }),
    };
  }
}
