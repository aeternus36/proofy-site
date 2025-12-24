(() => {
  const docEl = document.documentElement;
  const body = document.body;

  function qs(sel, root = document) {
    return root.querySelector(sel);
  }
  function qsa(sel, root = document) {
    return Array.from(root.querySelectorAll(sel));
  }

  function setExpanded(btn, expanded) {
    if (!btn) return;
    btn.setAttribute("aria-expanded", expanded ? "true" : "false");
  }

  let toggleBtn;
  let overlayEl;
  let drawerEl;

  function openMenu() {
    body.classList.add("mnav-open");
    docEl.classList.add("mnav-lock");
    setExpanded(toggleBtn, true);
  }

  function closeMenu() {
    body.classList.remove("mnav-open");
    docEl.classList.remove("mnav-lock");
    setExpanded(toggleBtn, false);
  }

  function init() {
    toggleBtn = qs(".mnav-toggle");
    overlayEl = qs(".mnav-overlay");
    drawerEl = qs(".mnav-drawer");

    // Kräver toggle + drawer för att fungera
    if (!toggleBtn || !drawerEl) return;

    // Aktivera mobilnav i CSS
    docEl.setAttribute("data-mnav-ready", "1");

    // Startläge: stängd
    closeMenu();

    // Toggle-knapp
    toggleBtn.addEventListener("click", () => {
      const isOpen = body.classList.contains("mnav-open");
      isOpen ? closeMenu() : openMenu();
    });

    // Overlay + close-knapp
    qsa("[data-mnav-close]").forEach(el =>
      el.addEventListener("click", closeMenu)
    );

    if (overlayEl) {
      overlayEl.addEventListener("click", closeMenu);
    }

    // ESC
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeMenu();
    });

    // Klick på länk i mobilen stänger
    qsa(".mnav-links a").forEach(a =>
      a.addEventListener("click", closeMenu)
    );

    // Byter man till desktop: stäng och släpp scroll-lås
    window.addEventListener("resize", () => {
      if (window.innerWidth >= 921) closeMenu();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
