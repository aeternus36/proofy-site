document.addEventListener("DOMContentLoaded", function () {
  const menu = document.getElementById("mainnav");
  const toggle = document.getElementById("menuToggle");

  if (menu && toggle) {
    toggle.addEventListener("click", () => {
      menu.classList.toggle("show");
    });
  }
});
