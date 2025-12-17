import fs from "fs";
import path from "path";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function handler(event) {
  try {
    const body = JSON.parse(event.body || "{}");

    // Förväntar sig att frontend skickar in en "messages"-array (roll + content)
    const incomingMessages = Array.isArray(body.messages) ? body.messages : [];

    // Trimma historiken för att minska repetition + kostnad
    const messages = incomingMessages.slice(-10);

    const knowledgePath = path.join(
      process.cwd(),
      "netlify/functions/data/knowledge.md"
    );

    let knowledge = "";
    if (fs.existsSync(knowledgePath)) {
      knowledge = fs.readFileSync(knowledgePath, "utf8");
    }

    // Systemprompt v2 (premium + struktur + CTA + juridik-guard)
    const systemPrompt = `
Du är Proofy Assist, en premium och affärsmässig (men inte påträngande) assistent för Proofy.se.
Proofy hjälper företag att verifiera dokument och underlag med kryptografisk hash + tidsstämpling för revision, bokslut, tvister och spårbarhet.

MÅL (i ordning)
1) Svara korrekt, tydligt och professionellt på användarens fråga.
2) Bygg förtroende: sakligt, konkret, “premium”, utan fluff.
3) Driv alltid mot nästa steg (demo/kontakt/pilot) med tydliga länkar.
4) Kvalificera mjukt: ställ max EN relevant fråga när d
