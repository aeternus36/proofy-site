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
    setHidden(false);

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
    if (!toggleBtn || !drawerEl) return;

    docEl.setAttribute("data-mnav-ready", "1");

    // Start stängt + helt gömt
    setHidden(true);
    setExpanded(false);
    closeMenu();

    toggleBtn.addEventListener("click", () => {
      const isOpen = document.body?.classList.contains("mnav-open");
      if (isOpen) closeMenu();
      else openMenu();
    });

    qsa("[data-mnav-close]").forEach((el) => el.addEventListener("click", closeMenu));

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeMenu();
    });

    qsa(".mnav-links a").forEach((a) => a.addEventListener("click", closeMenu));

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

