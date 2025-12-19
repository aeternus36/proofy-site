export async function onRequestPost({ request }) {
  try {
    const body = await request.json().catch(() => ({}));
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const last = messages.length ? String(messages[messages.length - 1]?.content || "") : "";
    const text = last.toLowerCase();

    // Enkla, fungerande svar direkt (ingen extern API/nycklar behövs).
    // Du kan byta ut detta mot riktig AI senare utan att ändra frontend.
    let answer = "Jag kan hjälpa dig med pilot, demo, säkerhet och hur filverifiering fungerar. Vad vill du veta?";
    let ctas = [
      { label: "Hasha & registrera fil", url: "/hash.html" },
      { label: "Verifiera fil", url: "/verify.html" },
      { label: "Säkerhet", url: "/security.html" },
    ];
    let lead = { question: "Vill du verifiera en fil nu, eller prata pilotupplägg?" };

    if (text.includes("demo") || text.includes("boka")) {
      answer =
        "För demo: skriv företag + kontaktperson + önskad tid, så bokar vi 10–15 min.\n\nDu kan också använda kontaktformuläret längst ned på sidan eller mejla kontakt@proofy.se.";
      ctas = [
        { label: "Gå till kontakt", url: "/#kontakt" },
        { label: "Se pilot", url: "/pilot.html" },
        { label: "Säkerhet", url: "/security.html" },
      ];
      lead = { question: "Vill du att jag föreslår ett upplägg för pilot eller bara en snabb demo?" };
    } else if (text.includes("pilot")) {
      answer =
        "Pilot brukar vara: välj ett par typfall, registrera filer i verkliga ärenden, och spara verifierings-ID i ärendet.\n\nMålet är att testa rutin och beviskedja utan extra friktion.";
      ctas = [
        { label: "Pilotupplägg", url: "/pilot.html" },
        { label: "Hasha & registrera", url: "/hash.html" },
        { label: "Verifiera", url: "/verify.html" },
      ];
      lead = { question: "Vilken typ av underlag vill ni kunna styrka (t.ex. kundunderlag, avtal, beslut)?" };
    } else if (text.includes("gdpr") || text.includes("säkerhet") || text.includes("integritet")) {
      answer =
        "Proofy lagrar inte filinnehåll. Endast en kryptografisk hash (fingeravtryck) registreras, vilket inte kan användas för att återskapa filen.\n\nDet minimerar datalagring och attackyta.";
      ctas = [
        { label: "Säkerhet & integritet", url: "/security.html" },
        { label: "Verifiera fil", url: "/verify.html" },
        { label: "Hasha & registrera", url: "/hash.html" },
      ];
      lead = { question: "Vill du att jag förklarar hur verifierings-ID kan dokumenteras i ett ärende?" };
    } else if (text.includes("hash") || text.includes("verifiera") || text.includes("bytes32")) {
      answer =
        "Så funkar det:\n1) Hasha en fil lokalt i webbläsaren\n2) Registrera hash på kedjan\n3) Verifiera senare genom att hasha samma fil igen och jämföra\n\nMinsta ändring i filen ger ny hash → ingen match.";
      ctas = [
        { label: "Hasha & registrera fil", url: "/hash.html" },
        { label: "Verifiera fil", url: "/verify.html" },
        { label: "Villkor", url: "/terms.html" },
      ];
      lead = { question: "Vill du ha en delbar verifieringslänk (hash i URL) eller ett intyg att spara i ärendet?" };
    }

    return new Response(JSON.stringify({ ok: true, answer, ctas, lead }), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({
      ok: false,
      answer: "Det blev ett tekniskt fel. Mejla kontakt@proofy.se så hjälper vi dig."
    }), {
      status: 500,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
}

export async function onRequest({ request }) {
  if (request.method === "POST") return onRequestPost({ request });
  return new Response(JSON.stringify({ ok: false, error: "Method Not Allowed" }), {
    status: 405,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
