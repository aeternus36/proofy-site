/* /assets/header-toggle.js */
(() => {
  "use strict";

  const toggle = document.querySelector(".mnav-toggle");
  const drawer = document.getElementById("mnav-menu");
  const overlay = document.querySelector(".mnav-overlay");
  const closeBtns = document.querySelectorAll("[data-mnav-close]");

  if (!toggle || !drawer || !overlay) return;

  const html = document.documentElement;

  function openMenu() {
    document.body.classList.add("mnav-open");
    html.classList.add("mnav-lock");
    toggle.setAttribute("aria-expanded", "true");

    // fokus på stäng-knappen om den finns
    const closeBtn = drawer.querySelector(".mnav-close");
    if (closeBtn) closeBtn.focus({ preventScroll: true });
  }

  function closeMenu() {
    document.body.classList.remove("mnav-open");
    html.classList.remove("mnav-lock");
    toggle.setAttribute("aria-expanded", "false");

    // tillbaka fokus till hamburgaren
    toggle.focus({ preventScroll: true });
  }

  function isOpen() {
    return document.body.classList.contains("mnav-open");
  }

  toggle.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    isOpen() ? closeMenu() : openMenu();
  });

  // Overlay click stänger
  overlay.addEventListener("click", (e) => {
    e.preventDefault();
    closeMenu();
  });

  // Alla [data-mnav-close] stänger (overlay + X)
  closeBtns.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      closeMenu();
    });
  });

  // Klick på en länk i menyn stänger
  drawer.addEventListener("click", (e) => {
    const a = e.target.closest("a");
    if (a) closeMenu();
  });

  // ESC stänger
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen()) closeMenu();
  });

  // Om man roterar/skalar upp till desktop, stäng
  window.addEventListener("resize", () => {
    if (window.matchMedia("(min-width: 921px)").matches && isOpen()) {
      closeMenu();
    }
  });
})();
