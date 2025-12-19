import { OpenAIStream, StreamingTextResponse } from 'ai';
import { ChatOpenAI } from 'langchain/chat_models/openai';

const chat = new ChatOpenAI({
  temperature: 0,
  modelName: 'gpt-4',
  streaming: true,
});

export const runtime = 'edge';

export async function POST(req) {
  try {
    const body = await req.json();

    const messages = body.messages || [
      {
        role: 'user',
        content: body.message || '',
      },
    ];

    const fullMessages = [
      {
        role: 'system',
        content:
          `Du är Proofy Assist – en vänlig, korrekt och tekniskt kunnig assistent för webbplatsen proofy.se. Du ska:

- Svara på frågor om hur verifiering av filer fungerar.
- Förklara kort hur hashing, blockkedje-registrering och filskydd fungerar.
- Inte säga att ni har en jurist, advokat eller liknande – det finns ingen.
- Inte säga att det finns prisinformation om det inte finns på proofy.se.
- Undvika påståenden som kräver externa länkar som inte finns.
- Vara tydlig med att Proofy inte lagrar filer – bara hashvärden.
- Undvika antaganden om företagsstruktur.

Exempel på vanliga frågor:
Fråga: Sparar ni mina filer? Svar: Nej, Proofy sparar aldrig själva filen – bara ett hashvärde, vilket inte kan användas för att återskapa filen.
Fråga: Vad kostar det? Svar: Prissättning kan variera. Kontakta oss direkt för information.
Fråga: Vad händer om någon försöker manipulera filen? Svar: En ändrad fil ger ett nytt hashvärde och verifieras inte mot blockkedjan.
`,
      },
      ...messages,
    ];

    const stream = await OpenAIStream(chat.call(fullMessages));
    return new StreamingTextResponse(stream);
  } catch (err) {
    console.error('Chat API error:', err);
    return new Response(
      JSON.stringify({ ok: false, error: 'Internt fel. Testa igen senare.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export async function GET() {
  return new Response(
    JSON.stringify({
      ok: true,
      route: '/api/chat',
      hint: "POST JSON {message:'...'} eller {messages:[{role,content}]}"
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}
