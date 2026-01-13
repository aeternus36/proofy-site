/* /assets/header-toggle.js
   Stänger <details class="mnav"> på:
   - klick på länk i menyn
   - ESC
   - klick utanför menyn
   HARDTEST/AUDIT:
   - injicerar scrim om saknas
   - låser body-scroll när meny är öppen (minskar dubbelhandling)
*/

(() => {
  function qsa(sel, root = document){ return Array.from(root.querySelectorAll(sel)); }

  function getMenus(){
    return qsa('details#mnav.mnav, details.mnav');
  }

  function ensureScrim(mnav){
    // Scrim måste ligga INUTI details så att CSS kan visa den via details[open] .mnavScrim
    // (men vi använder även JS för att toggla display för robusthet).
    let scrim = mnav.querySelector(':scope > .mnavScrim');
    if (!scrim) {
      scrim = document.createElement('div');
      scrim.className = 'mnavScrim';
      scrim.setAttribute('aria-hidden', 'true');
      // Lägg scrim först så den täcker sidan men ligger under menyn (z-index i CSS)
      mnav.prepend(scrim);
    }
    return scrim;
  }

  // Body scroll lock (restore exact previous value)
  let prevBodyOverflow = '';
  function anyMenuOpen(){
    return getMenus().some(m => m.open);
  }

  function lockBodyScroll(lock){
    try{
      if (lock){
        if (!prevBodyOverflow) prevBodyOverflow = document.body.style.overflow || '';
        document.body.style.overflow = 'hidden';
      } else {
        document.body.style.overflow = prevBodyOverflow;
        prevBodyOverflow = '';
      }
    }catch{
      // silent
    }
  }

  function syncOverlayState(){
    const open = anyMenuOpen();
    lockBodyScroll(open);

    // Säkerställ att scrim finns och är klickbar när meny är öppen
    getMenus().forEach((mnav) => {
      const scrim = ensureScrim(mnav);
      // JS-toggling som extra skydd om CSS inte laddats (eller överstyrts)
      scrim.style.display = mnav.open ? 'block' : 'none';
    });
  }

  function init(){
    // HARD: init ska vara idempotent även vid dubbelinladdning
    if (window.__proofyHeaderToggleInit) return;
    window.__proofyHeaderToggleInit = true;

    const menus = getMenus();
    if (!menus.length) return;

    // Förbered scrim + events per meny
    menus.forEach((mnav) => {
      const scrim = ensureScrim(mnav);

      // Stäng på länk-klick (lokalt per meny)
      qsa('.mnavMenu a', mnav).forEach(a => {
        a.addEventListener('click', () => { mnav.open = false; syncOverlayState(); });
      });

      // Stäng på scrim-klick
      scrim.addEventListener('click', (e) => {
        e.preventDefault();
        mnav.open = false;
        syncOverlayState();
      });

      // När details togglas (open/close) -> synka scroll-lås + scrim
      mnav.addEventListener('toggle', () => {
        syncOverlayState();
      });
    });

    // Stäng alla (re-query: hanterar ev. menyer som tillkommer senare)
    const closeAll = () => {
      getMenus().forEach(m => { m.open = false; });
      syncOverlayState();
    };

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeAll();
    });

    // Capture: robust även om andra komponenter stoppar bubbling
    document.addEventListener('click', (e) => {
      const menusNow = getMenus();
      if (!menusNow.length) return;

      if (!menusNow.some(m => m.open)) return;

      const target = e.target;
      if (!(target instanceof Node)) return;
      if (menusNow.some(m => m.contains(target))) return;

      closeAll();
    }, true);

    // Init state
    syncOverlayState();
  }

  // defensivt – nav-toggle ska aldrig kunna bryta resten av sidan
  try {
    if (typeof document === 'undefined') return;

    if (document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
      init();
    }
  } catch {
    // tyst fail
  }
})();
