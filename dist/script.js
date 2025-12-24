/* --- Proofy: Mobile header nav (no header.js needed) --- */
(() => {
  const docEl = document.documentElement;

  const qs  = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  let toggleBtn, overlayEl, drawerEl;
  let hideTimer = null;

  const TRANSITION_MS = 260;

  function setExpanded(btn, expanded) {
    if (!btn) return;
    btn.setAttribute("aria-expanded", expanded ? "true" : "false");
  }

  function clearHideTimer(){
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  }

  function setHiddenState(hidden){
    if (overlayEl) overlayEl.hidden = hidden;
    if (drawerEl) drawerEl.hidden = hidden;
  }

  function openMenu() {
    const body = document.body;
    if (!body) return;

    clearHideTimer();
    setHiddenState(false);

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

    hideTimer = setTimeout(() => {
      if (document.body && document.body.classList.contains("mnav-open")) return;
      setHiddenState(true);
    }, TRANSITION_MS);
  }

  function init() {
    toggleBtn = qs(".mnav-toggle");
    overlayEl = qs(".mnav-overlay");
    drawerEl  = qs(".mnav-drawer");

    if (!toggleBtn || !drawerEl) return;

    // tell CSS it may render overlay/drawer (but we still keep them hidden until open)
    docEl.setAttribute("data-mnav-ready", "1");

    setExpanded(toggleBtn, false);
    setHiddenState(true);
    closeMenu(true);

    toggleBtn.addEventListener("click", () => {
      const isOpen = document.body?.classList.contains("mnav-open");
      if (isOpen) closeMenu();
      else openMenu();
    });

    qsa("[data-mnav-close]").forEach((el) => {
      el.addEventListener("click", () => closeMenu());
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeMenu();
    });

    qsa(".mnav-links a").forEach((a) => {
      a.addEventListener("click", () => closeMenu());
    });

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

