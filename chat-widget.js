/* Proofy Assist Chat Widget (SV/EN) - static client
   Requires Netlify Function at /.netlify/functions/chat
*/
(() => {
  const endpoint = "/.netlify/functions/chat";
  const state = { open: false, locale: "sv" };

  const css = `
  .proofy-chat-bubble{position:fixed;right:18px;bottom:18px;z-index:9999;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial}
  .proofy-chat-btn{width:56px;height:56px;border-radius:18px;border:0;cursor:pointer;
    background:linear-gradient(135deg,rgba(110,168,255,.95),rgba(124,241,198,.85));
    box-shadow:0 18px 45px rgba(110,168,255,.22);color:#08101e;font-weight:900}
  .proofy-chat-panel{position:absolute;right:0;bottom:70px;width:min(380px,calc(100vw - 36px));
    border-radius:18px;overflow:hidden;border:1px solid rgba(255,255,255,.14);
    background:rgba(11,18,32,.92);backdrop-filter:blur(12px);box-shadow:0 18px 60px rgba(0,0,0,.45);display:none}
  .proofy-chat-panel.open{display:block}
  .proofy-chat-header{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 12px;border-bottom:1px solid rgba(255,255,255,.12);color:#eaf0ff}
  .proofy-chat-title{font-weight:900;letter-spacing:.2px}
  .proofy-chat-actions{display:flex;align-items:center;gap:8px}
  .proofy-chat-select{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);color:#eaf0ff;border-radius:12px;padding:6px 8px;font-weight:700}
  .proofy-chat-close{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);color:#eaf0ff;border-radius:12px;padding:6px 10px;cursor:pointer;font-weight:900}
  .proofy-chat-body{padding:12px;max-height:380px;overflow:auto}
  .proofy-msg{padding:10px 12px;border-radius:14px;margin:8px 0;line-height:1.45}
  .proofy-msg.bot{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);color:#eaf0ff}
  .proofy-msg.user{background:rgba(110,168,255,.18);border:1px solid rgba(110,168,255,.22);color:#eaf0ff;margin-left:18px}
  .proofy-chat-footer{display:flex;gap:8px;padding:12px;border-top:1px solid rgba(255,255,255,.12)}
  .proofy-chat-input{flex:1;min-width:0;padding:10px 12px;border-radius:14px;border:1px solid rgba(255,255,255,.12);
    background:rgba(11,18,32,.35);color:#eaf0ff;outline:none}
  .proofy-chat-send{border:0;border-radius:14px;padding:10px 12px;cursor:pointer;font-weight:900;color:#08101e;
    background:linear-gradient(135deg,rgba(110,168,255,.95),rgba(124,241,198,.85))}
  .proofy-chat-note{padding:0 12px 12px;color:rgba(169,183,211,.92);font-size:12px}
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  const wrap = document.createElement("div");
  wrap.className = "proofy-chat-bubble";
  wrap.innerHTML = `
    <div class="proofy-chat-panel" aria-live="polite" aria-label="Proofy chat">
      <div class="proofy-chat-header">
        <div class="proofy-chat-title">Proofy Assist</div>
        <div class="proofy-chat-actions">
          <select class="proofy-chat-select" aria-label="Language">
            <option value="sv">SV</option>
            <option value="en">EN</option>
          </select>
          <button class="proofy-chat-close" type="button" aria-label="Close">×</button>
        </div>
      </div>
      <div class="proofy-chat-body"></div>
      <div class="proofy-chat-footer">
        <input class="proofy-chat-input" type="text" placeholder="Skriv en fråga…" />
        <button class="proofy-chat-send" type="button">Send</button>
      </div>
      <div class="proofy-chat-note">For legal questions: we can explain the service, not provide legal advice. You can email <b>kontakt@proofy.se</b>.</div>
    </div>
    <button class="proofy-chat-btn" type="button" aria-label="Open chat">Chat</button>
  `;
  document.body.appendChild(wrap);

  const btn = wrap.querySelector(".proofy-chat-btn");
  const panel = wrap.querySelector(".proofy-chat-panel");
  const closeBtn = wrap.querySelector(".proofy-chat-close");
  const body = wrap.querySelector(".proofy-chat-body");
  const input = wrap.querySelector(".proofy-chat-input");
  const sendBtn = wrap.querySelector(".proofy-chat-send");
  const select = wrap.querySelector(".proofy-chat-select");

  const t = (sv, en) => (state.locale === "sv" ? sv : en);

  function addMsg(text, who) {
    const div = document.createElement("div");
    div.className = `proofy-msg ${who}`;
    div.textContent = text;
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
    return div;
  }

  function setOpen(open) {
    state.open = open;
    panel.classList.toggle("open", open);
    if (open) {
      input.focus();
      if (!body.dataset.greeted) {
        addMsg(t("Hej! Jag kan svara på frågor om Proofy (FAQ, säkerhet, integritet, pilot) och guida till demo.", 
                 "Hi! I can answer questions about Proofy (FAQ, security, privacy, pilot) and guide you to a demo."), "bot");
        body.dataset.greeted = "1";
      }
    }
  }

  async function send() {
    const msg = (input.value || "").trim();
    if (!msg) return;
    input.value = "";
    addMsg(msg, "user");
    const typing = addMsg(t("Skriver…", "Typing…"), "bot");

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, locale: state.locale })
      });
      const data = await res.json().catch(() => ({}));
      typing.textContent = data.reply || t("Jag kunde tyvärr inte hämta svar just nu.", "I couldn’t fetch an answer right now.");
    } catch (e) {
      typing.textContent = t("Tekniskt fel. Försök igen eller mejla kontakt@proofy.se.", "Technical error. Try again or email kontakt@proofy.se.");
    }
  }

  btn.addEventListener("click", () => setOpen(!state.open));
  closeBtn.addEventListener("click", () => setOpen(false));
  sendBtn.addEventListener("click", send);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
  select.addEventListener("change", () => {
    state.locale = select.value === "en" ? "en" : "sv";
    input.placeholder = t("Skriv en fråga…", "Ask a question…");
  });
})();
