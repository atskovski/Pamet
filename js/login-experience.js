/* Pamet v1.6.3 — authentication presentation, registration entry point, and rotating brand landscapes. */
(function () {
  "use strict";
  const welcome = document.querySelector("#welcome");
  if (!welcome) return;

  function ensureRegistrationEntry() {
    const loginForm = document.querySelector("#loginForm");
    const registerForm = document.querySelector("#registerForm");
    if (!loginForm || !registerForm) return;

    let switcher = loginForm.querySelector(".welcome-switch");
    let createLink = loginForm.querySelector("#showRegister");

    if (!switcher) {
      switcher = document.createElement("p");
      switcher.className = "welcome-switch";
      const submit = loginForm.querySelector('button[type="submit"]');
      if (submit) submit.insertAdjacentElement("afterend", switcher);
      else loginForm.appendChild(switcher);
    }

    if (!createLink) {
      switcher.textContent = "Don’t have an account? ";
      createLink = document.createElement("a");
      createLink.href = "#";
      createLink.id = "showRegister";
      createLink.textContent = "Create an account";
      switcher.appendChild(createLink);
      createLink.addEventListener("click", (event) => {
        event.preventDefault();
        registerForm.reset();
        loginForm.hidden = true;
        registerForm.hidden = false;
      });
    } else {
      createLink.textContent = "Create an account";
    }

    switcher.hidden = false;
    switcher.removeAttribute("hidden");
    switcher.style.display = "block";
    createLink.hidden = false;
    createLink.removeAttribute("hidden");
    createLink.setAttribute("aria-label", "Create a new Pamet account");
  }

  const scenes = ["login-sunrise.jpg", "login-dusk.jpg", "login-morning.jpg"];
  let index = Number(sessionStorage.getItem("pamet_login_scene_v105") || -1);
  function rotateScene() {
    index = (index + 1) % scenes.length;
    sessionStorage.setItem("pamet_login_scene_v105", String(index));
    welcome.style.setProperty("--login-scene", `url("/assets/${scenes[index]}")`);
    ensureRegistrationEntry();
  }

  ensureRegistrationEntry();
  queueMicrotask(ensureRegistrationEntry);
  window.addEventListener("pageshow", ensureRegistrationEntry);
  window.addEventListener("pamet:logout", rotateScene);
  rotateScene();
})();