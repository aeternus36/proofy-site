/* /assets/header-toggle.js */
(() => {
  const doc = document;
  const root = doc.documentElement;

  const q = (sel) => doc.querySelector(sel);

  const btn = q(".mnav-toggle");
  const drawer = q("#mnav-menu");
  const overlay = q(".mnav-overlay");

  // Markera ready ASAP (så CSS kan aktiveras utan att användaren klickar)
  root.setAttribute("data-mnav-ready", "1");

  if (!btn || !drawer || !overlay) return;

  const OPEN_CLASS = "mnav-open";
  const LOCK_CLASS = "mnav-lock";

  const isOpen = () => doc.body.classList.contains(OPEN_CLASS);

  const setAria = (open) => {
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  };

  const open = () => {
    if (isOpen()) return;
    doc.body.classList.add(OPEN_CLASS);
    root.classList.add(LOCK_CLASS);
    setAria(true);
  };

  const close = () => {
    if (!isOpen()) return;
    doc.body.classList.remove(OPEN_CLASS);
    root.classList.remove(LOCK_CLASS);
    setAria(false);
  };

  const toggle = () => (isOpen() ? close() : open());

  // Klick: toggle
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    toggle();
  });

  // Klick: stäng på overlay / stäng-knapp / [data-mnav-close]
  doc.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (t.matches("[data-mnav-close]")) close();
  });

  // Stäng när man klickar en länk i menyn (så chat-knappen inte "fastnar" i konstigt läge)
  drawer.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (t.closest("a")) close();
  });

  // ESC stänger
  doc.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  // Om man roterar / går till desktop-bredd: stäng och lås upp
  const mq = window.matchMedia("(min-width: 921px)");
  const handleMQ = () => {
    if (mq.matches) close();
  };

  if (typeof mq.addEventListener === "function") {
    mq.addEventListener("change", handleMQ);
  } else {
    mq.addListener(handleMQ);
  }

  // Säkerställ korrekt aria vid start
  setAria(false);
})();
