/* /assets/header-toggle.js
   BOMBSÄKER mobilmeny:
   - Lyssnar på pointerdown (bättre än click på mobil)
   - Sätter inline-style på drawer (right:0 / right:-400px)
   - Toggler body.mnav-open (för overlay/scroll lock)
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

    // Säker default-läge (om CSS inte hunnit)
    drawer.style.right = "-400px";

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
      // Inline style: oberoende av CSS-buggar
      drawer.style.right = "0px";
      setAria(true);
    }

    function closeMenu() {
      if (!isOpen()) return;
      document.body.classList.remove("mnav-open");
      drawer.style.right = "-400px";
      setAria(false);
    }

    function toggleMenu() {
      if (isOpen()) closeMenu();
      else openMenu();
    }

    // Pointerdown är stabilare på mobil än click
    document.addEventListener(
      "pointerdown",
      function (e) {
        const t = e.target;

        // Öppna/stäng via hamburger
        if (t && t.closest && t.closest(".mnav-toggle")) {
          e.preventDefault();
          toggleMenu();
          return;
        }

        // Stäng via overlay eller element med data-mnav-close
        if (t && t.closest && t.closest("[data-mnav-close]")) {
          e.preventDefault();
          closeMenu();
          return;
        }

        // Stäng om man klickar på en länk i menyn
        if (t && t.closest && isOpen()) {
          const a = t.closest("#mnav-menu a");
          if (a) {
            closeMenu();
            return;
          }
        }
      },
      { passive: false }
    );

    // Esc stänger
    document.addEventListener("keydown", function (e) {
      if (!isOpen()) return;
      if (e.key === "Escape") {
        e.preventDefault();
        closeMenu();
      }
    });

    // Init aria
    setAria(false);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
