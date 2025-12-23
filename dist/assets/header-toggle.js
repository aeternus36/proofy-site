/* /assets/header-toggle.js */

(function () {
  const html = document.documentElement;
  const body = document.body;

  const toggle = document.querySelector(".mnav-toggle");
  const drawer = document.getElementById("mnav-menu");
  const closeTargets = document.querySelectorAll("[data-mnav-close]");

  if (!toggle || !drawer) {
    // Om HTML saknar meny-delar: gör inget.
    return;
  }

  const OPEN_CLASS = "mnav-open";
  const LOCK_CLASS = "mnav-lock";

  function isMobile() {
    // matchar din CSS-breakpoint (920px)
    return window.matchMedia("(max-width: 920px)").matches;
  }

  function setExpanded(expanded) {
    toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
  }

  function openMenu() {
    if (!isMobile()) return;
    body.classList.add(OPEN_CLASS);
    html.classList.add(LOCK_CLASS);
    setExpanded(true);

    // Reflow/resize så att chat-widget (och andra fixed element) ritas korrekt i mobil-webviews
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
      window.dispatchEvent(new Event("scroll"));
    });
  }

  function closeMenu() {
    body.classList.remove(OPEN_CLASS);
    html.classList.remove(LOCK_CLASS);
    setExpanded(false);

    requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
      window.dispatchEvent(new Event("scroll"));
    });
  }

  function toggleMenu() {
    if (body.classList.contains(OPEN_CLASS)) closeMenu();
    else openMenu();
  }

  // Gör overlay/drawer aktiva först när JS laddat
  html.setAttribute("data-mnav-ready", "1");

  // Säkra default state
  closeMenu();

  // Click handlers
  toggle.addEventListener("click", toggleMenu);
  closeTargets.forEach((el) => el.addEventListener("click", closeMenu));

  // Stäng på ESC
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });

  // Stäng om man klickar på länkar i menyn
  drawer.addEventListener("click", (e) => {
    const a = e.target.closest("a");
    if (a) closeMenu();
  });

  // Om man roterar/byter storlek till desktop: stäng och lås upp
  window.addEventListener("resize", () => {
    if (!isMobile()) closeMenu();
  });

  // Viktigt: vissa mobil-webviews renderar fixed-element fel tills första interaction.
  // Trigga en minimal “kick” efter load för chat-bubblan.
  window.addEventListener("load", () => {
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
      window.dispatchEvent(new Event("scroll"));
    });
  });

  // Om hash-navigering (t.ex. #kontakt) sker: stäng menyn
  window.addEventListener("hashchange", closeMenu);
})();
