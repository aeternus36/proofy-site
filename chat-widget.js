(() => {
  const chatHistory = [];
  let isOpen = false;

  // ---------- Styles ----------
  const style = document.createElement("style");
  style.textContent = `
    .proofy-chat-btn{
      position:fixed;bottom:20px;right:20px;z-index:9999;
      padding:12px 16px;border-radius:999px;border:none;cursor:pointer;
      background:linear-gradient(135deg,#6ee7b7,#3b82f6);
      color:#0b1020;font-weight:700;box-shadow:0 10px 30px rgba(0,0,0,.25);
    }
    .proofy-panel{
      position:fixed;bottom:86px;right:20px;z-index:9999;
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
      font-weight:800;letter-spacing:.2px;font-size:14px;
      display:flex;gap:10px;align-items:center;
    }
    .proofy-dot{
      width:10px;height:10px;border-radius:999px;background:linear-gradient(135deg,#6ee7b7,#3b82f6);
      box-shadow:0 0 0 3px rgba(110,231,183,.12);
    }
    .proofy-actions{display:flex;gap:8px;align-items:center;}
    .proofy-x{
      width:34px;height:34px;border-radius:12px;border:1px solid rgba(255,255,255,.10);
      background:rgba(255,255,255,.04);color:#eaf1ff;cursor:pointer;
    }
    .proofy-body{
      padding:12px;height:calc(100% - 56px - 64px);overflow:auto;
    }
    .proofy-quick{
      display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;
    }
    .proofy-qbtn{
      padding:8px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.12);
      background:rgba(255,255,255,.04);color:#eaf1ff;cursor:pointer;font-weight:700;font-size:12px;
    }
    .proofy-msg{margin:10px 0;display:flex;}
    .proofy-msg.user{justify-content:flex-end;}
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
    .proofy-hint{
      margin-top:8px;font-size:11px;opacity:.75;
    }
  `;
  document.head.appendChild(style);

  // ---------- Button ----------
  const button = document.createElement("button");
  button.className = "proofy-chat-btn";
  button.innerText = "Fråga oss";
  document.body.appendChild(button);

  // ---------- Panel ----------
  const panel = document.createElement("div");
  panel.className = "proofy-panel";
  panel.innerHTML = `
    <div class="proofy-header">
      <div class="proofy-title"><span class="proofy-dot"></span>Proofy Assist</div>
      <div class="proofy-actions">
        <button class="proofy-x" aria-label="Stäng">✕</button>
      </div>
    </div>
    <div class="proofy-body">
      <div class="proofy-quick">
        <button class="proofy-qbtn" data-q="Jag vill boka en demo. Hur går det till?">Boka demo</button>
        <button class="proofy-qbtn" data-q="Jag vill starta en pilot. Vad är nästa steg?">Starta pilot</button>
        <button class="proofy-qbtn" data-q="Är Proofy säkert och hur hanterar ni integritet/GDPR?">Säkerhet</button>
      </div>
      <div id="proofy-messages"></div>
      <div class="proofy-hint">Tips: Skriv t.ex. “Hur funkar verifierings-ID?” eller “När är Proofy relevant?”</div>
    </div>
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

  // ---------- Helpers ----------
  function escapeHtml(str) {
    return str
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  // Gör /#kontakt, /pilot.html etc klickbara
  function linkify(text) {
    const escaped = escapeHtml(text);
    // länkar som börjar med / eller https
    const withLinks = escaped.replace(
      /(\bhttps?:\/\/[^\s]+|\B\/[^\s]+)/g,
      (m) => `<a href="${m}" target="_blank" rel="noopener noreferrer">${m}</a>`
    );
    return withLinks;
  }

  function addMessage(role, text) {
    const wrapper = document.createElement("div");
    wrapper.className = `proofy-msg ${role}`;
    const bubble = document.createElement("div");
    bubble.className = "proofy-bubble";
    bubble.innerHTML = linkify(text);
    wrapper.appendChild(bubble);
    msgRoot.appendChild(wrapper);
    panel.querySelector(".proofy-body").scrollTop = panel.querySelector(".proofy-body").scrollHeight;
  }

  async function send(text) {
    const trimmed = (text || "").trim();
    if (!trimmed) return;

    addMessage("user", trimmed);
    chatHistory.push({ role: "user", content: trimmed });
    input.value = "";
    input.focus();

    try {
      const res = await fetch("/.netlify/functions/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: chatHistory }),
      });

      const data = await res.json();
      const reply = data?.reply || "Jag fick inget svar. Testa igen eller mejla kontakt@proofy.se.";
      chatHistory.push({ role: "assistant", content: reply });
      addMessage("assistant", reply);
    } catch (e) {
      addMessage("assistant", "Det blev ett tekniskt fel. Försök igen, eller mejla kontakt@proofy.se.");
    }
  }

  // Events
  sendBtn.onclick = () => send(input.value);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") send(input.value);
  });

  panel.querySelectorAll(".proofy-qbtn").forEach((b) => {
    b.addEventListener("click", () => send(b.getAttribute("data-q")));
  });

  // Första öppning: lägg en intro-rad (en gång)
  let greeted = false;
  function greetOnce() {
    if (greeted) return;
    greeted = true;
    addMessage("assistant", "Hej! Vad vill du veta om Proofy? 🙂");
    chatHistory.push({ role: "assistant", content: "Hej! Vad vill du veta om Proofy? 🙂" });
  }

  // när man öppnar panelen första gången
  const originalToggle = toggle;
  toggle = (open) => {
    originalToggle(open);
    if (isOpen) greetOnce();
  };
})();
