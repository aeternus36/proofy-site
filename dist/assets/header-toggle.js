/* /assets/header-toggle.js
   Robust mobilmeny för .mnav-* markup
*/
(() => {
  const root = document.documentElement;
  const body = document.body;

  const toggle = document.querySelector(".mnav-toggle");
  const drawer = document.getElementById("mnav-menu");
  const overlay = document.querySelector(".mnav-overlay");

  if (!toggle || !drawer || !overlay) {
    // Ingen mobilmeny på denna sida – gör inget.
    return;
  }

  const CLOSE_SELECTORS = "[data-mnav-close]";
  const FOCUSABLE =
    'a[href], button:not([disabled]), textarea, input, select, details, summary, [tabindex]:not([tabindex="-1"])';

  let lastFocus = null;

  function isOpen() {
    return body.classList.contains("mnav-open");
  }

  function lockScroll(lock) {
    // Enkel och kompatibel “scroll lock”
    if (lock) {
      body.classList.add("menu-open"); // om du redan använder den klassen
      body.style.overflow = "hidden";
      body.style.touchAction = "none";
    } else {
      body.classList.remove("menu-open");
      body.style.overflow = "";
      body.style.touchAction = "";
    }
  }

  function openMenu() {
    if (isOpen()) return;

    lastFocus = document.activeElement;
    body.classList.add("mnav-open");
    toggle.setAttribute("aria-expanded", "true");
    lockScroll(true);

    // Sätt fokus i drawer
    const first = drawer.querySelector(FOCUSABLE);
    if (first) first.focus({ preventScroll: true });
  }

  function closeMenu() {
    if (!isOpen()) return;

    body.classList.remove("mnav-open");
    toggle.setAttribute("aria-expanded", "false");
    lockScroll(false);

    // Återställ fokus
    if (lastFocus && typeof lastFocus.focus === "function") {
      lastFocus.focus({ preventScroll: true });
    } else {
      toggle.focus({ preventScroll: true });
    }
  }

  function toggleMenu() {
    if (isOpen()) closeMenu();
    else openMenu();
  }

  // Klick på hamburgaren
  toggle.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleMenu();
  });

  // Klick på overlay stänger
  overlay.addEventListener("click", (e) => {
    e.preventDefault();
    closeMenu();
  });

  // Alla element med data-mnav-close stänger (X, overlay om du vill, etc.)
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (t.closest(CLOSE_SELECTORS)) {
      e.preventDefault();
      closeMenu();
    }
  });

  // Klick på en länk i menyn stänger (för interna ankare/sidor)
  drawer.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    const link = t.closest("a[href]");
    if (link) closeMenu();
  });

  // ESC stänger
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });

  // Enkel focus-trap (så fokus inte “flyr” bakom)
  document.addEventListener("keydown", (e) => {
    if (!isOpen() || e.key !== "Tab") return;

    const focusables = Array.from(drawer.querySelectorAll(FOCUSABLE))
      .filter((el) => el.offsetParent !== null);

    if (focusables.length === 0) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  // Säkerställ korrekt state vid resize: om man går till desktop, stäng.
  window.addEventListener("resize", () => {
    // matcha din breakpoint (920px)
    if (window.innerWidth > 920) closeMenu();
  });

})();
