/* /assets/header-toggle.js
   Stänger <details class="mnav" id="mnav"> på:
   - klick på länk i menyn
   - ESC
   - klick utanför menyn
*/

(() => {
  function qsa(sel, root = document){ return Array.from(root.querySelectorAll(sel)); }

  function init(){
    const menus = qsa('details#mnav.mnav, details.mnav');
    if (!menus.length) return;

    // Stäng på länk-klick (lokalt per meny)
    menus.forEach((mnav) => {
      qsa('.mnavMenu a', mnav).forEach(a => {
        a.addEventListener('click', () => { mnav.open = false; });
      });
    });

    // CHANGE: globala listeners registreras bara en gång
    const closeAll = () => menus.forEach(m => { m.open = false; });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeAll();
    });

    document.addEventListener('click', (e) => {
      // stäng bara om någon är öppen och man klickar utanför alla
      if (!menus.some(m => m.open)) return;
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (menus.some(m => m.contains(target))) return;
      closeAll();
    });
  }

  // CHANGE: defensivt – nav-toggle ska aldrig kunna bryta resten av sidan
  try {
    if (typeof document === 'undefined') return;

    if (document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  } catch {
    // tyst fail
  }
})();
