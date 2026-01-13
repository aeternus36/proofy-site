/* /assets/header-toggle.js
   Stänger <details class="mnav" id="mnav"> på:
   - klick på länk i menyn
   - ESC
   - klick utanför menyn
*/

(() => {
  function qsa(sel, root = document){ return Array.from(root.querySelectorAll(sel)); }

  function getMenus(){
    return qsa('details#mnav.mnav, details.mnav');
  }

  function init(){
    // HARD: init ska vara idempotent även vid dubbelinladdning
    if (window.__proofyHeaderToggleInit) return;
    window.__proofyHeaderToggleInit = true;

    const menus = getMenus();
    if (!menus.length) return;

    // Stäng på länk-klick (lokalt per meny)
    menus.forEach((mnav) => {
      qsa('.mnavMenu a', mnav).forEach(a => {
        a.addEventListener('click', () => { mnav.open = false; });
      });
    });

    // Stäng alla (re-query: hanterar ev. menyer som tillkommer senare)
    const closeAll = () => {
      getMenus().forEach(m => { m.open = false; });
    };

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeAll();
    });

    // Capture: robust även om andra komponenter stoppar bubbling
    document.addEventListener('click', (e) => {
      const menusNow = getMenus();
      if (!menusNow.length) return;

      // stäng bara om någon är öppen och man klickar utanför alla
      if (!menusNow.some(m => m.open)) return;

      const target = e.target;
      if (!(target instanceof Node)) return;
      if (menusNow.some(m => m.contains(target))) return;

      closeAll();
    }, true);
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
