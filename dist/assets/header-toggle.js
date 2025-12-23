// /assets/header-toggle.js
(() => {
  const html = document.documentElement;
  const body = document.body;

  const toggle = document.querySelector('.mnav-toggle');
  const drawer = document.querySelector('.mnav-drawer');
  const overlay = document.querySelector('.mnav-overlay');
  const closers = document.querySelectorAll('[data-mnav-close]');

  if (!toggle || !drawer || !overlay) return;

  // Markera att menyn är redo
  html.setAttribute('data-mnav-ready', '1');

  const open = () => {
    body.classList.add('mnav-open');
    html.classList.add('mnav-lock');
    toggle.setAttribute('aria-expanded', 'true');
  };

  const close = () => {
    body.classList.remove('mnav-open');
    html.classList.remove('mnav-lock');
    toggle.setAttribute('aria-expanded', 'false');
  };

  toggle.addEventListener('click', open);
  overlay.addEventListener('click', close);
  closers.forEach(el => el.addEventListener('click', close));
})();
