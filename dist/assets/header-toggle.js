/* /assets/header-toggle.js
   Mobilmeny: togglar body.mnav-open + html.mnav-lock och sätter html[data-mnav-ready="1"]
*/

(() => {
  const MOBILE_MAX = 920;

  function qs(sel, root = document) {
    return root.querySelector(sel);
  }

  function qsa(sel, root = document) {
    return Array.from(root.querySelectorAll(sel));
  }

  function isMobile() {
    return window.matchMedia(`(max-width: ${MOBILE_MAX}px)`).matches;
  }

  function setExpanded(btn, expanded) {
    if (!btn) return;
    btn.setAttribute("aria-expanded", expanded ? "true" : "false");
  }

  function openMenu({ btn, htmlEl, bodyEl }) {
    bodyEl.classList.add("mnav-open");
    htmlEl.classList.add("mnav-lock");
    setExpanded(btn, true);
  }

  function closeMenu({ btn, htmlEl, bodyEl }) {
    bodyEl.classList.remove("mnav-open");
    htmlEl.classList.remove("mnav-lock");
    setExpanded(btn, false);
  }

  function toggleMenu(ctx) {
    const { bodyEl } = ctx;
    if (bodyEl.classList.contains("mnav-open")) closeMenu(ctx);
    else openMenu(ctx);
  }

  document.addEventListener("DOMContentLoaded", () => {
    const htmlEl = document.documentElement;
    const bodyEl = document.body;

    // Markera att CSS-komponenten får aktiveras
    htmlEl.setAttribute("data-mnav-ready", "1");

    const btn = qs(".mnav-toggle");
    const overlay = qs(".mnav-overlay");
    const drawer = qs(".mnav-drawer");

    // Om markup saknas: gör inget (men krascha inte)
    if (!btn || !overlay || !drawer) return;

    const ctx = { btn, htmlEl, bodyEl, overlay, drawer };

    // Toggle via hamburgare
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      if (!isMobile()) return; // på desktop: ignorera
      toggleMenu(ctx);
    });

    // Stäng på overlay
    overlay.addEventListener("click", (e) => {
      e.preventDefault();
      closeMenu(ctx);
    });

    // Stäng på alla element med data-mnav-close (ex close-knapp)
    qsa("[data-mnav-close]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        closeMenu(ctx);
      });
    });

    // Stäng med ESC
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeMenu(ctx);
    });

    // Om man klickar på en länk i menyn: stäng (bra UX)
    qsa(".mnav-drawer a").forEach((a) => {
      a.addEventListener("click", () => closeMenu(ctx));
    });

    // Om man roterar / resize till desktop: stäng menyn
    window.addEventListener("resize", () => {
      if (!isMobile()) closeMenu(ctx);
    });
  });
})();
