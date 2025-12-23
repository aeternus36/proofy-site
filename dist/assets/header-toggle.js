/* /assets/header-toggle.js */
(() => {
  "use strict";

  const toggle = document.querySelector(".mnav-toggle");
  const drawer = document.getElementById("mnav-menu");
  const overlay = document.querySelector(".mnav-overlay");

  if (!toggle || !drawer || !overlay) return;

  const html = document.documentElement;
  html.setAttribute("data-mnav-ready", "1");

  function openMenu() {
    document.body.classList.add("mnav-open");
    html.classList.add("mnav-lock");
    toggle.setAttribute("aria-expanded", "true");
  }

  function closeMenu() {
    document.body.classList.remove("mnav-open");
    html.classList.remove("mnav-lock");
    toggle.setAttribute("aria-expanded", "false");
  }

  toggle.addEventListener("click", (e) => {
    e.preventDefault();
    document.body.classList.contains("mnav-open")
      ? closeMenu()
      : openMenu();
  });

  overlay.addEventListener("click", closeMenu);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });
})();
