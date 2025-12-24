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

  function clearHideTimer(){
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  }

  function setHiddenState(hidden){
    // hidden=true => helt borta ur render-trädet (motverkar mobil-glitch)
    if (overlayEl) overlayEl.hidden = hidden;
    if (drawerEl) drawerEl.hidden = hidden;
  }

  function openMenu() {
    const body = document.body;
    if (!body) return;

    clearHideTimer();

    // Visa lagren igen
    setHiddenState(false);

    // Låt browsern “se” display innan vi slår på klasser (stabilare transitions)
    requestAnimationFrame(() => {
      body.classList.add("mnav-open");
      docEl.classList.add("mnav-lock");
      setExpanded(toggleBtn, true);
    });
  }

  function closeMenu() {
    const body = document.body;
    if (!body) return;

    body.classList.remove("mnav-open");
    docEl.classList.remove("mnav-lock");
    setExpanded(toggleBtn, false);

    // Efter transition: göm helt (bombsäker mot “slöja/band”)
    clearHideTimer();
    hideTimer = setTimeout(() => {
      // Om menyn öppnats igen under tiden, göm inte
      if (document.body && document.body.classList.contains("mnav-open")) return;
      setHiddenState(true);
    }, 260); // matchar CSS transitions (0.22s/0.18s) + marginal
  }

  function init() {
    toggleBtn = qs(".mnav-toggle");
    overlayEl = qs(".mnav-overlay");
    drawerEl = qs(".mnav-drawer");

    // Kräver minst toggle + drawer. Overlay är “nice to have” men bör finnas.
    if (!toggleBtn || !drawerEl) return;

    // Markera att mobilnav finns och ska renderas (CSS slår på overlay/drawer)
    docEl.setAttribute("data-mnav-ready", "1");

    // Viktigt: starta alltid stängt + gömt
    setExpanded(toggleBtn, false);
    setHiddenState(true);
    closeMenu();

    // Klick: öppna/stäng
    toggleBtn.addEventListener("click", () => {
      const isOpen = document.body?.classList.contains("mnav-open");
      if (isOpen) closeMenu();
      else openMenu();
    });

    // Stäng på overlay + close-knapp (om overlay finns)
    qsa("[data-mnav-close]").forEach(el => {
      el.addEventListener("click", closeMenu);
    });

    // Stäng på ESC
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeMenu();
    });

    // Stäng när man klickar på länkar i mobilen
    qsa(".mnav-links a").forEach(a => {
      a.addEventListener("click", closeMenu);
    });

    // Säkerhetsnät: om man roterar/byter till desktop-bredd, lås inte scroll
    window.addEventListener("resize", () => {
      if (window.innerWidth >= 921) {
        closeMenu();
        setHiddenState(true);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
