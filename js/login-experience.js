/* Pamet v1.6.9 — authentication presentation, persistent-session preference, registration entry point, and rotating brand landscapes. */
(function () {
  "use strict";
  const welcome = document.querySelector("#welcome");
  const A = window.PametAuth;
  if (!welcome) return;

  function ensureRememberMe() {
    const loginForm = document.querySelector("#loginForm");
    const submit = loginForm?.querySelector('button[type="submit"]');
    if (!loginForm || !submit) return;

    let checkbox = loginForm.querySelector("#loginRemember");
    if (!checkbox) {
      const row = document.createElement("label");
      row.className = "remember-me-row";
      row.htmlFor = "loginRemember";

      checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = "loginRemember";
      checkbox.setAttribute("aria-describedby", "loginRememberHelp");

      const copy = document.createElement("span");
      copy.className = "remember-me-copy";
      const title = document.createElement("strong");
      title.textContent = "Remember me";
      const help = document.createElement("small");
      help.id = "loginRememberHelp";
      help.textContent = "Keep me signed in on this device for 30 days. Don’t use this on a shared device.";
      copy.append(title, help);
      row.append(checkbox, copy);
      submit.insertAdjacentElement("beforebegin", row);

      const rememberedEmail = A?.getRememberedEmail?.();
      const email = document.querySelector("#loginEmail");
      if (rememberedEmail && email) {
        email.value = rememberedEmail;
        checkbox.checked = true;
      }
    }

    const secure = document.querySelector("#welcomeSecure");
    if (secure && A?.isSecure) secure.textContent = "🔒 Sign-in uses a secure session. Pamet does not save your plain-text password in the browser.";
  }

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
    createLink.hidden = false;
    createLink.removeAttribute("hidden");
    createLink.setAttribute("aria-label", "Create a new Pamet account");
    ensureRememberMe();
  }

  if (A?.login && !A.__rememberMeLoginWrapped) {
    const originalLogin = A.login.bind(A);
    A.__rememberMeLoginWrapped = true;
    A.login = function loginWithRememberPreference(email, password, options = {}) {
      const checkbox = document.querySelector("#loginRemember");
      const rememberMe = Object.prototype.hasOwnProperty.call(options, "rememberMe") ? !!options.rememberMe : !!checkbox?.checked;
      return originalLogin(email, password, { ...options, rememberMe });
    };
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