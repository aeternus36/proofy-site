// header-toggle.js

document.addEventListener("DOMContentLoaded", function () {
  const toggle = document.getElementById("menuToggle");
  const menu = document.getElementById("mainnav");

  toggle.addEventListener("click", function () {
    menu.classList.toggle("active");
  });
});
