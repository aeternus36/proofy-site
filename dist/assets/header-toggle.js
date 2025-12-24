/* =========================================================
   Proofy – Mobilheader toggle (robust)
   Kräver:
   - .mnav-toggle
   - .mnav-overlay
   - .mnav-drawer
   - [data-mnav-close] på overlay + close-knapp
   ========================================================= */
(() => {
  const docEl = document.documentElement;

  const qs  = (s, r = document) => r.querySelector(s);
  const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));

  let toggleBtn, overlayEl, drawerEl;
  let hideTimer = null;
  const TRANSITION_MS = 260;

  function setExpanded(btn, expanded) {
    if (!btn) return;
    btn.setAttribute("aria-expanded", expanded ? "true" : "false");
  }

  function clearHideTimer() {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  }

  function setHidden(hidden) {
    if (overlayEl) overlayEl.hidden = hidden;
    if (drawerEl) drawerEl.hidden = hidden;
  }

  function openMenu() {
    const body = document.body;
    if (!body) return;

    clearHideTimer();
    setHidden(false);

    requestAnimationFrame(() => {
      body.classList.add("mnav-open");
      docEl.classList.add("mnav-lock");
      setExpanded(toggleBtn, true);
    });
  }

  function closeMenu(immediate = false) {
    const body = document.body;
    if (!body) return;

    body.classList.remove("mnav-open");
    docEl.classList.remove("mnav-lock");
    setExpanded(toggleBtn, false);

    clearHideTimer();

    if (immediate) {
      setHidden(true);
      return;
    }

    hideTimer = setTimeout(() => {
      if (document.body && document.body.classList.contains("mnav-open")) return;
      setHidden(true);
    }, TRANSITION_MS);
  }

  function init() {
    toggleBtn = qs(".mnav-toggle");
    overlayEl = qs(".mnav-overlay");
    drawerEl  = qs(".mnav-drawer");

    if (!toggleBtn || !drawerEl) return;

    // Slå på CSS-läge som visar overlay/drawer när det behövs
    docEl.setAttribute("data-mnav-ready", "1");

    // Starta alltid stängt och gömt
    setExpanded(toggleBtn, false);
    setHidden(true);
    closeMenu(true);

    toggleBtn.addEventListener("click", () => {
      const isOpen = document.body?.classList.contains("mnav-open");
      isOpen ? closeMenu() : openMenu();
    });

    // Overlay + close-knapp (måste ha data-mnav-close)
    qsa("[data-mnav-close]").forEach(el =>
      el.addEventListener("click", () => closeMenu())
    );

    // Stäng när man klickar på en länk i drawer
    qsa(".mnav-links a").forEach(a =>
      a.addEventListener("click", () => closeMenu())
    );

    // ESC
    window.addEventListener("keydown", e => {
      if (e.key === "Escape") closeMenu();
    });

    // Om man går till desktop-bredd: stäng och göm direkt
    window.addEventListener("resize", () => {
      if (window.innerWidth >= 921) closeMenu(true);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
