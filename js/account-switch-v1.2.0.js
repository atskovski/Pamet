/* Pamet v1.2.0 — explicit, privacy-safe account switching on shared browsers. */
(function () {
  "use strict";
  const A = window.PametAuth;
  const S = window.PametStore;
  if (!A || !S) return;

  const originalLogin = A.login.bind(A);
  A.login = async function guardedLogin(email, password) {
    const existing = A.getUser && A.getUser();
    const normalized = String(email || "").trim().toLowerCase();
    if (existing && !A.isAuthed() && String(existing.email || "").toLowerCase() !== normalized) {
      throw new Error("This browser still contains local Pamet data for another account. Choose “Use a different account” first so health data is not mixed between accounts.");
    }
    return originalLogin(email, password);
  };

  function initialize() {
    const loginForm = document.querySelector("#loginForm");
    const registerLink = document.querySelector("#showRegister");
    if (!loginForm || !registerLink || document.querySelector("#switchLocalAccount")) return;

    const switchButton = document.createElement("button");
    switchButton.id = "switchLocalAccount";
    switchButton.type = "button";
    switchButton.className = "link-button account-switch-button";
    switchButton.textContent = "Use a different account";
    switchButton.hidden = !A.hasAccount() || A.isAuthed();
    const recovery = document.querySelector("#recoverAccount");
    (recovery || loginForm.querySelector(".welcome-switch")).after(switchButton);

    switchButton.addEventListener("click", () => {
      const user = A.getUser && A.getUser();
      const label = user?.email ? ` for ${user.email}` : "";
      const ok = confirm(`This browser still contains local Pamet health data${label}. To use a different account safely, Pamet must remove that local data and the saved account identity from this browser. Export anything you need first. Continue?`);
      if (!ok) return;
      S.wipeAll();
      A.deleteLocalAccount();
      document.querySelector("#loginForm")?.reset();
      document.querySelector("#registerForm")?.reset();
      switchButton.hidden = true;
      document.querySelector("#loginEmail")?.focus();
    });

    // Creating a different account has the same isolation requirement. Intercept
    // before app.js switches forms so old local health data can never bleed into
    // the new account.
    registerLink.addEventListener("click", (event) => {
      if (!A.hasAccount() || A.isAuthed()) return;
      const user = A.getUser && A.getUser();
      const label = user?.email ? ` for ${user.email}` : "";
      const ok = confirm(`This browser still contains local Pamet health data${label}. Creating a different account will remove that local data from this browser. Export anything you need first. Continue?`);
      if (!ok) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      S.wipeAll();
      A.deleteLocalAccount();
      switchButton.hidden = true;
    }, true);

    window.addEventListener("pamet:logout", () => { switchButton.hidden = !A.hasAccount(); });
    window.addEventListener("pamet:logout-all", () => { switchButton.hidden = !A.hasAccount(); });
    window.addEventListener("pamet:login", () => { switchButton.hidden = true; });
    window.addEventListener("pamet:registered", () => { switchButton.hidden = true; });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();
