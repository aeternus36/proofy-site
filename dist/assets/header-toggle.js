(() => {
  const docEl = document.documentElement;

  function qs(sel, root = document) { return root.querySelector(sel); }
  function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

  function setExpanded(btn, expanded) {
    if (!btn) return;
    btn.setAttribute("aria-expanded", expanded ? "true" : "false");
  }

  let toggleBtn;
  let overlayEl;
  let drawerEl;

  let hideTimer = null;
  const TRANSITION_MS = 260; // matchar CSS transitions + marginal

  function clearHideTimer(){
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  }

  function setHiddenState(hidden){
    // hidden=true => helt borta ur render-trädet (motverkar mobil-glitch/band)
    if (overlayEl) overlayEl.hidden = hidden;
    if (drawerEl) drawerEl.hidden = hidden;
  }

  function openMenu() {
    const body = document.body;
    if (!body) return;

    clearHideTimer();

    // Visa lagren igen
    setHiddenState(false);

    // Slå på klasser en frame senare för stabilare transition
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
      setHiddenState(true);
      return;
    }

    // Efter transition: göm helt (bombsäker mot “slöja/band”)
    hideTimer = setTimeout(() => {
      if (document.body && document.body.classList.contains("mnav-open")) return;
      setHiddenState(true);
    }, TRANSITION_MS);
  }

  function init() {
    toggleBtn = qs(".mnav-toggle");
    overlayEl = qs(".mnav-overlay");
    drawerEl = qs(".mnav-drawer");

    if (!toggleBtn || !drawerEl) return;

    // Markera att mobilnav finns (CSS slår på overlay/drawer)
    docEl.setAttribute("data-mnav-ready", "1");

    // Starta alltid stängt + hidden (viktigt för att stoppa UI-glitch vid first paint)
    setExpanded(toggleBtn, false);
    setHiddenState(true);
    closeMenu(true);

    toggleBtn.addEventListener("click", () => {
      const isOpen = document.body?.classList.contains("mnav-open");
      if (isOpen) closeMenu();
      else openMenu();
    });

    // Stäng på overlay + close-knapp
    qsa("[data-mnav-close]").forEach(el => {
      el.addEventListener("click", () => closeMenu());
    });

    // Stäng på ESC
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeMenu();
    });

    // Stäng när man klickar på länkar i mobilen
    qsa(".mnav-links a").forEach(a => {
      a.addEventListener("click", () => closeMenu());
    });

    // Säkerhetsnät: om man roterar/byter till desktop-bredd
    window.addEventListener("resize", () => {
      if (window.innerWidth >= 921) {
        closeMenu(true);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
