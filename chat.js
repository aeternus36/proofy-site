/**
 * Netlify Function: Proofy Concierge Chat (SV/EN)
 * Endpoint: POST /.netlify/functions/chat
 * Body: { message: string, locale?: "sv"|"en" }
 *
 * Env var required:
 *   OPENAI_API_KEY
 */
import fetch from "node-fetch";

const KNOWLEDGE = `# Proofy Concierge – Knowledge Base (SV)

Källa: proofy.se (index/pilot/security/privacy/terms/thanks). Denna kunskapsbas används för att svara på frågor på webbplatsen.

## Innehåll från index.html

Proofy – Dokumentverifiering för redovisningsbyråer 

 Proofy 

 För byråer 
 Hur det fungerar 
 Säkerhet 
 FAQ 
 Kontakt 

 Boka demo 

 För redovisningsbyråer · revision · granskning

 Ett enkelt sätt att visa att underlag inte har ändrats – när det faktiskt spelar roll.

 När ett underlag ifrågasätts i efterhand uppstår onödiga diskussioner.
 Proofy ger dig ett verifierings-ID som gör det enkelt att kontrollera om en fil
 är oförändrad sedan en viss tidpunkt. Vi lagrar inte dokumentinnehåll. 

 Starta pilot 
 Varför behövs detta? 
 Hur det fungerar 
 Säkerhet & integritet 

 🔒 Inget dokumentinnehåll lagras 
 🧾 Verifiering med ID 
 ⚡ 1–2 min att testa 

 Proofy är ett tekniskt verifieringsunderlag. Inte e‑signering, inte filarkiv och inte juridisk rådgivning.

 Varför behövs detta?

 I byråvardagen händer det att någon säger: “Den där PDF:en har ändrats” eller “Det var inte den versionen vi skickade in” .
 Utan ett objektivt sätt att kontrollera versionen blir det lätt ord‑mot‑ord.

 Dialog med kund 
 Visa att underlaget ni arbetade på är samma som kunden skickade vid ett visst datum. 

 Granskning / revision 
 Stärk er interna dokumentation genom att kunna verifiera att en fil är oförändrad. 

 Tvist & efterfrågor 
 Minska tiden på “bevisa version” när en part ifrågasätter ett dokument i efterhand. 

 Kärnan: Proofy gör det enkelt att kontrollera om en fil är samma som den som registrerades – utan att någon behöver “lita på” e‑posttrådar eller filnamn.

 Vad Proofy gör

 Skapar ett verifierings-ID för ett dokument vid registrering.

 Ger en tidsstämplad post kopplad till dokumentets fingeravtryck.

 Låter dig verifiera senare: match / ingen match.

 Lagrar inte dokumentinnehåll (Proofy är inte ett arkiv).

 Tekniska detaljer (för den som vill)

 Proofy beräknar ett kryptografiskt fingeravtryck (hash) av filens bytes.
 Minsta ändring i filen ger ett helt annat fingeravtryck. Fingeravtrycket kan inte användas för att återskapa dokumentet.

 Hur det fungerar

 1) Registrera 
 Registrera en fil och få ett verifierings‑ID. 

 2) Referera 
 Spara ID i ärendet/noteringar eller i er rutin. 

 3) Verifiera 
 Kontrollera vid behov om filen matchar posten. 

 Viktigt: Proofy säger inget om vem som skapade dokumentet eller om innehållet är “rätt” – bara om filen är oförändrad jämfört med registrerad version.

 Säkerhet & integritet

 Inget dokumentinnehåll lagras. Proofy är byggt för att inte bli ett “dataskåp”.

 Minimal attackyta. Fokus på registrering och verifiering – inga PDF‑renderingar/OCR i MVP.

 Kontrollerbarhet. Verifieringen bygger på jämförelse av fingeravtryck.

 Mer: Säkerhet & integritet .

 Vanliga invändningar

 “Vad händer om någon skapar en ny PDF och påstår att den är originalet?”

 En ny fil får ett annat fingeravtryck och matchar inte den registrerade posten. Proofy visar om filen du verifierar är samma som den registrerade versionen.

 “Är detta juridiskt bindande?”

 Proofy är ett tekniskt verifieringsunderlag. Det ersätter inte juridisk bedömning, men kan användas som en del av dokumentation vid granskning eller tvist.

 “Ser ni våra dokument?”

 Nej. Proofy är byggt för att inte lagra dokumentinnehåll. Endast tekniska referenser som krävs för verifiering lagras.

 Kontakta oss

 Be om en kort demo (10–15 min) eller starta en pilot. Du får svar inom 1 arbetsdag.

 Don’t fill this out: 

 Namn * 

 E‑post * 

 Företag 

 Ca dokument/månad 

 Meddelande * 

 Skicka 
 Se pilotupplägg 
 Eller maila oss på kontakt@proofy.se 

 OBS: Proofy är en digital tjänst för dokumentverifiering och spårbarhet. Vi ersätter inte juridisk rådgivning eller revision.

 Proofy

 © 2025 Proofy. Alla rättigheter förbehållna.

 Proofy tillhandahåller teknisk tidsstämpling och verifiering av dokument. Tjänsten utgör inte juridisk rådgivning och avgör inte dokumentets rättsliga giltighet.

 Säkerhet 
 Integritet 
 Villkor 
 Kontakt

## Innehåll från pilot.html

Pilotupplägg – Proofy 

 Proofy 

 För byråer 
 Hur det fungerar 
 Säkerhet 
 FAQ 
 Kontakt 

 Boka demo 

 Pilot för redovisningsbyråer

 Starta en pilot på 30 dagar

 Pilot är snabbaste sättet att se om Proofy passar er rutin. Ni testar i verkliga ärenden, med låg friktion och tydliga ramar.

 Ingår 
 Registrering + verifiering, verifierings‑ID, samt support under piloten. 

 Upplägg 
 Vi sätter en enkel rutin: när ni registrerar, var ni sparar ID, och hur ni verifierar. 

 Tryggt 
 Fast månadspris, faktura, ingen bindning efter pilot om ni inte vill fortsätta. 

 Rekommenderad rutin (exempel)

 Registrera underlag som är särskilt viktiga (bokslut, rapporter, avtal, sammanställningar).

 Spara verifierings‑ID i ärendet/noteringar.

 Vid fråga/granskning: verifiera filen och visa match/ingen match.

 Starta pilot

 Don’t fill this out: 

 Namn * 

 E‑post * 

 Byrå/Företag * 

 Roll 

 Kort om ert case (valfritt) 

 Begär pilot 
 Läs om säkerhet 
 Vi återkommer normalt inom 1–2 arbetsdagar. 

 Juridisk avgränsning: Proofy tillhandahåller teknisk verifiering. Tjänsten utgör inte juridisk rådgivning och avgör inte dokumentets rättsliga giltighet.

 Proofy

 © 2025 Proofy. Alla rättigheter förbehållna.

 Proofy tillhandahåller teknisk tidsstämpling och verifiering av dokument. Tjänsten utgör inte juridisk rådgivning och avgör inte dokumentets rättsliga giltighet.

 Säkerhet 
 Integritet 
 Villkor 
 Kontakt

## Innehåll från security.html

Säkerhet & integritet – Proofy 

 Proofy 

 För byråer 
 Hur det fungerar 
 Säkerhet 
 FAQ 
 Kontakt 

 Boka demo 

 Säkerhet & integritet

 Proofy är designat för byråers verklighet: känsliga underlag, höga krav och minimal tolerans för överdrifter. Därför bygger vi för minimal risk.

 Princip: “minimera vad som kan läcka”

 1. Dokumentinnehåll lagras inte

 Dokumentet används tillfälligt för att beräkna ett kryptografiskt fingeravtryck och raderas därefter. Proofy är inte ett filarkiv.

 2. Fingeravtryck ≠ dokument

 Fingeravtrycket (hash) kan inte användas för att läsa eller återskapa dokumentet. Det används enbart för att jämföra integritet.

 3. Minimal attackyta

 I MVP undviker vi funktioner som normalt ökar risk, t.ex. PDF-rendering, OCR och textutvinning.

 4. Skydd mot missbruk

 Filstorleksgränser och begränsningar per kund/pilot

 Rate limiting och/eller API-nycklar för att minska botar

 Tekniska loggar för felsökning och missbruksdetektion

 5. Nycklar & hemligheter

 Hanteras via miljövariabler i driftmiljön. Private keys ska aldrig finnas i kodrepo, klientkod eller loggar.

 Kontakt

 Säkerhetsfrågor: kontakt@proofy.se

 Ansvarsfull upplysning: Om du upptäcker en sårbarhet, kontakta oss så åtgärdar vi den skyndsamt.

 Proofy

 © 2025 Proofy. Alla rättigheter förbehållna.

 Proofy tillhandahåller teknisk tidsstämpling och verifiering av dokument. Tjänsten utgör inte juridisk rådgivning och avgör inte dokumentets rättsliga giltighet.

 Säkerhet 
 Integritet 
 Villkor 
 Kontakt

## Innehåll från privacy.html

Integritetspolicy – Proofy 

 Proofy 

 För byråer 
 Hur det fungerar 
 Säkerhet 
 FAQ 
 Kontakt 

 Boka demo 

 Integritetspolicy

 Proofy är byggt enligt principen privacy by design . Vi behandlar så lite data som möjligt och undviker att lagra dokumentinnehåll.

 Senast uppdaterad: 2025-12-14

 1. Vad Proofy gör

 Proofy tillhandahåller teknisk tidsstämpling och verifiering av dokument genom att beräkna ett kryptografiskt fingeravtryck (hash) av filens innehåll och registrera fingeravtryck + tid i ett publikt, oföränderligt tidsstämplat register.

 2. Dokumentinnehåll

 Proofy lagrar inte dokumentets innehåll. Dokumentet används endast tillfälligt för att beräkna fingeravtryck och raderas därefter.

 3. Personuppgifter

 Proofy är utformat för att minimera personuppgiftsbehandling. Om du kontaktar oss via e-post behandlar vi de uppgifter du själv skickar (t.ex. namn, e-postadress och meddelande) för att kunna besvara din förfrågan.

 4. Loggar och driftdata

 För driftsäkerhet kan teknisk information såsom tidpunkt, felmeddelanden, ungefärlig filstorlek och IP-adress behandlas. Loggar används för felsökning, säkerhet och missbruksbekämpning och sparas under begränsad tid.

 5. Tredje parter

 Proofy kan använda underleverantörer för infrastruktur (t.ex. hosting, DNS, e-post). Vi delar inte dokumentinnehåll eftersom det inte lagras.

 6. Dina rättigheter

 Om vi behandlar personuppgifter (t.ex. via e-postkontakt) har du rättigheter enligt GDPR. Kontakta oss på kontakt@proofy.se.

 Obs: Vid större kommersiell lansering (betalningar, konton, integrationer) bör policyn uppdateras och eventuellt granskas juridiskt.

 Proofy

 © 2025 Proofy. Alla rättigheter förbehållna.

 Proofy tillhandahåller teknisk tidsstämpling och verifiering av dokument. Tjänsten utgör inte juridisk rådgivning och avgör inte dokumentets rättsliga giltighet.

 Säkerhet 
 Integritet 
 Villkor 
 Kontakt

## Innehåll från terms.html

Allmänna villkor – Proofy 

 Proofy 

 För byråer 
 Hur det fungerar 
 Säkerhet 
 FAQ 
 Kontakt 

 Boka demo 

 Allmänna villkor

 Dessa villkor beskriver hur Proofy får användas och vad tjänsten innebär. De är skrivna för tydlighet och för att undvika överlöften.

 Senast uppdaterad: 2025-12-14

 1. Tjänstens omfattning

 Proofy tillhandahåller teknisk tidsstämpling och verifiering av dokument genom kryptografiskt fingeravtryck (hash) och registrering av fingeravtryck + tid i ett publikt, oföränderligt tidsstämplat register.

 2. Ingen lagring av dokument

 Proofy lagrar inte dokumentets innehåll. Tjänsten lagrar endast tekniska referenser (t.ex. verifierings-ID, fingeravtryck och tidsinformation) som krävs för verifiering.

 3. Juridisk avgränsning

 Proofy utgör inte juridisk rådgivning och avgör inte dokumentets rättsliga giltighet, parternas avsikter eller avtalsförhållanden. Proofy är ett tekniskt underlag som kan användas som del av dokumentation i granskning, revision eller tvist.

 4. Korrekt användning

 Användaren ansvarar för att registrera rätt dokumentversion.

 Användaren ansvarar för att bevara originaldokumentet för framtida verifiering.

 Tjänsten får inte användas i strid med lag, sekretesskrav eller tredje parts rättigheter.

 5. Begränsningar

 Tjänsten kan påverkas av externa faktorer såsom nätverk och tredjepartsinfrastruktur. Proofy eftersträvar hög tillgänglighet men garanterar inte oavbruten drift i alla situationer.

 6. Ansvarsbegränsning

 Proofy ansvarar inte för indirekta skador eller följdskador. Proofys ansvar är begränsat till vad som följer av tvingande lag och eventuellt uttryckligen avtalats skriftligen.

 7. Kontakt

 Frågor: kontakt@proofy.se

 Obs: Vid större kommersiell lansering (betalningar, konton, personuppgiftsflöden) bör villkoren uppdateras och eventuellt granskas juridiskt.

 Proofy

 © 2025 Proofy. Alla rättigheter förbehållna.

 Proofy tillhandahåller teknisk tidsstämpling och verifiering av dokument. Tjänsten utgör inte juridisk rådgivning och avgör inte dokumentets rättsliga giltighet.

 Säkerhet 
 Integritet 
 Villkor 
 Kontakt

## Innehåll från thanks.html

Proofy – Dokumentverifiering för redovisningsbyråer 

 Proofy 

 För byråer 
 Hur det fungerar 
 Säkerhet 
 FAQ 
 Kontakt 

 Boka demo 

 Tack!

 Din förfrågan är skickad. Vi återkommer inom 1 arbetsdag.

 Om det är brådskande kan du också maila oss på kontakt@proofy.se .

 Tillbaka till startsidan 
 Se pilotupplägg 

 Proofy

 © 2025 Proofy. Alla rättigheter förbehållna.

 Proofy tillhandahåller teknisk tidsstämpling och verifiering av dokument. Tjänsten utgör inte juridisk rådgivning och avgör inte dokumentets rättsliga giltighet.

 Säkerhet 
 Integritet 
 Villkor 
 Kontakt

## Kuraterad FAQ & Invändningar (SV)
### Vad är Proofy?
Proofy hjälper dig att verifiera om ett dokument/underlag är oförändrat sedan det registrerades, genom ett verifierings-ID. Proofy lagrar inte dokumentinnehåll.

### Lagrar ni dokument?
Nej. Tjänsten är designad för att inte lagra dokumentinnehåll, utan endast tekniska referenser som behövs för verifiering.

### Är Proofy juridiskt bindande?
Proofy är ett tekniskt verifieringsunderlag och utgör inte juridisk rådgivning. Hur det används i en juridisk bedömning beror på sammanhanget.

### “Kunden kan exportera om PDF:en – blir det ‘ingen match’ fast innehållet ser samma ut?”
Ja, det kan hända. Proofy verifierar filens bytes. Om en process skapar en ny fil (ny export, omskanning, omkomprimering) kan den räknas som ny version tekniskt. I pilot sätter man rutiner för vilken fil som ska registreras (original vs exporterad kopia).

### “Varför ska vi lita på Proofy?”
Proofy är byggt för minimal tillit: verifieringen baseras på kryptografiska fingeravtryck. Proofy lagrar inte dokumentinnehåll och kan inte återskapa dokument från fingeravtryck. För extra trygghet: spara verifierings-ID i ert ärende och använd interna rutiner.

### “Kan man fejka en match?”
Match innebär att filen matchar den registrerade referensen. Att skapa en annan fil som ger exakt samma moderna kryptografiska fingeravtryck är i praktiken extremt svårt.

### “Vad ska jag göra om frågan blir juridisk?”
Jag kan inte ge juridisk rådgivning. Jag kan förklara vad Proofy gör tekniskt och föreslå att ni tar juridiska frågor med jurist/revisor.

### Boka demo / kontakt
För att boka demo: använd formuläret på sidan (sektionen “Kontakt”) eller maila kontakt@proofy.se.


# Proofy Concierge – Knowledge Base (EN)
Source: proofy.se pages. This English section is an interpretation/translation to support English Q&A. For legal questions, we do not provide legal advice.

## What is Proofy?
Proofy helps you verify whether a document has remained unchanged since it was registered, using a verification ID. Proofy is designed not to store document contents.

## Key Q&A (EN)
### Do you store documents?
No. Proofy is built to avoid storing document contents and instead stores technical references needed for verification.

### Is Proofy legally binding?
Proofy is a technical verification aid and does not provide legal advice. Legal interpretation depends on the context.

### “If a client re-exports a PDF, can it become a ‘no match’ even if it looks the same?”
Yes. Proofy verifies the file’s bytes. If a workflow produces a new file (re-export, rescanning, recompression), it may be a new technical version. In a pilot, you define which version should be registered (original vs exported copy).

### “Why should we trust Proofy?”
Proofy is designed for minimal trust: verification relies on cryptographic fingerprints. Proofy does not store document contents and cannot reconstruct a document from a fingerprint. For extra assurance: store the verification ID in your case file and use internal routines.

### Book a demo / contact
To book a demo: use the form on the website (Contact section) or email kontakt@proofy.se.
`;

