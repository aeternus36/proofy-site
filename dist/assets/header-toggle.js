// /assets/header-toggle.js
(() => {
  const docEl = document.documentElement;

  const toggle = document.querySelector(".mnav-toggle");
  const drawer = document.getElementById("mnav-menu");
  const overlay = document.querySelector(".mnav-overlay");
  const closeEls = document.querySelectorAll("[data-mnav-close]");

  if (!toggle || !drawer || !overlay) return;

  // Markera att JS är igång så CSS får visa overlay/drawer-lager
  docEl.setAttribute("data-mnav-ready", "1");

  const setExpanded = (open) => {
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  };

  const openMenu = () => {
    document.body.classList.add("mnav-open");
    docEl.classList.add("mnav-lock");
    setExpanded(true);
  };

  const closeMenu = () => {
    document.body.classList.remove("mnav-open");
    docEl.classList.remove("mnav-lock");
    setExpanded(false);
  };

  const isOpen = () => document.body.classList.contains("mnav-open");

  toggle.addEventListener("click", () => {
    isOpen() ? closeMenu() : openMenu();
  });

  // Klick på overlay + alla [data-mnav-close]
  overlay.addEventListener("click", closeMenu);
  closeEls.forEach((el) => el.addEventListener("click", closeMenu));

  // ESC stänger
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });

  // Klick på länk i menyn stänger (för #kontakt och vanliga länkar)
  drawer.addEventListener("click", (e) => {
    const a = e.target.closest("a");
    if (a) closeMenu();
  });

  // Säkerställ korrekt startläge
  closeMenu();
})();
