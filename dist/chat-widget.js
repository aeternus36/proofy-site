/* proofy-chat-widget.js
   Audit-safe, mobile-safe, single-init chat widget
*/
(() => {
  function init() {
    if (window.__proofyChatWidgetInit) return;
    window.__proofyChatWidgetInit = true;

    // Mark document so pages can reserve space
    document.documentElement.classList.add("has-proofy-chat");

    const chatHistory = [];
    let isOpen = false;

    /* =========================
       Inject CSS (once)
       ========================= */
    if (!document.getElementById("proofy-chat-style")) {
      const style = document.createElement("style");
      style.id = "proofy-chat-style";
      style.textContent = `
:root{
  --proofy-chat-safe: calc(110px + env(safe-area-inset-bottom, 0px));
}

/* Reserve space so content is never covered */
html.has-proofy-chat body{
  padding-bottom: var(--proofy-chat-safe);
}

/* Chat launcher button */
.proofy-chat-btn{
  position:fixed;
  bottom: calc(20px + env(safe-area-inset-bottom, 0px));
  right:20px;
  z-index:9999;
  padding:12px 16px;
  border-radius:999px;
  border:none;
  cursor:pointer;
  background:linear-gradient(135deg,#6ee7b7,#3b82f6);
  color:#0b1020;
  font-weight:800;
  box-shadow:0 10px 30px rgba(0,0,0,.25);
}

/* Chat panel */
.proofy-panel{
  position:fixed;
  bottom: calc(86px + env(safe-area-inset-bottom, 0px));
  right:20px;
  z-index:9999;
  width:min(380px, calc(100vw - 40px));
  height:min(560px, calc(100vh - 140px));
  background:rgba(10,16,32,.94);
  border:1px solid rgba(255,255,255,.10);
  border-radius:18px;
  overflow:hidden;
  box-shadow:0 20px 60px rgba(0,0,0,.45);
  backdrop-filter: blur(10px);
  display:none;
  font-family:system-ui;
  color:#eaf1ff;
}

/* Header */
.proofy-header{
  display:flex;
  align-items:center;
  justify-content:space-between;
  padding:12px;
  border-bottom:1px solid rgba(255,255,255,.08);
  background:rgba(255,255,255,.03);
}
.proofy-title{
  font-weight:900;
  font-size:14px;
  display:flex;
  gap:10px;
  align-items:center;
}
.proofy-dot{
  width:10px;
  height:10px;
  border-radius:999px;
  background:linear-gradient(135deg,#6ee7b7,#3b82f6);
  box-shadow:0 0 0 3px rgba(110,231,183,.12);
}
.proofy-x{
  width:34px;
  height:34px;
  border-radius:12px;
  border:1px solid rgba(255,255,255,.10);
  background:rgba(255,255,255,.04);
  color:#eaf1ff;
  cursor:pointer;
}

/* Body */
.proofy-body{
  padding:12px;
  height:calc(100% - 56px - 64px);
  overflow:auto;
}
.proofy-msg{
  margin:10px 0;
  display:flex;
  flex-direction:column;
  gap:8px;
}
.proofy-msg.user{ align-items:flex-end; }
.proofy-msg.assistant{ align-items:flex-start; }

.proofy-bubble{
  max-width:85%;
  padding:10px 12px;
  border-radius:14px;
  border:1px solid rgba(255,255,255,.10);
  background:rgba(255,255,255,.04);
  line-height:1.35;
  font-size:13px;
  white-space:pre-wrap;
}
.proofy-msg.user .proofy-bubble{
  background:rgba(59,130,246,.20);
  border-color:rgba(59,130,246,.25);
}

/* CTAs */
.proofy-ctas{
  display:flex;
  gap:8px;
  flex-wrap:wrap;
  max-width:85%;
}
.proofy-cta{
  display:inline-flex;
  align-items:center;
  padding:9px 12px;
  border-radius:999px;
  border:1px solid rgba(255,255,255,.14);
  background:rgba(255,255,255,.06);
  color:#eaf1ff;
  text-decoration:none;
  font-weight:900;
  font-size:12px;
  cursor:pointer;
}
.proofy-cta:hover{ background:rgba(255,255,255,.10); }

/* Footer */
.proofy-footer{
  display:flex;
  gap:8px;
  padding:10px;
  border-top:1px solid rgba(255,255,255,.08);
  background:rgba(255,255,255,.02);
}
.proofy-input{
  flex:1;
  padding:10px 12px;
  border-radius:12px;
  border:1px solid rgba(255,255,255,.12);
  background:rgba(0,0,0,.20);
  color:#eaf1ff;
  outline:none;
}
.proofy-send{
  padding:10px 14px;
  border-radius:12px;
  border:none;
  cursor:pointer;
  background:linear-gradient(135deg,#6ee7b7,#3b82f6);
  color:#0b1020;
  font-weight:900;
}

/* Small screens */
@media (max-width:420px){
  .proofy-chat-btn{ right:12px; }
  .proofy-panel{ right:12px; }
}
      `;
      document.head.appendChild(style);
    }

    /* =========================
       Create button & panel
       ========================= */
    let button = document.querySelector(".proofy-chat-btn");
    if (!button) {
      button = document.createElement("button");
      button.className = "proofy-chat-btn";
      button.textContent = "Fråga oss";
      document.body.appendChild(button);
    }

    let panel = document.querySelector(".proofy-panel");
    if (!panel) {
      panel = document.createElement("div");
      panel.className = "proofy-panel";
      panel.innerHTML = `
        <div class="proofy-header">
          <div class="proofy-title"><span class="proofy-dot"></span>Proofy Assist</div>
          <button class="proofy-x" aria-label="Stäng">✕</button>
        </div>
        <div class="proofy-body"><div id="proofy-messages"></div></div>
        <div class="proofy-footer">
          <input class="proofy-input" placeholder="Skriv en fråga…" />
          <button class="proofy-send">Skicka</button>
        </div>
      `;
      document.body.appendChild(panel);
    }

    const msgRoot = panel.querySelector("#proofy-messages");
    const input = panel.querySelector(".proofy-input");
    const sendBtn = panel.querySelector(".proofy-send");
    const closeBtn = panel.querySelector(".proofy-x");

    if (!msgRoot || !input || !sendBtn || !closeBtn) return;

    function toggle(open) {
      isOpen = open ?? !isOpen;
      panel.style.display = isOpen ? "block" : "none";
      if (isOpen) input.focus();
    }

    button.onclick = () => toggle(true);
    closeBtn.onclick = () => toggle(false);
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && isOpen) toggle(false);
    });

    function addMessage(role, text) {
      const w = document.createElement("div");
      w.className = `proofy-msg ${role}`;
      const b = document.createElement("div");
      b.className = "proofy-bubble";
      b.textContent = text || "";
      w.appendChild(b);
      msgRoot.appendChild(w);
      panel.querySelector(".proofy-body").scrollTop =
        panel.querySelector(".proofy-body").scrollHeight;
      return w;
    }

    async function send(text) {
      const t = String(text || "").trim();
      if (!t) return;

      addMessage("user", t);
      chatHistory.push({ role: "user", content: t });
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
        const data = await res.json().catch(() => null);
        const answer =
          data?.answer?.trim() ||
          "Tekniskt fel. Mejla kontakt@proofy.se.";

        loading.querySelector(".proofy-bubble").textContent = answer;
        chatHistory.push({ role: "assistant", content: answer });
      } catch {
        loading.querySelector(".proofy-bubble").textContent =
          "Tekniskt fel. Mejla kontakt@proofy.se.";
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

    /* Initial message */
    addMessage(
      "assistant",
      "Hej! Välj ett alternativ eller skriv kort vad du behöver hjälp med."
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