// Best-effort rate limit (resets on cold start)
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

export const handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  const ip = event.headers["x-nf-client-connection-ip"] || event.headers["x-forwarded-for"] || "unknown";
  if (!allow(ip)) {
    return { statusCode: 429, headers: {"Content-Type":"application/json"}, body: JSON.stringify({ reply: "Too many requests. Please try again soon." }) };
  }

  try {
    const { message, locale } = JSON.parse(event.body || "{}");
    if (!message || typeof message !== "string") {
      return { statusCode: 400, body: "Missing message" };
    }
    const lang = (locale === "en") ? "en" : "sv";

    const system = lang === "sv" ? `
Du är Proofy Concierge, en AI-assistent för proofy.se.

Hårda regler:
- Svara endast med stöd av KUNSKAPSBASEN nedan. Använd den som källa.
- Om svaret inte tydligt finns: säg att du inte vet och föreslå demo/pilot eller att kontakta Proofy (kontakt@proofy.se).
- Ge aldrig juridisk rådgivning. Om frågan är juridisk: säg det och föreslå jurist/revisor.
- Hitta inte på priser, certifieringar, garantier, integrationer eller funktioner som inte uttryckligen stöds av KUNSKAPSBASEN.
- Var tydlig med begränsningar (Proofy verifierar oförändring, inte “rätt innehåll”).

Svarsformat:
- Kort och tydligt först.
- Om relevant: punktlista med nästa steg.
- Om relevant: avsluta med “Vill du boka en demo?” och hänvisa till /#kontakt eller mail.
` : `
You are Proofy Concierge, an AI assistant for proofy.se.

Hard rules:
- Answer only using the KNOWLEDGE BASE below. Treat it as the source of truth.
- If the answer is not clearly supported: say you don't know and suggest a demo/pilot or contacting Proofy (kontakt@proofy.se).
- Never provide legal advice. If the question is legal: state that and suggest a lawyer/auditor.
- Do not invent pricing, certifications, guarantees, integrations, or features not supported by the KNOWLEDGE BASE.
- Be explicit about limitations (Proofy verifies unchanged files, not “correct content”).

Response style:
- Lead with a clear short answer.
- Add bullets with next steps if relevant.
- If relevant: end with “Would you like to book a demo?” and point to /#kontakt or email.
`;

    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          { role: "system", content: (system + "\n\nKNOWLEDGE BASE:\n" + KNOWLEDGE).trim() },
          { role: "user", content: message.trim() }
        ],
        max_output_tokens: 650
      })
    });

    const data = await res.json();
    const reply = data.output_text || (lang === "sv" ? "Jag kan tyvärr inte svara på det just nu." : "I can’t answer that right now.");

    return { statusCode: 200, headers: {"Content-Type":"application/json"}, body: JSON.stringify({ reply }) };
  } catch (e) {
    return { statusCode: 500, headers: {"Content-Type":"application/json"}, body: JSON.stringify({ reply: "Technical error. Please try again later." }) };
  }
};
