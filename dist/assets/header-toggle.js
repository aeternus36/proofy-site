(() => {
  const docEl = document.documentElement;
  const body = document.body;

  function qs(sel, root = document) { return root.querySelector(sel); }
  function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

  function setExpanded(btn, expanded) {
    if (!btn) return;
    btn.setAttribute("aria-expanded", expanded ? "true" : "false");
  }

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

  let toggleBtn;

  function init() {
    toggleBtn = qs(".mnav-toggle");
    const drawer = qs(".mnav-drawer");
    if (!toggleBtn || !drawer) return;

    // Markera att mobilnav finns och ska renderas (CSS slår på overlay/drawer)
    docEl.setAttribute("data-mnav-ready", "1");

    // Klick: öppna/stäng
    toggleBtn.addEventListener("click", () => {
      const isOpen = body.classList.contains("mnav-open");
      if (isOpen) closeMenu();
      else openMenu();
    });

    // Stäng på overlay + close-knapp
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

    // Säkerställ stängt initialt (om någon cacheat klasser)
    closeMenu();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
