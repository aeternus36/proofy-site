/* /chat-widget.js */
(() => {
  const doc = document;

  const ensure = () => {
    // Om den redan finns, gör inget
    if (doc.getElementById("proofy-chat-fab")) return;

    const style = doc.createElement("style");
    style.textContent = `
      #proofy-chat-fab{
        position: fixed;
        right: 18px;
        bottom: calc(18px + env(safe-area-inset-bottom));
        z-index: 2500;
        border: 0;
        border-radius: 999px;
        padding: 14px 18px;
        font-weight: 900;
        font-size: 16px;
        cursor: pointer;
        color: #08101e;
        background: linear-gradient(135deg, rgba(110,168,255,.95), rgba(124,241,198,.85));
        box-shadow: 0 12px 32px rgba(0,0,0,.35);
        -webkit-tap-highlight-color: transparent;
      }
      #proofy-chat-fab:active{ transform: translateY(1px); }

      #proofy-chat-panel{
        position: fixed;
        right: 18px;
        bottom: calc(74px + env(safe-area-inset-bottom));
        width: min(92vw, 360px);
        z-index: 2500;
        border-radius: 18px;
        border: 1px solid rgba(255,255,255,.10);
        background: rgba(11,18,32,.96);
        backdrop-filter: blur(10px) saturate(140%);
        box-shadow: 0 18px 45px rgba(0,0,0,.45);
        color: rgba(234,240,255,.92);
        padding: 14px;
        display: none;
      }

      #proofy-chat-panel[data-open="1"]{ display:block; }

      #proofy-chat-panel h3{
        margin: 0 0 6px 0;
        font-size: 16px;
        font-weight: 950;
      }
      #proofy-chat-panel p{
        margin: 0 0 12px 0;
        font-size: 14px;
        color: rgba(169,183,211,.92);
        line-height: 1.4;
      }
      #proofy-chat-actions{
        display:flex;
        gap:10px;
        flex-wrap: wrap;
      }
      #proofy-chat-actions a, #proofy-chat-actions button{
        border-radius: 14px;
        border: 1px solid rgba(255,255,255,.12);
        background: rgba(255,255,255,.06);
        color: rgba(234,240,255,.92);
        padding: 12px 14px;
        font-weight: 900;
        cursor: pointer;
        text-decoration: none;
      }
      #proofy-chat-actions a.primary{
        border: 0;
        color: #08101e;
        background: linear-gradient(135deg, rgba(110,168,255,.95), rgba(124,241,198,.85));
      }

      /* När mobilmenyn är öppen: låt chat ligga under overlay/drawer så det inte stör */
      body.mnav-open #proofy-chat-fab,
      body.mnav-open #proofy-chat-panel{
        z-index: 1500;
      }
    `;
    doc.head.appendChild(style);

    const fab = doc.createElement("button");
    fab.id = "proofy-chat-fab";
    fab.type = "button";
    fab.textContent = "Fråga oss";

    const panel = doc.createElement("div");
    panel.id = "proofy-chat-panel";
    panel.setAttribute("aria-live", "polite");
    panel.innerHTML = `
      <h3>Fråga oss</h3>
      <p>Snabb fråga? Mejla oss eller boka en demo så hör vi av oss inom 1 arbetsdag.</p>
      <div id="proofy-chat-actions">
        <a class="primary" href="#kontakt">Boka demo</a>
        <a href="mailto:kontakt@proofy.se">kontakt@proofy.se</a>
        <button type="button" id="proofy-chat-close">Stäng</button>
      </div>
    `;

    doc.body.appendChild(fab);
    doc.body.appendChild(panel);

    const setOpen = (open) => {
      panel.setAttribute("data-open", open ? "1" : "0");
    };

    fab.addEventListener("click", () => {
      const open = panel.getAttribute("data-open") === "1";
      setOpen(!open);
    });

    panel.querySelector("#proofy-chat-close")?.addEventListener("click", () => setOpen(false));

    // Stäng panel om man klickar utanför
    doc.addEventListener("click", (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      const open = panel.getAttribute("data-open") === "1";
      if (!open) return;
      if (t.closest("#proofy-chat-panel") || t.closest("#proofy-chat-fab")) return;
      setOpen(false);
    });
  };

  // Kör tidigt + redundans (fixar “syns först efter interaktion”-symptom)
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensure);
  } else {
    ensure();
  }

  // Backup ifall något stör initial rendering
  setTimeout(ensure, 400);
})();
