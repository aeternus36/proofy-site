/* /assets/header-toggle.js */

(() => {
  const docEl = document.documentElement;

  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  let toggleBtn;
  let overlayEl;
  let drawerEl;

  let hideTimer = null;

  function setExpanded(expanded) {
    if (!toggleBtn) return;
    toggleBtn.setAttribute("aria-expanded", expanded ? "true" : "false");
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

    // Visa overlay + drawer i render-trädet igen
    setHidden(false);

    // Nästa frame: slå på klasser (stabilare transitions)
    requestAnimationFrame(() => {
      body.classList.add("mnav-open");
      docEl.classList.add("mnav-lock");
      setExpanded(true);
    });
  }

  function closeMenu() {
    const body = document.body;
    if (!body) return;

    body.classList.remove("mnav-open");
    docEl.classList.remove("mnav-lock");
    setExpanded(false);

    // Efter transition: göm helt (hindrar “band/slöja”/glitch)
    clearHideTimer();
    hideTimer = setTimeout(() => {
      if (document.body && document.body.classList.contains("mnav-open")) return;
      setHidden(true);
    }, 260);
  }

  function init() {
    toggleBtn = qs(".mnav-toggle");
    overlayEl = qs(".mnav-overlay");
    drawerEl = qs(".mnav-drawer");

    // Kräver toggle + drawer (overlay är nice-to-have)
    if (!toggleBtn || !drawerEl) return;

    // Markera ready (CSS slår på layout för overlay/drawer)
    docEl.setAttribute("data-mnav-ready", "1");

    // Start: alltid stängt + helt gömt
    setExpanded(false);
    setHidden(true);
    closeMenu();

    // Toggle
    toggleBtn.addEventListener("click", () => {
      const isOpen = document.body?.classList.contains("mnav-open");
      if (isOpen) closeMenu();
      else openMenu();
    });

    // Stäng på overlay + close-knapp
    qsa("[data-mnav-close]").forEach((el) => el.addEventListener("click", closeMenu));

    // ESC
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeMenu();
    });

    // Stäng när man klickar på länkar i mobilen
    qsa(".mnav-links a").forEach((a) => a.addEventListener("click", closeMenu));

    // Om man går till desktop-bredd: säkerställ stängt och scroll upplåst
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
