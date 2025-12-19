// functions/api/chat.js

import { OpenAIStream, StreamingTextResponse } from 'ai';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const ctas = [
  { label: 'Hasha & registrera fil', url: '/hash.html' },
  { label: 'Verifiera fil', url: '/verify.html' },
  { label: 'Fråga oss', url: '/index.html#kontakt' },
];

const faqContent = `
Proofy är en webbtjänst där du kan bevisa att du hade en viss fil vid en viss tidpunkt – utan att vi någonsin sparar filen.

- Vi lagrar inte dina filer. Allt hashas lokalt i webbläsaren med SHA-256.
- Du kan registrera ett fil-hash tillsammans med en tidsstämpel.
- Du kan senare verifiera att en fil matchar ett redan registrerat hash.
- Proofy fungerar med valfri filtyp.
- Proofy är gratis att testa. Eventuell prissättning meddelas direkt av vårt team.
- Vi ger inte juridisk rådgivning, men hjälper gärna med hur Proofy fungerar.
`;

export const POST = async ({ request }) => {
  try {
    const body = await request.json();
    const messages = body?.messages || [
      { role: 'user', content: body.message || '' },
    ];

    const system = {
      role: 'system',
      content: `Du är Proofy Assist – en saklig, hjälpsam AI som svarar på svenska på frågor om Proofy.

Proofy hjälper användare att skapa och verifiera hashvärden (SHA-256) av filer, utan att spara själva filerna. Du ger aldrig juridisk rådgivning och föreslår inte att kontakta jurist. Hänvisa istället till vår kontaktsida vid behov.

Om någon frågar om kostnader, svara att Proofy är gratis att testa och att ev. priser meddelas separat. Var hjälpsam, men håll dig till fakta. Avsluta gärna med en call-to-action:
${ctas.map(({ label, url }) => `- ${label}: ${url}`).join('\n')}

Vanliga frågor:
${faqContent.slice(0, 1800)}
`
    };

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      stream: true,
      messages: [system, ...messages],
    });

    return new StreamingTextResponse(response);
  } catch (err) {
    console.error('Chat API error:', err);
    return new Response(JSON.stringify({ error: 'Server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const GET = async () => {
  return new Response(
    JSON.stringify({
      ok: true,
      route: '/api/chat',
      hint: 'POST JSON {message:"..."} eller {messages:[{role,content}]}',
      hasOpenAIKey: !!process.env.OPENAI_API_KEY,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
};
