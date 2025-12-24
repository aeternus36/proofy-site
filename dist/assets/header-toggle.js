(() => {
  const docEl = document.documentElement;

  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  let toggleBtn, overlayEl, drawerEl;
  let hideTimer = null;

  function setExpanded(expanded){
    if (!toggleBtn) return;
    toggleBtn.setAttribute("aria-expanded", expanded ? "true" : "false");
  }

  function clearHideTimer(){
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  }

  function setHidden(hidden){
    if (overlayEl) overlayEl.hidden = hidden;
    if (drawerEl) drawerEl.hidden = hidden;
  }

  function openMenu(){
    const body = document.body;
    if (!body) return;

    clearHideTimer();
    setHidden(false);

    requestAnimationFrame(() => {
      body.classList.add("mnav-open");
      docEl.classList.add("mnav-lock");
      setExpanded(true);
    });
  }

  function closeMenu(){
    const body = document.body;
    if (!body) return;

    body.classList.remove("mnav-open");
    docEl.classList.remove("mnav-lock");
    setExpanded(false);

    clearHideTimer();
    hideTimer = setTimeout(() => {
      // om den öppnats igen: göm inte
      if (document.body && document.body.classList.contains("mnav-open")) return;
      setHidden(true);
    }, 260);
  }

  function init(){
    toggleBtn = qs(".mnav-toggle");
    overlayEl = qs(".mnav-overlay");
    drawerEl = qs(".mnav-drawer");

    if (!toggleBtn || !drawerEl) return;

    // Markera att CSS får visa overlay/drawer (men vi håller dem hidden när stängd)
    docEl.setAttribute("data-mnav-ready", "1");

    // Start: alltid stängt + hidden
    setExpanded(false);
    setHidden(true);
    closeMenu();

    toggleBtn.addEventListener("click", () => {
      const isOpen = document.body?.classList.contains("mnav-open");
      if (isOpen) closeMenu();
      else openMenu();
    });

    qsa("[data-mnav-close]").forEach(el => {
      el.addEventListener("click", closeMenu);
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeMenu();
    });

    qsa(".mnav-links a").forEach(a => {
      a.addEventListener("click", closeMenu);
    });

    // Safety: om man går till desktopbredd, stäng och göm
    window.addEventListener("resize", () => {
      if (window.innerWidth >= 921) {
        closeMenu();
        setHidden(true);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
