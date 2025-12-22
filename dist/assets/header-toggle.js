/* /assets/header-toggle.js
   Robust mobilmeny för .mnav-* markup
*/
(() => {
  const body = document.body;

  const toggle = document.querySelector(".mnav-toggle");
  const drawer = document.getElementById("mnav-menu");
  const overlay = document.querySelector(".mnav-overlay");

  if (!toggle || !drawer || !overlay) return;

  const CLOSE_SELECTORS = "[data-mnav-close]";
  const FOCUSABLE =
    'a[href], button:not([disabled]), textarea, input, select, details, summary, [tabindex]:not([tabindex="-1"])';

  let lastFocus = null;

  function isOpen() {
    return body.classList.contains("mnav-open");
  }

  function lockScroll(lock) {
    if (lock) {
      body.classList.add("menu-open");
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

    const first = drawer.querySelector(FOCUSABLE);
    if (first) first.focus({ preventScroll: true });
  }

  function closeMenu() {
    if (!isOpen()) return;

    body.classList.remove("mnav-open");
    toggle.setAttribute("aria-expanded", "false");
    lockScroll(false);

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

  toggle.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleMenu();
  });

  overlay.addEventListener("click", (e) => {
    e.preventDefault();
    closeMenu();
  });

  document.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (t.closest(CLOSE_SELECTORS)) {
      e.preventDefault();
      closeMenu();
    }
  });

  drawer.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    const link = t.closest("a[href]");
    if (link) closeMenu();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });

  // Focus trap när öppen
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

  // Byt till desktop -> stäng
  window.addEventListener("resize", () => {
    if (window.innerWidth > 920) closeMenu();
  });
})();
