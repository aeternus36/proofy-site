(() => {
  function init() {
    if (window.__proofyChatWidgetInit) return;
    window.__proofyChatWidgetInit = true;

    const chatHistory = [];
    let isOpen = false;

    // Inject CSS once
    if (!document.getElementById("proofy-chat-style")) {
      const style = document.createElement("style");
      style.id = "proofy-chat-style";
      style.textContent = `
      :root{
        --proofy-safe-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
        --proofy-safe-right:  calc(16px + env(safe-area-inset-right, 0px));
        /* Default reserved space for the floating button (pages may use this) */
        --proofy-fab-space: 108px;
      }

      /* Reserve a bit of space so the floating bubble doesn't cover last content.
         NOTE: true collision avoidance is handled by JS (see avoidOverlap). */
      body.__proofy-has-chat{
        padding-bottom: calc(var(--proofy-fab-space) + env(safe-area-inset-bottom, 0px)) !important;
      }

      .proofy-chat-btn{
        position:fixed;
        right: var(--proofy-safe-right);
        bottom: var(--proofy-safe-bottom);
        z-index: 2147483000;
        padding: 12px 16px;
        border-radius: 999px;
        border: none;
        cursor: pointer;
        background: linear-gradient(135deg,#6ee7b7,#3b82f6);
        color: #0b1020;
        font-weight: 900;
        box-shadow: 0 10px 30px rgba(0,0,0,.25);
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation;
      }
      .proofy-chat-btn:active{ transform: translateY(1px); }

      .proofy-panel{
        position:fixed;
        right: var(--proofy-safe-right);
        bottom: calc(var(--proofy-safe-bottom) + 66px);
        z-index: 2147483001;
        width: min(380px, calc(100vw - 32px));
        height: min(560px, calc(100vh - 140px));
        background: rgba(10,16,32,.94);
        border: 1px solid rgba(255,255,255,.10);
        border-radius: 18px;
        overflow: hidden;
        box-shadow: 0 20px 60px rgba(0,0,0,.45);
        display: none;
        font-family: system-ui;
        color: #eaf1ff;
      }

      /* Blur only when supported */
      @supports ((-webkit-backdrop-filter: blur(10px)) or (backdrop-filter: blur(10px))){
        .proofy-panel{
          -webkit-backdrop-filter: blur(10px);
          backdrop-filter: blur(10px);
        }
      }
      /* Firefox Android can glitch with blur; disable there */
      @-moz-document url-prefix(){
        .proofy-panel{ backdrop-filter:none !important; }
      }

      .proofy-header{
        display:flex;align-items:center;justify-content:space-between;
        padding:12px;border-bottom:1px solid rgba(255,255,255,.08);
        background:rgba(255,255,255,.03);
      }
      .proofy-title{font-weight:900;font-size:14px;display:flex;gap:10px;align-items:center;}
      .proofy-dot{
        width:10px;height:10px;border-radius:999px;
        background:linear-gradient(135deg,#6ee7b7,#3b82f6);
        box-shadow:0 0 0 3px rgba(110,231,183,.12);
      }
      .proofy-x{
        width:34px;height:34px;border-radius:12px;
        border:1px solid rgba(255,255,255,.10);
        background:rgba(255,255,255,.04);
        color:#eaf1ff;cursor:pointer;
      }
      .proofy-body{padding:12px;height:calc(100% - 56px - 64px);overflow:auto;}
      .proofy-msg{margin:10px 0;display:flex;flex-direction:column;gap:8px;}
      .proofy-msg.user{align-items:flex-end;}
      .proofy-msg.assistant{align-items:flex-start;}
      .proofy-bubble{
        max-width:85%;
        padding:10px 12px;
        border-radius:14px;
        border:1px solid rgba(255,255,255,.10);
        background:rgba(255,255,255,.04);
        line-height:1.35;
        font-size:13px;
        white-space:pre-wrap;
        overflow-wrap:anywhere;
        word-break:break-word;
      }
      .proofy-msg.user .proofy-bubble{background:rgba(59,130,246,.20);border-color:rgba(59,130,246,.25);}
      .proofy-ctas{display:flex;gap:8px;flex-wrap:wrap;max-width:85%;}
      .proofy-cta{
        display:inline-flex;align-items:center;
        padding:9px 12px;border-radius:999px;
        border:1px solid rgba(255,255,255,.14);
        background:rgba(255,255,255,.06);
        color:#eaf1ff;text-decoration:none;
        font-weight:900;font-size:12px;cursor:pointer;
      }
      .proofy-cta:hover{background:rgba(255,255,255,.10);}
      .proofy-footer{
        display:flex;gap:8px;padding:10px;
        border-top:1px solid rgba(255,255,255,.08);
        background:rgba(255,255,255,.02);
      }
      .proofy-input{
        flex:1;padding:10px 12px;border-radius:12px;
        border:1px solid rgba(255,255,255,.12);
        background:rgba(0,0,0,.20);color:#eaf1ff;outline:none;
      }
      .proofy-send{
        padding:10px 14px;border-radius:12px;border:none;
        cursor:pointer;background:linear-gradient(135deg,#6ee7b7,#3b82f6);
        color:#0b1020;font-weight:900;
      }

      /* PRINT/PDF: widget must never appear or affect evidence layout */
      @media print{
        .proofy-chat-btn, .proofy-panel{ display:none !important; }
        body.__proofy-has-chat{ padding-bottom: 0 !important; }
        :root{ --proofy-fab-space: 0px !important; }
      }
      `;
      document.head.appendChild(style);
    }

    // Mark body so it gets safe padding
    document.body.classList.add("__proofy-has-chat");

    // Ensure pages can reserve space consistently (they may use var(--proofy-fab-space))
    // Keep this conservative: it represents the *minimum* reserved space.
    try {
      document.documentElement.style.setProperty("--proofy-fab-space", "108px");
    } catch {}

    // Create button once
    let button = document.querySelector(".proofy-chat-btn");
    if (!button) {
      button = document.createElement("button");
      button.className = "proofy-chat-btn";
      button.type = "button";
      button.innerText = "Fråga oss";
      button.setAttribute("aria-label", "Öppna Proofy Assist");
      document.body.appendChild(button);
    }

    // Create panel once
    let panel = document.querySelector(".proofy-panel");
    if (!panel) {
      panel = document.createElement("div");
      panel.className = "proofy-panel";
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-label", "Proofy Assist");
      panel.innerHTML = `
      <div class="proofy-header">
        <div class="proofy-title"><span class="proofy-dot"></span>Proofy Assist</div>
        <button class="proofy-x" aria-label="Stäng" type="button">✕</button>
      </div>
      <div class="proofy-body"><div id="proofy-messages"></div></div>
      <div class="proofy-footer">
        <input class="proofy-input" placeholder="Skriv en fråga..." />
        <button class="proofy-send" type="button">Skicka</button>
      </div>
    `;
      document.body.appendChild(panel);
    }

    const msgRoot = panel.querySelector("#proofy-messages");
    const input = panel.querySelector(".proofy-input");
    const sendBtn = panel.querySelector(".proofy-send");
    const closeBtn = panel.querySelector(".proofy-x");
    if (!msgRoot || !input || !sendBtn || !closeBtn) return;

    // === HARDTEST: avoid covering important CTAs / controls on small screens ===
    // Strategy: if the floating button overlaps an interactive element in the viewport,
    // translate the button (and panel) upwards until the overlap is gone.
    const INTERACTIVE_SELECTOR =
      'button, a[href], input, select, textarea, [role="button"], [role="link"], [tabindex]:not([tabindex="-1"])';

    let currentLiftPx = 0;

    function rectsOverlap(a, b) {
      return !(
        a.right <= b.left ||
        a.left >= b.right ||
        a.bottom <= b.top ||
        a.top >= b.bottom
      );
    }

    function computeRequiredLift(btnRect) {
      // Scan interactive elements that are visible and could be blocked by the button.
      const candidates = Array.from(document.querySelectorAll(INTERACTIVE_SELECTOR))
        .filter((el) => {
          if (!el || el === button) return false;
          if (panel.contains(el)) return false;
          const r = el.getBoundingClientRect();
          // Must be in viewport and have size
          if (r.width < 12 || r.height < 12) return false;
          if (r.bottom < 0 || r.top > window.innerHeight) return false;
          if (r.right < 0 || r.left > window.innerWidth) return false;

          // Only care about things near where the button sits (bottom-right zone)
          const nearBottom = r.bottom > window.innerHeight - 260;
          const nearRight = r.right > window.innerWidth - 260;
          return nearBottom && nearRight;
        });

      let lift = 0;

      for (const el of candidates) {
        const r = el.getBoundingClientRect();
        if (!rectsOverlap(btnRect, r)) continue;

        // Lift enough so button top clears element bottom (with margin)
        const margin = 12;
        const needed = (btnRect.bottom - r.top) + margin;
        lift = Math.max(lift, needed);
      }

      // Cap lift so button never leaves the viewport completely
      const maxLift = Math.max(0, window.innerHeight - btnRect.height - 24);
      return Math.min(lift, maxLift);
    }

    function applyLift(px) {
      currentLiftPx = px;
      const t = px ? `translateY(${-px}px)` : "";
      button.style.transform = t;
      // Panel should move with the button so its anchor remains consistent.
      panel.style.transform = t;
    }

    function avoidOverlap() {
      // Disable in print and when hidden elements not laid out.
      if (window.matchMedia && window.matchMedia("print").matches) return;
      if (!button || !document.body.contains(button)) return;

      // Only enforce on narrow screens; on desktop it's less risky and could feel "jumpy".
      const narrow = window.innerWidth <= 420;

      if (!narrow) {
        if (currentLiftPx) applyLift(0);
        return;
      }

      // Reset first, then measure.
      if (currentLiftPx) applyLift(0);

      const btnRect = button.getBoundingClientRect();
      const lift = computeRequiredLift(btnRect);
      if (lift > 0) applyLift(lift);
    }

    // Throttle to animation frame
    let rafPending = false;
    function scheduleAvoidOverlap() {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        avoidOverlap();
      });
    }

    window.addEventListener("scroll", scheduleAvoidOverlap, { passive: true });
    window.addEventListener("resize", scheduleAvoidOverlap);
    // Some mobile browsers change viewport height when address bar collapses/expands.
    window.addEventListener("orientationchange", scheduleAvoidOverlap);

    function toggle(open) {
      isOpen = open ?? !isOpen;
      panel.style.display = isOpen ? "block" : "none";
      scheduleAvoidOverlap();
      if (isOpen) input.focus();
    }
    button.onclick = () => toggle(true);
    closeBtn.onclick = () => toggle(false);

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && isOpen) toggle(false);
    });

    function addMessage(role, text) {
      const wrapper = document.createElement("div");
      wrapper.className = `proofy-msg ${role}`;
      const bubble = document.createElement("div");
      bubble.className = "proofy-bubble";
      bubble.textContent = String(text || "");
      wrapper.appendChild(bubble);
      msgRoot.appendChild(wrapper);
      const body = panel.querySelector(".proofy-body");
      body.scrollTop = body.scrollHeight;
      return wrapper;
    }

    function normalizeUrl(u) {
      const s = String(u || "").trim();
      if (!s) return "";
      try {
        const abs = new URL(s, location.origin);
        if (abs.origin === location.origin) return abs.pathname + abs.search + abs.hash;
        return abs.href;
      } catch {
        return s;
      }
    }

    async function copyTextToClipboard(text) {
      const t = String(text || "").trim();
      if (!t) return false;

      try {
        await navigator.clipboard.writeText(t);
        return true;
      } catch {
        try {
          const ta = document.createElement("textarea");
          ta.value = t;
          ta.style.position = "fixed";
          ta.style.left = "-9999px";
          ta.style.top = "0";
          document.body.appendChild(ta);
          ta.focus();
          ta.select();
          const ok = document.execCommand("copy");
          document.body.removeChild(ta);
          return !!ok;
        } catch {
          return false;
        }
      }
    }

    function addCtas(wrapper, ctas) {
      if (!Array.isArray(ctas) || !ctas.length) return;
      const row = document.createElement("div");
      row.className = "proofy-ctas";

      ctas.slice(0, 3).forEach((c) => {
        if (!c?.label) return;

        if (c.action === "prompt" && c.prompt) {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "proofy-cta";
          b.textContent = c.label;
          b.onclick = () => {
            input.value = String(c.prompt || "");
            input.focus();
          };
          row.appendChild(b);
          return;
        }

        if (c.url) {
          const a = document.createElement("a");
          a.className = "proofy-cta";
          a.href = normalizeUrl(c.url);
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          a.textContent = c.label;
          row.appendChild(a);
        }
      });

      if (row.childElementCount) wrapper.appendChild(row);
    }

    function stripKnownLinks(text) {
      let t = String(text || "");
      t = t.replace(/https?:\/\/[^\s)]+\/(register\.html|verify\.html|index\.html)(\?[^\s)]*)?/gi, "");
      t = t.replace(/\/(register\.html|verify\.html|index\.html)(\?[^\s)]*)?/gi, "");
      t = t.replace(/\n{3,}/g, "\n\n").trim();
      return t || "—";
    }

    function extractCopyableNote(text) {
      const t = String(text || "").trim();
      if (!t) return null;
      if (!/^PROOFY\s*–\s*Verifieringsnotering/i.test(t)) return null;
      return t;
    }

    async function send(text) {
      const trimmed = (text || "").trim();
      if (!trimmed) return;

      addMessage("user", trimmed);
      chatHistory.push({ role: "user", content: trimmed });
      input.value = "";

      const loading = addMessage("assistant", "…");

      sendBtn.disabled = true;
      input.disabled = true;

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: chatHistory }),
        });

        const rawText = await res.text();
        let data = null;
        try { data = JSON.parse(rawText); } catch {}

        const rawAnswer =
          (data && typeof data.answer === "string" && data.answer.trim())
            ? data.answer.trim()
            : `Kunde inte läsa svaret. Status ${res.status}. Mejla kontakt@proofy.se.`;

        const answer = stripKnownLinks(rawAnswer);
        loading.querySelector(".proofy-bubble").textContent = answer;

        const baseCtas = Array.isArray(data?.ctas) ? data.ctas : [];
        addCtas(loading, baseCtas);

        const maybeNote = extractCopyableNote(answer);
        if (maybeNote) {
          const row = document.createElement("div");
          row.className = "proofy-ctas";
          const b = document.createElement("button");
          b.type = "button";
          b.className = "proofy-cta";
          b.textContent = "Kopiera notering";
          b.onclick = async () => {
            const ok = await copyTextToClipboard(maybeNote);
            b.textContent = ok ? "Kopierad ✓" : "Kunde inte kopiera";
            setTimeout(() => { b.textContent = "Kopiera notering"; }, 1400);
          };
          row.appendChild(b);
          loading.appendChild(row);
        }

        chatHistory.push({ role: "assistant", content: answer });
      } catch {
        loading.querySelector(".proofy-bubble").textContent =
          "Tekniskt fel just nu. Mejla kontakt@proofy.se så hjälper vi dig.";
      } finally {
        sendBtn.disabled = false;
        input.disabled = false;
        scheduleAvoidOverlap();
        if (isOpen) input.focus();
      }
    }

    sendBtn.onclick = () => send(input.value);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send(input.value);
      }
    });

    const hello = addMessage(
      "assistant",
      "Hej! Välj ett alternativ, eller skriv kort vad du vill göra i ärendet."
    );

    addCtas(hello, [
      { label: "Skapa Verifierings-ID", url: "/register.html" },
      { label: "Verifiera underlag", url: "/verify.html" },
      {
        label: "Skapa verifieringsnotering",
        action: "prompt",
        prompt:
          "Skapa en klistra-in-notering för revisionsfilen.\n" +
          "Krav: börja med rubriken 'PROOFY – Verifieringsnotering'. Neutral byråton. Max 10 rader.\n" +
          "Fyll i med platshållare om fakta saknas:\n" +
          "- Verifierings-ID: [Verifierings-ID]\n" +
          "- Underlag/filnamn: [filnamn]\n" +
          "- Resultat: [Oförändrat underlag / Avvikelse]\n" +
          "- Registreringsstatus: [Registrerad / Ej registrerad / Okänt]\n" +
          "- Registreringstid (om känd): [datum/tid]\n" +
          "- Verifiering genomförd: [datum/tid]\n" +
          "Avsluta med avgränsning: Proofy avser filversion (tekniskt fingeravtryck), inte innehållets riktighet.",
      },
    ]);

    // Initial overlap pass after layout is stable
    setTimeout(scheduleAvoidOverlap, 0);
    setTimeout(scheduleAvoidOverlap, 300);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
