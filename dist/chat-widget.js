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

        /* IMPORTANT:
           Do NOT define/override --proofy-fab-space here.
           Pages own it (single source of truth in /assets/proofy.css).
        */
      }

      /* IMPORTANT:
         Do NOT add body padding here. Pages reserve space via --proofy-fab-space in CSS (e.g. main padding).
         This avoids double/triple spacing and print side-effects. */
      body.__proofy-has-chat{
        padding-bottom: env(safe-area-inset-bottom) !important;
      }

      /* We compute bottom offset dynamically in JS to avoid covering sticky action bars. */
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
        will-change: auto; /* avoid jitter from transforms */
      }
      .proofy-chat-btn:active{ transform: translateY(1px); }

      /* Optional scrim to make overlay intent clear (reduces accidental double-actions) */
      .proofy-scrim{
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,.28);
        z-index: 2147483000;
        display: none;
      }

      .proofy-panel{
        position:fixed;
        right: var(--proofy-safe-right);
        bottom: calc(var(--proofy-safe-bottom) + 66px);
        z-index: 2147483001;
        width: min(380px, calc(100vw - 32px));
        height: min(560px, calc(100vh - 140px));
        background: rgba(10,16,32,.96);
        border: 1px solid rgba(255,255,255,.10);
        border-radius: 18px;
        overflow: hidden;
        box-shadow: 0 20px 60px rgba(0,0,0,.45);
        display: none;
        font-family: system-ui;
        color: #eaf1ff;
      }

      /* HARDTEST: no blur/backdrop-filter (prevents flicker / inconsistent rendering) */

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
        .proofy-chat-btn, .proofy-panel, .proofy-scrim{ display:none !important; }
        body.__proofy-has-chat{ padding-bottom: 0 !important; }
      }
      `;
      document.head.appendChild(style);
    }

    // Mark body (no layout side-effects beyond safe-area)
    document.body.classList.add("__proofy-has-chat");

    // Create scrim once
    let scrim = document.querySelector(".proofy-scrim");
    if (!scrim) {
      scrim = document.createElement("div");
      scrim.className = "proofy-scrim";
      scrim.setAttribute("aria-hidden", "true");
      document.body.appendChild(scrim);
    }

    // Create button once
    let button = document.querySelector(".proofy-chat-btn");
    if (!button) {
      button = document.createElement("button");
      button.className = "proofy-chat-btn";
      button.type = "button";
      button.innerText = "Fråga oss";
      button.setAttribute("aria-label", "Öppna support");
      document.body.appendChild(button);
    }

    // Create panel once
    let panel = document.querySelector(".proofy-panel");
    if (!panel) {
      panel = document.createElement("div");
      panel.className = "proofy-panel";
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-label", "Support");
      panel.innerHTML = `
      <div class="proofy-header">
        <div class="proofy-title"><span class="proofy-dot"></span>Support</div>
        <button class="proofy-x" aria-label="Stäng" type="button">✕</button>
      </div>
      <div class="proofy-body"><div id="proofy-messages"></div></div>
      <div class="proofy-footer">
        <input class="proofy-input" placeholder="Skriv en fråga…" />
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

    // === HARDTEST: Never cover audit-critical action bars ===
    // If a sticky action bar exists (e.g. #stickyBar), move the chat button/panel upward.
    // Works even if sticky is created by other pages.
    const stickySelectors = ["#stickyBar", ".proofySticky"];
    let lastOffsetPx = 0;

    function isElementVisible(el) {
      if (!el) return false;
      const cs = window.getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }

    function getStickyOffsetPx() {
      // Minimum “lift” so button clears common sticky bar heights.
      // If sticky is visible, add its height + small gap.
      try {
        for (const sel of stickySelectors) {
          const el = document.querySelector(sel);
          if (el && isElementVisible(el)) {
            const r = el.getBoundingClientRect();
            const h = Math.max(0, Math.min(r.height, 120));
            return Math.ceil(h + 12);
          }
        }
      } catch {}
      return 0;
    }

    function applyBottomOffset(px) {
      const safe = "var(--proofy-safe-bottom)";
      const off = Math.max(0, Number(px || 0));
      button.style.bottom = off ? `calc(${safe} + ${off}px)` : safe;
      panel.style.bottom = off ? `calc(${safe} + ${off}px + 66px)` : `calc(${safe} + 66px)`;
    }

    function syncOffsets() {
      const px = getStickyOffsetPx();
      if (px !== lastOffsetPx) {
        lastOffsetPx = px;
        applyBottomOffset(px);
      }
    }

    // Observe layout changes: scroll/resize + a light MutationObserver
    const onTick = () => syncOffsets();
    window.addEventListener("resize", onTick, { passive: true });
    window.addEventListener("scroll", onTick, { passive: true });

    try {
      const mo = new MutationObserver(() => syncOffsets());
      mo.observe(document.documentElement, { attributes: true, childList: true, subtree: true });
    } catch {}

    // Initial sync
    syncOffsets();

    function toggle(open) {
      isOpen = open ?? !isOpen;
      panel.style.display = isOpen ? "block" : "none";
      scrim.style.display = isOpen ? "block" : "none";

      // Re-sync in case opening overlaps something (e.g., sticky appears on state change)
      syncOffsets();

      if (isOpen) input.focus();
      else button.focus();
    }

    button.onclick = () => toggle(true);
    closeBtn.onclick = () => toggle(false);
    scrim.onclick = () => toggle(false);

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

      // Acceptera både äldre och nyare rubriker
      const ok =
        /^PROOFY\s*–\s*Notering/i.test(t) ||
        /^PROOFY\s*–\s*Verifieringsnotering/i.test(t);

      if (!ok) return null;
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
        const bubble = loading.querySelector(".proofy-bubble");
        if (bubble) bubble.textContent = answer;

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
        const bubble = loading.querySelector(".proofy-bubble");
        if (bubble) {
          bubble.textContent = "Tillfälligt fel. Mejla kontakt@proofy.se så hjälper vi dig.";
        }
      } finally {
        sendBtn.disabled = false;
        input.disabled = false;
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

    // Första meddelandet: sakligt och granskningsnära
    const hello = addMessage(
      "assistant",
      "Hej! Beskriv kort vad du behöver i ärendet, eller välj ett alternativ."
    );

    addCtas(hello, [
      { label: "Fastställ referens", url: "/register.html" },
      { label: "Verifiera underlag", url: "/verify.html" },
      {
        label: "Skapa notering för ärendeakt",
        action: "prompt",
        prompt:
          "Skapa en klistra-in-notering för ärendeakten.\n" +
          "Krav: börja med rubriken 'PROOFY – Notering (ärendeakt/granskningsunderlag)'. Neutral byråton. Max 10 rader.\n" +
          "Fyll i med platshållare om fakta saknas:\n" +
          "- Kontrollkod: [kontrollkod]\n" +
          "- Referensunderlag/filnamn: [filnamn]\n" +
          "- Kontrolltid: [datum/tid]\n" +
          "- Status vid kontrolltillfället: [Bekräftad / Ej bekräftad / Kunde inte kontrolleras]\n" +
          "- Verifieringslänk: [länk]\n" +
          "Avsluta med avgränsning: Kontrollen avser filversion och status vid kontrolltillfället; inte dokumentets innehåll, riktighet eller giltighet.",
      },
    ]);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
