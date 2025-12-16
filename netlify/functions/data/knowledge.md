
# Proofy Concierge – Knowledge Base (SV)

Källa: proofy.se (index/pilot/security/privacy/terms/thanks). Denna kunskapsbas används för att svara på frågor på webbplatsen.

## Vad är Proofy?
Proofy hjälper redovisningsbyråer att visa om ett underlag är **oförändrat** sedan en viss tidpunkt genom ett **verifierings‑ID**. Proofy är byggt för att **inte lagra dokumentinnehåll**.

## Hur det fungerar (översikt)
1) **Registrera** en fil → få verifierings‑ID (knyts till filens kryptografiska fingeravtryck/hash).  
2) **Referera** → spara ID i ärendet/noteringar/rutin.  
3) **Verifiera** senare → match / ingen match.

**Viktigt:** Proofy säger inget om vem som skapade dokumentet eller om innehållet är “rätt” – bara om filen matchar registrerad version.

## Säkerhet & integritet (principer)
- **Dokumentinnehåll lagras inte.** Filen används tillfälligt för att beräkna fingeravtryck och raderas därefter.
- **Fingeravtryck ≠ dokument.** Hash kan inte användas för att återskapa dokumentet.
- **Minimal attackyta.** MVP undviker riskökande funktioner som PDF‑rendering/OCR.
- **Skydd mot missbruk:** filstorleksgränser, begränsningar per kund/pilot, rate limiting och tekniska loggar (begränsad lagringstid).
- **Nycklar/hemligheter** hanteras via miljövariabler i driftmiljön och ska inte finnas i klientkod/repo/loggar.

## Vanliga frågor & invändningar (SV)
- **Lagrar ni dokument?** Nej, Proofy är byggt för att inte lagra dokumentinnehåll.
- **Är Proofy juridiskt bindande?** Proofy är ett tekniskt verifieringsunderlag och utgör inte juridisk rådgivning. Juridisk tolkning beror på sammanhang.
- **”PDF re-export/omskanning – kan det bli ‘ingen match’?”** Ja. Proofy verifierar filens bytes. Ny export/omkomprimering kan skapa en ny fil → ny hash.
- **”Varför ska vi lita på Proofy?”** Verifieringen bygger på kryptografiska fingeravtryck och jämförelse. För extra trygghet: spara verifierings‑ID i era ärenden och följ intern rutin.

## Pilot (30 dagar)
Pilot är snabbaste sättet att se om Proofy passar er rutin. Ni testar i verkliga ärenden, med låg friktion och tydliga ramar.

## Kontakt / demo
Boka demo via formuläret på /#kontakt eller mejla **kontakt@proofy.se**.

---

# Proofy Concierge – Knowledge Base (EN)

Source: proofy.se pages. This English section is a translation/interpretation to support Q&A. **We do not provide legal advice.**

## What is Proofy?
Proofy helps accounting firms verify whether a document has remained **unchanged** since a specific point in time using a **verification ID**. Proofy is designed **not to store document contents**.

## How it works
1) **Register** a file → get a verification ID (linked to a cryptographic fingerprint/hash).  
2) **Reference** the ID in your case notes/routine.  
3) **Verify** later → match / no match.

**Important:** Proofy does not judge whether the content is “correct” or who authored it—only whether the file matches the registered version.

## Security & privacy principles
- No document contents are stored.
- A hash cannot be used to reconstruct the document.
- MVP avoids features that increase risk (PDF rendering, OCR).
- Abuse prevention (limits, rate limiting, logs with limited retention).
- Secrets are handled via environment variables (never in client code / repo / logs).

## FAQ (EN)
- **Do you store documents?** No.
- **Is it legally binding?** Proofy is a technical verification aid and not legal advice.
- **Can re-exported PDFs become “no match”?** Yes, because the bytes change.
- **Why trust it?** Verification relies on cryptographic fingerprints and comparisons; store the verification ID in your case file.

## Book a demo / contact
Use the form on /#kontakt or email **kontakt@proofy.se**.


