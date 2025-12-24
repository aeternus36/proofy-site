// /assets/header-toggle.js
(() => {
  function init(){
    const mnav = document.getElementById("mnav");
    if (!mnav) return;

    function close(){
      mnav.removeAttribute("open");
    }

    // Stäng när man klickar på en länk i menyn
    mnav.querySelectorAll("a").forEach(a => {
      a.addEventListener("click", close);
    });

    // Stäng på ESC
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
    });

    // Stäng om man klickar utanför
    document.addEventListener("click", (e) => {
      if (!mnav.hasAttribute("open")) return;
      if (!mnav.contains(e.target)) close();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
