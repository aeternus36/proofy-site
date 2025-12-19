/* Proofy chat widget – standalone loader
   Safe mode:
   - Does nothing if DOM isn't ready or if it can't attach
   - Never writes raw script text into the page
*/
(() => {
  try {
    // Guard: ensure we are running as JS in a browser
    if (typeof window === "undefined" || typeof document === "undefined") return;

    const CONFIG = {
      endpoint: "/.netlify/functions/chat",
      buttonText: "Fråga oss",
      title: "Proofy Assist",
      intro: "Hej. Skriv vad du vill verifiera, så föreslår jag ett bra upplägg.",
      quick: [
        { label: "Boka demo", q: "Jag vill boka en demo. Hur går det till?" },
        { label: "Starta pilot", q: "Jag vill starta en pilot. Vad är nästa steg?" },
        { label: "Säkerhet", q: "Hur jobbar ni med säkerhet och GDPR när ni inte lagrar dokumentinnehåll?" },
      ],
      maxCtas: 3,
    };

    function onReady(fn) {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", fn, { once: true });
      } else {
        fn();
      }
    }

    function escapeHtml(str) {
      return String(str ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
    }

    function linkify(text) {
      const escaped = escapeHtml(text);
      // Support http(s) links and relative "/path" links
      return escaped.replace(/(\bhttps?:\/\/[^\s]+|\B\/[^\s]+)/g, (m) => {
        const url = m;
        const safe = escapeHtml(url);
        return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${safe}</a>`;
      });
    }

    function safeJsonParse(str) {
      try { return JSON.parse(str); } catch { return null; }
    }

    onReady(() => {
      // Guard: if body is missing, bail
      if (!document.body) return;

      // Avoid duplicate init
      if (window.__proofyChatWidgetInit) return;
      window.__proofyChatWidgetInit = true;

      const chatHistory = [];
      let isOpen = false;

      // Styles
      const style = document.createElement("style");
      style.textContent = `
        .proofy-chat-btn{
          position:fixed;bottom:20px;right:20px;z-index:99999;
          padding:12px 16px;border-radius:999px;border:none;cursor:pointer;
          background:linear-gradient(135deg,#6ee7b7,#3b82f6);
          color:#0b1020;font-weight:800;box-shadow:0 10px 30px rgba(0,0,0,.25);
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
        }
        .proofy-panel{
          position:fixed;bottom:86px;right:20px;z-index:99999;
          width:min(380px, calc(100vw - 40px));
          height:min(560px, calc(100vh - 140px));
          background:rgba(10,16,32,.92);
          border:1px solid rgba(255,255,255,.10);
          border-radius:18px;overflow:hidden;
          box-shadow:0 20px 60px rgba(0,0,0,.45);
          backdrop-filter: blur(10px);
          display:none;
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
          color:#eaf1ff;
        }
        .proofy-header{
          display:flex;align-items:center;justify-content:space-between;
          padding:12px 12px;border-bottom:1px solid rgba(255,255,255,.08);
          background:rgba(255,255,255,.03);
        }
        .proofy-title{
          font-weight:900;letter-spacing:.2px;font-size:14px;
          display:flex;gap:10px;align-items:center;
        }
        .proofy-dot{
          width:10px;height:10px;border-radius:999px;background:linear-gradient(135deg,#6ee7b7,#3b82f6);
          box-shadow:0 0 0 3px rgba(110,231,183,.12);
        }
        .proofy-x{
          width:34px;height:34px;border-radius:12px;border:1px solid rgba(255,255,255,.10);
          background:rgba(255,255,255,.04);color:#eaf1ff;cursor:pointer;
          font-weight:900;
        }
        .proofy-body{
          padding:12px;height:calc(100% - 56px - 64px);overflow:auto;
        }
        .proofy-quick{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;}
        .proofy-qbtn{
          padding:8px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.12);
          background:rgba(255,255,255,.04);color:#eaf1ff;cursor:pointer;font-weight:800;font-size:12px;
        }
        .proofy-msg{margin:10px 0;display:flex;flex-direction:column;gap:8px;}
        .proofy-msg.user{align-items:flex-end;}
        .proofy-msg.assistant{align-items:flex-start;}
        .proofy-bubble{
          max-width:85%;
          padding:10px 12px;border-radius:14px;
          border:1px solid rgba(255,255,255,.10);
          background:rgba(255,255,255,.04);
          line-height:1.35;font-size:13px;
          white-space:pre-wrap;
        }
        .proofy-msg.user .proofy-bubble{
          background:rgba(59,130,246,.20);
          border-color:rgba(59,130,246,.25);
        }
        .proofy-bubble a{color:#93c5fd;text-decoration:underline;}
        .proofy-footer{
          display:flex;gap:8px;padding:10px;border-top:1px solid rgba(255,255,255,.08);
          background:rgba(255,255,255,.02);
        }
        .proofy-input{
          flex:1;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.12);
          background:rgba(0,0,0,.20);color:#eaf1ff;outline:none;
        }
        .proofy-send{
          padding:10px 14px;border-radius:12px;border:none;cursor:pointer;
          background:linear-gradient(135deg,#6ee7b7,#3b82f6);
          color:#0b1020;font-weight:900;
        }
        .proofy-hint{margin-top:8px;font-size:11px;opacity:.75;}
        .proofy-ctas{display:flex;gap:8px;flex-wrap:wrap;max-width:85%;}
        .proofy-cta{
          display:inline-flex;align-items:center;
          padding:9px 12px;border-radius:999px;
          border:1px solid rgba(255,255,255,.14);
          background:rgba(255,255,255,.06);
          color:#eaf1ff;text-decoration:none;font-weight:900;font-size:12px;
          cursor:pointer;
        }
        .proofy-cta:hover{background:rgba(255,255,255,.10);}
      `;
      document.head.appendChild(style);

      // Button
      const button = document.createElement("button");
      button.className = "proofy-chat-btn";
      button.type = "button";
      button.innerText = CONFIG.buttonText;
      document.body.appendChild(button);

      // Panel
      const panel = document.createElement("div");
      panel.className = "proofy-panel";
      panel.innerHTML = `
        <div class="proofy-header">
          <div class="proofy-title"><span class="proofy-dot"></span>${escapeHtml(CONFIG.title)}</div>
          <button class="proofy-x" type="button" aria-label="Stäng">✕</button>
        </div>
        <div class="proofy-body">
          <div class="proofy-quick">
            ${CONFIG.quick.map(q => `<button class="proofy-qbtn" type="button" data-q="${escapeHtml(q.q)}">${escapeHtml(q.label)}</button>`).join("")}
          </div>
          <div id="proofy-messages"></div>
          <div class="proofy-hint">Exempel: “Hur fungerar verifierings-ID?”, “Kan PDF re-export ge ingen match?”</div>
        </div>
        <div class="proofy-footer">
          <input class="proofy-input" placeholder="Skriv en fråga..." />
          <button class="proofy-send" type="button">Skicka</button>
        </div>
      `;
      document.body.appendChild(panel);

      const msgRoot = panel.querySelector("#proofy-messages");
      const input = panel.querySelector(".proofy-input");
      const sendBtn = panel.querySelector(".proofy-send");
      const closeBtn = panel.querySelector(".proofy-x");

      function scrollToBottom() {
        const body = panel.querySelector(".proofy-body");
        body.scrollTop = body.scrollHeight;
      }

      function addMessage(role, text) {
        const wrapper = document.createElement("div");
        wrapper.className = `proofy-msg ${role}`;
        const bubble = document.createElement("div");
        bubble.className = "proofy-bubble";
        bubble.innerHTML = linkify(text);
        wrapper.appendChild(bubble);
        msgRoot.appendChild(wrapper);
        scrollToBottom();
        return wrapper;
      }

      function addCtas(parentWrapper, ctas) {
        if (!Array.isArray(ctas) || ctas.length === 0) return;
        const row = document.createElement("div");
        row.className = "proofy-ctas";

        ctas.slice(0, CONFIG.maxCtas).forEach((c) => {
          if (!c || !c.label || !c.url) return;
          const a = document.createElement("a");
          a.className = "proofy-cta";
          a.href = c.url;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          a.textContent = String(c.label);
          row.appendChild(a);
        });

        if (row.childElementCount > 0) {
          parentWrapper.appendChild(row);
          scrollToBottom();
        }
      }

      function toggle(open) {
        isOpen = open ?? !isOpen;
        panel.style.display = isOpen ? "block" : "none";
        if (isOpen) input.focus();
      }

      button.addEventListener("click", () => toggle(true));
      closeBtn.addEventListener("click", () => toggle(false));

      async function send(text) {
        const trimmed = String(text || "").trim();
        if (!trimmed) return;

        addMessage("user", trimmed);
        chatHistory.push({ role: "user", content: trimmed });

        input.value = "";
        input.focus();

        try {
          const res = await fetch(CONFIG.endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: chatHistory }),
          });

          const raw = await res.text();
          const data = safeJsonParse(raw) || {};
          const answer =
            data.answer ||
            data.reply ||
            "Jag fick inget svar. Testa igen eller mejla kontakt@proofy.se.";

          const ctas = data.ctas || null;
          const leadQ = data?.lead?.question || null;

          chatHistory.push({ role: "assistant", content: answer });

          const wrapper = addMessage("assistant", answer);
          if (ctas) addCtas(wrapper, ctas);

          if (leadQ) {
            const follow = `\n\n${leadQ}`;
            chatHistory.push({ role: "assistant", content: follow });
            addMessage("assistant", follow);
          }
        } catch (e) {
          addMessage("assistant", "Det blev ett tekniskt fel. Försök igen, eller mejla kontakt@proofy.se.");
        }
      }

      sendBtn.addEventListener("click", () => send(input.value));
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") send(input.value);
      });

      panel.querySelectorAll(".proofy-qbtn").forEach((b) => {
        b.addEventListener("click", () => send(b.getAttribute("data-q")));
      });

      // Intro
      addMessage("assistant", CONFIG.intro);
      chatHistory.push({ role: "assistant", content: CONFIG.intro });
    });

  } catch (e) {
    // Fail silently (important so widget never breaks the page)
    console.warn("Proofy chat widget failed to init:", e);
  }
})();
