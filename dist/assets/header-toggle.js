/* /assets/header-toggle.js
   Stänger <details class="mnav" id="mnav"> på:
   - klick på länk i menyn
   - ESC
   - klick utanför menyn
*/

(() => {
  function qs(sel, root = document){ return root.querySelector(sel); }
  function qsa(sel, root = document){ return Array.from(root.querySelectorAll(sel)); }

  function init(){
    // CHANGE: mer tolerant selector + stöd för flera headers (om sidan har fler än en nav)
    const candidates = qsa('details#mnav.mnav, details.mnav');
    if (!candidates.length) return; // inget att göra

    candidates.forEach((mnav) => {
      // Stäng på länk-klick
      qsa('.mnavMenu a', mnav).forEach(a => {
        a.addEventListener('click', () => { mnav.open = false; });
      });

      // Stäng på ESC
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') mnav.open = false;
      });

      // Stäng när man klickar utanför
      document.addEventListener('click', (e) => {
        if (!mnav.open) return;
        const target = e.target;
        if (target instanceof Node && !mnav.contains(target)) {
          mnav.open = false;
        }
      });
    });
  }

  // CHANGE: defensivt – undvik att kasta fel i udda miljöer (t.ex. om document saknas)
  try {
    if (typeof document === 'undefined') return;

    if (document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  } catch {
    // tyst fail: nav-toggle ska aldrig kunna bryta resten av sidan
  }
})();
