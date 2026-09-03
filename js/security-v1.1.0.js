/* Pamet v1.2.0 — account recovery, authenticator MFA, and device security UI. */
(function () {
  "use strict";
  const A = window.PametAuth;
  const esc = (value) => String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  let modalSequence = 0;

  async function api(path, options = {}) {
    const baseHeaders = { "Content-Type": "application/json", ...(options.headers || {}) };
    let response = await fetch(path, { credentials: "same-origin", ...options, headers: baseHeaders });
    // Cookie sessions are authoritative. A legacy device credential is used only
    // as a compatibility fallback while the account transitions to normal login.
    const credential = A?.getBackendCredential?.();
    if (response.status === 401 && credential?.deviceKey && !baseHeaders.Authorization) {
      response = await fetch(path, { credentials: "same-origin", ...options, headers: { ...baseHeaders, Authorization: `Bearer ${credential.deviceKey}` } });
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "Pamet could not complete that request.");
    return body;
  }

  function dialog(title, content, className = "") {
    const previousFocus = document.activeElement;
    const titleId = `pametDialogTitle${++modalSequence}`;
    const layer = document.createElement("div");
    layer.className = `pamet-modal-backdrop security-overlay ${className}`.trim();
    layer.innerHTML = `<section class="pamet-modal security-modal" role="dialog" aria-modal="true" aria-labelledby="${titleId}" tabindex="-1"><div class="pamet-modal-head"><div><h2 id="${titleId}" class="pamet-modal-title">${esc(title)}</h2></div><button class="pamet-close" type="button" aria-label="Close dialog">×</button></div><div class="security-content">${content}</div></section>`;
    document.body.appendChild(layer);
    document.body.classList.add("pamet-modal-open");
    const panel = layer.querySelector(".pamet-modal");
    const close = () => {
      if (!layer.isConnected) return;
      layer.remove();
      if (!document.querySelector(".pamet-modal-backdrop")) document.body.classList.remove("pamet-modal-open");
      if (previousFocus && typeof previousFocus.focus === "function") previousFocus.focus({ preventScroll: true });
    };
    layer.querySelector(".pamet-close").addEventListener("click", close);
    layer.addEventListener("click", (event) => { if (event.target === layer) close(); });
    layer.addEventListener("keydown", (event) => { if (event.key === "Escape") { event.preventDefault(); close(); } });
    layer.closePametDialog = close;
    requestAnimationFrame(() => panel.focus({ preventScroll: true }));
    return layer;
  }

  function statusMessage(root, message, isError = false) {
    const status = root.querySelector("[data-security-status]");
    if (!status) return;
    status.textContent = message || "";
    status.classList.toggle("error", !!isError);
    status.hidden = !message;
  }

  function deviceRows(data) {
    if (!Array.isArray(data.devices) || !data.devices.length) return `<p class="security-muted">No authorized devices are currently listed.</p>`;
    return data.devices.map((device) => `<div class="security-device"><div class="security-device-copy"><strong>${esc(device.label || "Pamet device")}</strong><small>${device.id === data.currentDeviceId ? "This device · " : ""}${esc(device.status || "active")}</small></div>${device.status === "active" && device.id !== data.currentDeviceId ? `<button class="data-btn danger security-revoke" type="button" data-revoke="${esc(device.id)}">Revoke</button>` : ""}</div>`).join("");
  }

  async function renderSecurityHome(layer) {
    const state = layer.querySelector("#securityState");
    if (!state) return;
    state.innerHTML = `<div class="security-loading" role="status">Loading account security…</div>`;
    try {
      const data = await api("/api/security/devices");
      state.innerHTML = `
        <section class="security-section security-summary">
          <div><span class="security-eyebrow">Authenticator</span><h3>${data.mfaEnabled ? "Two-step recovery is on" : "Add an authenticator"}</h3><p>${data.mfaEnabled ? "A current six-digit authenticator code is required for protected recovery actions." : "Use Google Authenticator, Microsoft Authenticator, 1Password, Authy, or another TOTP-compatible app for an extra recovery check."}</p></div>
          <button class="btn ${data.mfaEnabled ? "btn-ghost" : "btn-primary"}" id="mfaAction" type="button">${data.mfaEnabled ? "Manage authenticator" : "Set up authenticator"}</button>
        </section>
        <section class="security-section">
          <div class="security-section-head"><div><span class="security-eyebrow">Sessions and devices</span><h3>Authorized devices</h3></div><button class="btn btn-ghost security-signout-all" id="signOutAllSessions" type="button">Sign out everywhere</button></div>
          <p class="security-muted">Revoking a device stops its legacy device credential. “Sign out everywhere” revokes every active server session, including this one.</p>
          <div class="security-device-list">${deviceRows(data)}</div>
        </section>
        <p data-security-status class="security-inline-status" role="status" aria-live="polite" hidden></p>`;

      state.querySelectorAll("[data-revoke]").forEach((button) => button.addEventListener("click", async () => {
        if (!confirm("Revoke this device? It will no longer be able to access Pamet account services.")) return;
        button.disabled = true;
        try {
          await api(`/api/security/devices/${encodeURIComponent(button.dataset.revoke)}`, { method: "DELETE" });
          await renderSecurityHome(layer);
        } catch (error) {
          button.disabled = false;
          statusMessage(state, error.message, true);
        }
      }));

      state.querySelector("#mfaAction").addEventListener("click", () => data.mfaEnabled ? showMfaDisable(layer) : showMfaSetup(layer));
      state.querySelector("#signOutAllSessions").addEventListener("click", async () => {
        if (!confirm("Sign out of every Pamet session? You will need to log in again on this device.")) return;
        const button = state.querySelector("#signOutAllSessions");
        button.disabled = true;
        try {
          await A.endAllSessions();
          layer.closePametDialog();
          location.reload();
        } catch (error) {
          button.disabled = false;
          statusMessage(state, error.message || "Pamet could not sign out all sessions.", true);
        }
      });
    } catch (error) {
      state.innerHTML = `<div class="security-error-state" role="alert"><strong>Account security is temporarily unavailable.</strong><p>${esc(error.message)}</p><button class="btn btn-ghost" id="retrySecurity" type="button">Try again</button></div>`;
      state.querySelector("#retrySecurity").addEventListener("click", () => renderSecurityHome(layer));
    }
  }

  async function showMfaSetup(layer) {
    const state = layer.querySelector("#securityState");
    state.innerHTML = `<div class="security-loading" role="status">Generating a fresh authenticator setup…</div>`;
    try {
      // The backend rotates the pending secret on every setup request. Until the
      // user confirms a valid TOTP, the new secret is not enabled as MFA.
      const setup = await api("/api/security/mfa/setup", { method: "POST", body: "{}" });
      let qrMarkup = "";
      try { qrMarkup = window.PametQr?.svg(setup.otpauthUri) || ""; } catch (error) { console.warn("mfa_qr_generation_failed", error); }
      state.innerHTML = `
        <section class="security-section mfa-setup">
          <button type="button" class="security-back" id="securityBack">← Account security</button>
          <div class="mfa-setup-head"><span class="security-eyebrow">Fresh setup</span><h3>Scan with your authenticator app</h3><p>Each time you start setup, Pamet creates a new secret. Scan this QR code, then enter the six-digit code shown in your authenticator to confirm it.</p></div>
          ${qrMarkup ? `<div class="security-qr">${qrMarkup}</div>` : `<div class="security-qr-fallback">QR rendering is unavailable in this browser. Use the setup key below.</div>`}
          <div class="security-key-block"><span>Setup key</span><code class="security-secret">${esc(setup.secret)}</code></div>
          <form id="mfaConfirmForm" class="pamet-form mfa-confirm-form">
            <label>Verification code<input id="mfaCode" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" maxlength="6" aria-describedby="mfaCodeHint" required></label>
            <small id="mfaCodeHint" class="security-muted">Enter the current six-digit code from your authenticator app.</small>
            <button class="btn btn-primary btn-block" type="submit">Confirm authenticator</button>
            <p data-security-status class="security-inline-status" role="alert" aria-live="assertive" hidden></p>
          </form>
        </section>`;
      state.querySelector("#securityBack").addEventListener("click", () => renderSecurityHome(layer));
      const form = state.querySelector("#mfaConfirmForm");
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const submit = form.querySelector('button[type="submit"]');
        const code = state.querySelector("#mfaCode").value.trim();
        submit.disabled = true;
        try {
          await api("/api/security/mfa/confirm", { method: "POST", body: JSON.stringify({ code }) });
          await renderSecurityHome(layer);
        } catch (error) {
          submit.disabled = false;
          statusMessage(state, error.message, true);
          state.querySelector("#mfaCode").select();
        }
      });
      state.querySelector("#mfaCode").focus();
    } catch (error) {
      state.innerHTML = `<div class="security-error-state" role="alert"><strong>Pamet could not start authenticator setup.</strong><p>${esc(error.message)}</p><button type="button" class="btn btn-ghost" id="securityBack">Back</button></div>`;
      state.querySelector("#securityBack").addEventListener("click", () => renderSecurityHome(layer));
    }
  }

  function showMfaDisable(layer) {
    const state = layer.querySelector("#securityState");
    state.innerHTML = `
      <section class="security-section">
        <button type="button" class="security-back" id="securityBack">← Account security</button>
        <span class="security-eyebrow">Authenticator</span><h3>Disable authenticator protection?</h3>
        <p>Enter a current six-digit code. This keeps a stolen session from turning off your recovery protection without the authenticator.</p>
        <form id="mfaDisableForm" class="pamet-form">
          <label>Current authenticator code<input id="disableMfaCode" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" maxlength="6" required></label>
          <button class="btn btn-primary btn-block" type="submit">Disable authenticator</button>
          <p data-security-status class="security-inline-status" role="alert" hidden></p>
        </form>
      </section>`;
    state.querySelector("#securityBack").addEventListener("click", () => renderSecurityHome(layer));
    const form = state.querySelector("#mfaDisableForm");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      try {
        await api("/api/security/mfa/disable", { method: "POST", body: JSON.stringify({ code: state.querySelector("#disableMfaCode").value.trim() }) });
        await renderSecurityHome(layer);
      } catch (error) {
        submit.disabled = false;
        statusMessage(state, error.message, true);
      }
    });
    state.querySelector("#disableMfaCode").focus();
  }

  async function manage() {
    const layer = dialog("Account security", `<p class="pamet-modal-sub security-intro">Review signed-in devices, revoke access, and add an authenticator app for extra protection.</p><div id="securityState"></div>`);
    await renderSecurityHome(layer);
  }

  function addSettings() {
    const dataCard = document.querySelector("#exportCsv")?.closest(".settings-card");
    if (!dataCard || document.querySelector("#securityCard")) return;
    const card = document.createElement("div");
    card.className = "settings-card";
    card.id = "securityCard";
    card.innerHTML = `<p class="settings-section">Security and devices</p><div class="setting-row security-setting-row"><span class="setting-label">Account recovery, authenticator, sessions, and authorized devices</span><button class="btn btn-ghost" id="manageSecurity" type="button">Manage security</button></div><p class="notification-note security-note">Recovery links expire after 30 minutes. You can revoke old devices and sign out every active session from one place.</p>`;
    dataCard.parentNode.insertBefore(card, dataCard);
    card.querySelector("#manageSecurity").addEventListener("click", manage);
  }

  function addRecovery() {
    const switcher = document.querySelector("#loginForm .welcome-switch");
    if (!switcher) return;
    switcher.hidden = false;
    const createLink = switcher.querySelector("#showRegister");
    if (createLink) createLink.hidden = false;
    if (document.querySelector("#recoverAccount")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.id = "recoverAccount";
    button.className = "link-button recovery-button";
    button.textContent = "Reset your password";
    switcher.after(button);
    button.addEventListener("click", () => {
      const layer = dialog("Reset your password", `<form id="resetRequestForm" class="pamet-form recovery-form"><p class="pamet-modal-sub">Enter your account email. If it matches a Pamet account, we’ll send a secure link that expires in 30 minutes.</p><label>Email<input id="resetEmail" type="email" inputmode="email" autocomplete="email" required></label><button class="btn btn-primary btn-block" type="submit">Send reset link</button><p id="resetRequestStatus" class="security-inline-status" role="status" aria-live="polite"></p></form>`, "recovery-overlay");
      const form = layer.querySelector("#resetRequestForm");
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        // Capture the form before awaiting. event.currentTarget is intentionally
        // not referenced after await because browsers clear it after dispatch.
        const submittedForm = event.currentTarget;
        const submit = submittedForm.querySelector('button[type="submit"]');
        const status = layer.querySelector("#resetRequestStatus");
        submit.disabled = true;
        try {
          await api("/api/account/recovery/request", { method: "POST", body: JSON.stringify({ email: layer.querySelector("#resetEmail").value }) });
          status.textContent = "If that email matches a Pamet account, a reset link is on its way.";
          submittedForm.reset();
        } catch (error) {
          status.textContent = error.message;
        } finally {
          submit.disabled = false;
        }
      });
      layer.querySelector("#resetEmail").focus();
    });
  }

  async function completeRecovery() {
    const token = new URLSearchParams(location.search).get("recover");
    if (!token) return;
    const layer = dialog("Choose a new password", `<form id="resetCompleteForm" class="pamet-form recovery-form"><p class="pamet-modal-sub">This link can be used once. Your other signed-in sessions will be revoked.</p><label>New password<input id="resetPassword" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label><label>Confirm password<input id="resetConfirm" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label><label>Authenticator code <span>(if enabled)</span><input id="resetCode" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" maxlength="6"></label><button class="btn btn-primary btn-block" type="submit">Reset password</button><p id="resetCompleteStatus" class="security-inline-status" role="alert" aria-live="assertive"></p></form>`, "recovery-overlay");
    const form = layer.querySelector("#resetCompleteForm");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submittedForm = event.currentTarget;
      const password = layer.querySelector("#resetPassword").value;
      const status = layer.querySelector("#resetCompleteStatus");
      if (password !== layer.querySelector("#resetConfirm").value) { status.textContent = "Passwords do not match."; return; }
      const submit = submittedForm.querySelector('button[type="submit"]');
      submit.disabled = true;
      try {
        const result = await api("/api/account/recovery/complete", { method: "POST", body: JSON.stringify({ token, password, code: layer.querySelector("#resetCode").value.trim() }) });
        await A.adoptReset({ profile: result.profile, password });
        history.replaceState({}, "", location.pathname);
        location.reload();
      } catch (error) {
        status.textContent = error.message;
        submit.disabled = false;
      }
    });
    layer.querySelector("#resetPassword").focus();
  }

  function initialize() {
    addSettings(); addRecovery(); completeRecovery();
    document.querySelectorAll('.tab[data-tab="settings"]').forEach((tab) => tab.addEventListener("click", () => setTimeout(addSettings)));
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();
