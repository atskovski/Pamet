/* Pamet v1.1.0 — account recovery, authenticator MFA, and device revocation UI. */
(function () {
  "use strict";
  const A = window.PametAuth;
  const esc = (value) => String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const headers = () => { const credential = A?.getBackendCredential?.(); return credential?.deviceKey ? { "Content-Type": "application/json", Authorization: `Bearer ${credential.deviceKey}` } : { "Content-Type": "application/json" }; };
  async function api(path, options = {}) { const response = await fetch(path, { ...options, headers: { ...headers(), ...(options.headers || {}) } }); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || "Pamet could not complete that request."); return body; }
  function dialog(title, content) { const layer = document.createElement("div"); layer.className = "modal-overlay security-overlay"; layer.innerHTML = `<section class="pamet-modal security-modal" role="dialog" aria-modal="true" aria-labelledby="securityTitle"><div class="pamet-modal-head"><h2 id="securityTitle" class="pamet-modal-title">${esc(title)}</h2><button class="pamet-close" type="button" aria-label="Close">×</button></div><div class="security-content">${content}</div></section>`; document.body.appendChild(layer); layer.querySelector(".pamet-close").onclick = () => layer.remove(); return layer; }
  async function manage() {
    const layer = dialog("Account security", `<p class="pamet-modal-sub">Review signed-in devices and add an authenticator app for extra protection.</p><div id="securityState">Loading…</div>`);
    const state = layer.querySelector("#securityState");
    try {
      const data = await api("/api/security/devices");
      state.innerHTML = `<div class="security-section"><h3>Authenticator</h3><p>${data.mfaEnabled ? "Authenticator protection is enabled." : "Add a six-digit authenticator code to account recovery."}</p><button class="btn btn-ghost" id="mfaAction">${data.mfaEnabled ? "Disable authenticator" : "Set up authenticator"}</button></div><div class="security-section"><h3>Authorized devices</h3>${data.devices.map((device) => `<div class="security-device"><div><strong>${esc(device.label)}</strong><small>${device.id === data.currentDeviceId ? "This device · " : ""}${esc(device.status)}</small></div>${device.status === "active" && device.id !== data.currentDeviceId ? `<button class="data-btn danger" data-revoke="${esc(device.id)}">Revoke</button>` : ""}</div>`).join("")}</div>`;
      state.querySelectorAll("[data-revoke]").forEach((button) => button.onclick = async () => { if (!confirm("Revoke this device? It will no longer be able to access account services.")) return; await api(`/api/security/devices/${encodeURIComponent(button.dataset.revoke)}`, { method: "DELETE" }); manage(); layer.remove(); });
      state.querySelector("#mfaAction").onclick = async () => {
        if (data.mfaEnabled) { const code = prompt("Enter the current six-digit authenticator code to disable MFA."); if (!code) return; await api("/api/security/mfa/disable", { method: "POST", body: JSON.stringify({ code }) }); manage(); layer.remove(); return; }
        const setup = await api("/api/security/mfa/setup", { method: "POST", body: "{}" });
        state.innerHTML = `<div class="security-section"><h3>Add to your authenticator app</h3><p>Use this setup key, then enter the six-digit code shown by your authenticator.</p><code class="security-secret">${esc(setup.secret)}</code><label>Verification code<input id="mfaCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6"></label><button class="btn btn-primary" id="confirmMfa">Confirm authenticator</button><p id="mfaStatus" role="alert"></p></div>`;
        state.querySelector("#confirmMfa").onclick = async () => { try { await api("/api/security/mfa/confirm", { method: "POST", body: JSON.stringify({ code: state.querySelector("#mfaCode").value }) }); layer.remove(); manage(); } catch (error) { state.querySelector("#mfaStatus").textContent = error.message; } };
      };
    } catch (error) { state.textContent = error.message; }
  }
  function addSettings() {
    const dataCard = document.querySelector("#exportCsv")?.closest(".settings-card"); if (!dataCard || document.querySelector("#securityCard")) return;
    const card = document.createElement("div"); card.className = "settings-card"; card.id = "securityCard"; card.innerHTML = `<p class="settings-section">Security and devices</p><div class="setting-row"><span class="setting-label">Account recovery, authenticator, and authorized devices</span><button class="btn btn-ghost" id="manageSecurity" type="button">Manage security</button></div><p class="notification-note security-note">Recovery links expire after 30 minutes. Device credentials can be revoked remotely.</p>`; dataCard.parentNode.insertBefore(card, dataCard); card.querySelector("#manageSecurity").onclick = manage;
  }
  function addRecovery() {
    const switcher = document.querySelector("#loginForm .welcome-switch"); if (!switcher || document.querySelector("#recoverAccount")) return;
    const button = document.createElement("button"); button.type = "button"; button.id = "recoverAccount"; button.className = "link-button recovery-button"; button.textContent = "Can’t access your account?"; switcher.after(button);
    button.onclick = async () => { const email = prompt("Enter your Pamet account email. If it matches an account, we’ll send a secure recovery link."); if (!email) return; await api("/api/account/recovery/request", { method: "POST", body: JSON.stringify({ email }) }); alert("If that email matches a Pamet account, a recovery link is on its way."); };
  }
  async function completeRecovery() {
    const token = new URLSearchParams(location.search).get("recover"); if (!token) return;
    const password = prompt("Create a new Pamet password for this device (at least 10 characters)."); if (!password) return;
    const code = prompt("If you enabled an authenticator, enter its six-digit code. Otherwise leave this blank.") || ""; const deviceKey = A.newDeviceCredential();
    try { const result = await api("/api/account/recovery/complete", { method: "POST", body: JSON.stringify({ token, deviceKey, deviceLabel: navigator.userAgentData?.platform || "Recovered browser", code }) }); await A.adoptRecovered({ profile: result.profile, deviceKey, password }); history.replaceState({}, "", location.pathname); location.reload(); }
    catch (error) { alert(error.message); }
  }
  window.addEventListener("load", () => { addSettings(); addRecovery(); completeRecovery(); document.querySelectorAll('.tab[data-tab="settings"]').forEach((tab) => tab.addEventListener("click", () => setTimeout(addSettings))); });
})();
