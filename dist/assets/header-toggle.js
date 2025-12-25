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
    const mnav = qs('details#mnav.mnav') || qs('details.mnav');
    if (!mnav) return;

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
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
