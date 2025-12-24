/* =========================================================
   Proofy – Mobilmeny toggle (MINIMAL & STABIL)
   - Inga transitions
   - Inget requestAnimationFrame
   - Inget “ready”-läge
   ========================================================= */
(() => {
  const docEl = document.documentElement;
  const body  = document.body;

  const qs  = (s) => document.querySelector(s);
  const qsa = (s) => Array.from(document.querySelectorAll(s));

  const toggle = qs(".mnav-toggle");
  const overlay = qs(".mnav-overlay");
  const drawer  = qs(".mnav-drawer");

  if (!toggle || !drawer) return;

  function openMenu(){
    body.classList.add("mnav-open");
    docEl.classList.add("mnav-lock");
    toggle.setAttribute("aria-expanded","true");
    if (overlay) overlay.hidden = false;
    drawer.hidden = false;
  }

  function closeMenu(){
    body.classList.remove("mnav-open");
    docEl.classList.remove("mnav-lock");
    toggle.setAttribute("aria-expanded","false");
    if (overlay) overlay.hidden = true;
    drawer.hidden = true;
  }

  // Startläge: ALLTID stängt
  if (overlay) overlay.hidden = true;
  drawer.hidden = true;
  closeMenu();

  toggle.addEventListener("click", () => {
    body.classList.contains("mnav-open") ? closeMenu() : openMenu();
  });

  qsa("[data-mnav-close]").forEach(el =>
    el.addEventListener("click", closeMenu)
  );

  qsa(".mnav-links a").forEach(a =>
    a.addEventListener("click", closeMenu)
  );

  window.addEventListener("keydown", e => {
    if (e.key === "Escape") closeMenu();
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth >= 921) closeMenu();
  });
})();
