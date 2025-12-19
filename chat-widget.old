(() => {
  function init() {
    const chatHistory = [];
    let isOpen = false;

    const style = document.createElement("style");
    style.textContent = `
      .proofy-chat-btn{position:fixed;bottom:20px;right:20px;z-index:9999;padding:12px 16px;border-radius:999px;border:none;cursor:pointer;background:linear-gradient(135deg,#6ee7b7,#3b82f6);color:#0b1020;font-weight:800;box-shadow:0 10px 30px rgba(0,0,0,.25);}
      .proofy-panel{position:fixed;bottom:86px;right:20px;z-index:9999;width:min(380px, calc(100vw - 40px));height:min(560px, calc(100vh - 140px));background:rgba(10,16,32,.92);border:1px solid rgba(255,255,255,.10);border-radius:18px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.45);backdrop-filter: blur(10px);display:none;font-family:system-ui;color:#eaf1ff;}
      .proofy-header{display:flex;align-items:center;justify-content:space-between;padding:12px;border-bottom:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);}
      .proofy-title{font-weight:900;font-size:14px;display:flex;gap:10px;align-items:center;}
      .proofy-dot{width:10px;height:10px;border-radius:999px;background:linear-gradient(135deg,#6ee7b7,#3b82f6);box-shadow:0 0 0 3px rgba(110,231,183,.12);}
      .proofy-x{width:34px;height:34px;border-radius:12px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.04);color:#eaf1ff;cursor:pointer;}
      .proofy-body{padding:12px;height:calc(100% - 56px - 64px);overflow:auto;}
      .proofy-msg{margin:10px 0;display:flex;flex-direction:column;gap:8px;}
      .proofy-msg.user{align-items:flex-end;}
      .proofy-msg.assistant{align-items:flex-start;}
      .proofy-bubble{max-width:85%;padding:10px 12px;border-radius:14px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.04);line-height:1.35;font-size:13px;white-space:pre-wrap;}
      .proofy-msg.user .proofy-bubble{background:rgba(59,130,246,.20);border-color:rgba(59,130,246,.25);}
      .proofy-ctas{display:flex;gap:8px;flex-wrap:wrap;max-width:85%;}
      .proofy-cta{display:inline-flex;align-items:center;padding:9px 12px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#eaf1ff;text-decoration:none;font-weight:900;font-size:12px;}
      .proofy-cta:hover{background:rgba(255,255,255,.10);}
      .proofy-footer{display:flex;gap:8px;padding:10px;border-top:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.02);}
      .proofy-input{flex:1;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.20);color:#eaf1ff;outline:none;}
      .proofy-send{padding:10px 14px;border-radius:12px;border:none;cursor:pointer;background:linear-gradient(135deg,#6ee7b7,#3b82f6);color:#0b1020;font-weight:900;}
    `;
    document.head.appendChild(style);

    const button = document.createElement("button");
    button.className = "proofy-chat-btn";
    button.innerText = "Fråga oss";
    document.body.appendChild(button);

    const panel = document.createElement("div");
    panel.className = "proofy-panel";
    panel.innerHTML = `
      <div class="proofy-header">
        <div class="proofy-title"><span class="proofy-dot"></span>Proofy Assist</div>
        <button class="proofy-x" aria-label="Stäng">✕</button>
      </div>
      <div class="proofy-body"><div id="proofy-messages"></div></div>
      <div class="proofy-footer">
        <input class="proofy-input" placeholder="Skriv en fråga..." />
        <button class="proofy-send">Skicka</button>
      </div>
    `;
    document.body.appendChild(panel);

    const msgRoot = panel.querySelector("#proofy-messages");
    const input = panel.querySelector(".proofy-input");
    const sendBtn = panel.querySelector(".proofy-send");
    const closeBtn = panel.querySelector(".proofy-x");

    function toggle(open) {
      isOpen = open ?? !isOpen;
      panel.style.display = isOpen ? "block" : "none";
      if (isOpen) input.focus();
    }
    button.onclick = () => toggle(true);
    closeBtn.onclick = () => toggle(false);

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

    function addCtas(wrapper, ctas) {
      if (!Array.isArray(ctas) || !ctas.length) return;
      const row = document.createElement("div");
      row.className = "proofy-ctas";
      ctas.slice(0, 3).forEach((c) => {
        if (!c?.label || !c?.url) return;
        const a = document.createElement("a");
        a.className = "proofy-cta";
        a.href = c.url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = c.label;
        row.appendChild(a);
      });
      if (row.childElementCount) wrapper.appendChild(row);
    }

    async function send(text) {
      const trimmed = (text || "").trim();
      if (!trimmed) return;

      addMessage("user", trimmed);
      chatHistory.push({ role: "user", content: trimmed });
      input.value = "";

      const loading = addMessage("assistant", "…");

      try {
        const res = await fetch("/.netlify/functions/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: chatHistory }),
        });

        const rawText = await res.text();
        let data = null;
        try { data = JSON.parse(rawText); } catch {}

        const answer =
          (data && typeof data.answer === "string" && data.answer.trim())
            ? data.answer.trim()
            : `Kunde inte läsa svaret. Status ${res.status}. Mejla kontakt@proofy.se.`;

        loading.querySelector(".proofy-bubble").textContent = answer;
        addCtas(loading, data?.ctas);

        chatHistory.push({ role: "assistant", content: answer });
      } catch (e) {
        loading.querySelector(".proofy-bubble").textContent =
          "Tekniskt fel just nu. Mejla kontakt@proofy.se så hjälper vi dig.";
      }
    }

    sendBtn.onclick = () => send(input.value);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") send(input.value);
    });

    addMessage("assistant", "Hej. Vad vill du verifiera (revision, bokslut, tvist eller spårbarhet)?");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
