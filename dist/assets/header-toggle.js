// /assets/header-toggle.js
(() => {
  const mnav = document.getElementById("mnav");
  if (!mnav) return;

  const close = () => { mnav.open = false; };

  // Stäng när man klickar på en länk i menyn
  mnav.addEventListener("click", (e) => {
    const a = e.target && e.target.closest ? e.target.closest("a") : null;
    if (a) close();
  });

  // Stäng på ESC
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  // Stäng när man klickar utanför
  document.addEventListener("click", (e) => {
    if (!mnav.open) return;
    if (!mnav.contains(e.target)) close();
  });

  // Säkerhetsnät: om man byter till desktop-bredd, stäng
  window.addEventListener("resize", () => {
    if (window.innerWidth >= 921) close();
  });
})();
