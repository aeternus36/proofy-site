/* /assets/header-toggle.js
   Stabil mobilmeny:
   - pointerdown (pålitligt på mobil)
   - togglar body.mnav-open
   - stänger via overlay, close-knapp, Esc, och klick på meny-länk
   - BOMBSÄKER: blockerar touchmove utanför menyn när den är öppen (hindrar swipe/pan/scroll-bakgrund)
*/

(function () {
  "use strict";

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function init() {
    const toggle = qs(".mnav-toggle");
    const drawer = qs("#mnav-menu");
    const overlay = qs(".mnav-overlay");

    if (!toggle || !drawer || !overlay) return;

    function isOpen() {
      return document.body.classList.contains("mnav-open");
    }

    function setAria(open) {
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      drawer.setAttribute("aria-hidden", open ? "false" : "true");
    }

    function openMenu() {
      if (isOpen()) return;
      document.body.classList.add("mnav-open");
      setAria(true);
    }

    function closeMenu() {
      if (!isOpen()) return;
      document.body.classList.remove("mnav-open");
      setAria(false);
    }

    function toggleMenu() {
      if (isOpen()) closeMenu();
      else openMenu();
    }

    // Pointerdown funkar bättre än click på mobiler
    document.addEventListener(
      "pointerdown",
      function (e) {
        const t = e.target;

        // Hamburger
        if (t && t.closest && t.closest(".mnav-toggle")) {
          e.preventDefault();
          toggleMenu();
          return;
        }

        // Overlay / stängknapp
        if (t && t.closest && t.closest("[data-mnav-close]")) {
          e.preventDefault();
          closeMenu();
          return;
        }

        // Klick på länk i menyn
        if (isOpen() && t && t.closest) {
          const a = t.closest("#mnav-menu a");
          if (a) {
            closeMenu();
            return;
          }
        }
      },
      { passive: false }
    );

    // Esc
    document.addEventListener("keydown", function (e) {
      if (!isOpen()) return;
      if (e.key === "Escape") {
        e.preventDefault();
        closeMenu();
      }
    });

    // ✅ BOMBSÄKER: Blockera touchmove utanför menyn när öppen
    document.addEventListener(
      "touchmove",
      function (e) {
        if (!isOpen()) return;

        // Tillåt scroll inne i drawer
        const t = e.target;
        if (t && t.closest && t.closest("#mnav-menu")) return;

        // Allt annat: stoppa (hindrar swipe/pan och bakgrundscroll)
        e.preventDefault();
      },
      { passive: false }
    );

    setAria(false);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
