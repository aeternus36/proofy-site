/* /assets/header-toggle.js
   Robust toggle för mobilmeny (.mnav-)
   - Öppna/stäng via knapp
   - Stäng via overlay, stängknapp, Esc, klick på meny-länk
   - Låser scroll via body.mnav-open (CSS)
*/

(function () {
  "use strict";

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }
  function qsa(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
  }

  function initMobileNav() {
    const toggle = qs(".mnav-toggle");
    const drawer = qs("#mnav-menu");
    const overlay = qs(".mnav-overlay");

    // Om markup inte finns: gör inget (bombsäker)
    if (!toggle || !drawer || !overlay) return;

    const closeEls = qsa("[data-mnav-close]");
    const focusablesSel =
      'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

    let lastActiveEl = null;

    function isOpen() {
      return document.body.classList.contains("mnav-open");
    }

    function setAria(open) {
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      drawer.setAttribute("aria-hidden", open ? "false" : "true");
    }

    function openMenu() {
      if (isOpen()) return;
      lastActiveEl = document.activeElement;
      document.body.classList.add("mnav-open");
      setAria(true);

      // Fokus in i drawer (för tillgänglighet)
      const firstFocusable = qs(focusablesSel, drawer);
      if (firstFocusable) firstFocusable.focus();
    }

    function closeMenu() {
      if (!isOpen()) return;
      document.body.classList.remove("mnav-open");
      setAria(false);

      // Återställ fokus till knappen
      if (lastActiveEl && typeof lastActiveEl.focus === "function") {
        lastActiveEl.focus();
      } else {
        toggle.focus();
      }
      lastActiveEl = null;
    }

    function toggleMenu() {
      if (isOpen()) closeMenu();
      else openMenu();
    }

    // Klick på hamburgare
    toggle.addEventListener("click", function (e) {
      e.preventDefault();
      toggleMenu();
    });

    // Klick på overlay/stäng
    closeEls.forEach((el) => {
      el.addEventListener("click", function (e) {
        e.preventDefault();
        closeMenu();
      });
    });

    // Stäng om man klickar på en länk i menyn
    drawer.addEventListener("click", function (e) {
      const a = e.target && e.target.closest ? e.target.closest("a") : null;
      if (a) closeMenu();
    });

    // Esc för att stänga + enkel fokusfälla
    document.addEventListener("keydown", function (e) {
      if (!isOpen()) return;

      if (e.key === "Escape") {
        e.preventDefault();
        closeMenu();
        return;
      }

      // Fokusfälla (Tab) så fokus stannar i drawer när den är öppen
      if (e.key === "Tab") {
        const focusables = qsa(focusablesSel, drawer).filter(
          (el) => el.offsetParent !== null // synliga
        );
        if (focusables.length === 0) return;

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    });

    // Init aria
    setAria(false);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initMobileNav);
  } else {
    initMobileNav();
  }
})();
