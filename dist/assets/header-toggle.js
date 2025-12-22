// /assets/header-toggle.js

document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.getElementById("menuToggle");
  const menu = document.getElementById("mainnav");

  function openMenu() {
    menu.classList.add("active");
    document.body.classList.add("menu-open");
  }

  function closeMenu() {
    menu.classList.remove("active");
    document.body.classList.remove("menu-open");
  }

  function toggleMenu() {
    if (menu.classList.contains("active")) {
      closeMenu();
    } else {
      openMenu();
    }
  }

  toggle.addEventListener("click", toggleMenu);

  // Stäng meny vid klick utanför
  document.addEventListener("click", (e) => {
    if (!menu.contains(e.target) && !toggle.contains(e.target)) {
      closeMenu();
    }
  });

  // Stäng meny med Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeMenu();
    }
  });
});
