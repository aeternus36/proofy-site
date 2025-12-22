/* /assets/header-toggle.js */
(() => {
  "use strict";

  const toggle = document.querySelector(".mnav-toggle");
  const drawer = document.querySelector(".mnav-drawer");
  const overlay = document.querySelector(".mnav-overlay");

  if (!toggle || !drawer || !overlay) return;

  const closeBtns = document.querySelectorAll("[data-mnav-close]");
  const mqDesktop = window.matchMedia("(min-width: 921px)");

  function setOpen(isOpen) {
    document.body.classList.toggle("mnav-open", isOpen);
    toggle.setAttribute("aria-expanded", String(isOpen));

    // Lås scroll när menyn är öppen
    document.documentElement.classList.toggle("mnav-lock", isOpen);
  }

  function openMenu() { setOpen(true); }
  function closeMenu() { setOpen(false); }
  function toggleMenu() { setOpen(!document.body.classList.contains("mnav-open")); }

  // Markera att JS är igång (CSS använder detta)
  document.documentElement.setAttribute("data-mnav-ready", "1");

  toggle.addEventListener("click", (e) => {
    e.preventDefault();
    toggleMenu();
  });

  overlay.addEventListener("click", (e) => {
    e.preventDefault();
    closeMenu();
  });

  closeBtns.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      closeMenu();
    });
  });

  // Stäng på ESC
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });

  // Stäng när man klickar på en länk i menyn
  drawer.addEventListener("click", (e) => {
    const a = e.target && e.target.closest ? e.target.closest("a") : null;
    if (a) closeMenu();
  });

  // Om man går till desktop-läge: stäng menyn
  mqDesktop.addEventListener("change", () => {
    if (mqDesktop.matches) closeMenu();
  });

  // Startläge
  setOpen(false);
})();
