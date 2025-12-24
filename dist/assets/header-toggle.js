(() => {
  const d = document;
  const details = d.getElementById("mnav");
  if (!details) return;

  function close() { details.open = false; }

  // Stäng vid klick på länk
  details.addEventListener("click", (e) => {
    const a = e.target && e.target.closest && e.target.closest("a");
    if (a) close();
  });

  // Stäng vid ESC
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  // Stäng när man klickar utanför
  d.addEventListener("click", (e) => {
    if (!details.open) return;
    if (!details.contains(e.target)) close();
  }, true);
})();
