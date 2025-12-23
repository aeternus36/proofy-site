(() => {
  const ID = "proofy-chat-bubble";
  if (document.getElementById(ID)) return;

  const style = document.createElement("style");
  style.textContent = `
    #${ID}{
      position: fixed;
      right: 16px;
      bottom: 16px;
      z-index: 1500; /* under mobilmeny (2000+) men över sidan */
      border: none;
      cursor: pointer;
      padding: 14px 18px;
      border-radius: 999px;
      font-weight: 900;
      font-size: 16px;
      color: #08101e;
      background: linear-gradient(135deg, rgba(110,168,255,.95), rgba(124,241,198,.85));
      box-shadow: 0 10px 30px rgba(0,0,0,.28);
      -webkit-tap-highlight-color: transparent;
    }
    #${ID}:active{ transform: translateY(1px); }
  `;
  document.head.appendChild(style);

  const btn = document.createElement("button");
  btn.id = ID;
  btn.type = "button";
  btn.textContent = "Fråga oss";

  btn.addEventListener("click", () => {
    const el = document.getElementById("kontakt");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    else window.location.hash = "#kontakt";
  });

  // Append direkt till body för att undvika clipping/stacking från wrappers
  document.addEventListener("DOMContentLoaded", () => {
    document.body.appendChild(btn);
  });
})();
