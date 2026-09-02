/* Pamet v1.1.0 — profiles, appointment preparation, longitudinal summaries, and advanced sharing. */
(function () {
  "use strict";
  const S = window.PametStore;
  const A = window.PametAuth;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  if (!S || !A) return;

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const paid = () => ["pro", "ultra"].includes(S.settings.plan);
  const ultra = () => S.settings.plan === "ultra";
  const average = (values) => values.length ? values.reduce((sum, value) => sum + (+value || 0), 0) / values.length : 0;

  function toast(message, error = false) {
    let item = $(".pamet-toast");
    if (item) item.remove();
    item = document.createElement("div");
    item.className = "pamet-toast" + (error ? " error" : "");
    item.textContent = message;
    document.body.appendChild(item);
    setTimeout(() => item.remove(), 3500);
  }

  function modal(content) {
    let root = $("#phase2ModalRoot");
    if (!root) { root = document.createElement("div"); root.id = "phase2ModalRoot"; document.body.appendChild(root); }
    root.innerHTML = `<div class="pamet-modal-backdrop"><section class="pamet-modal phase2-modal" role="dialog" aria-modal="true">${content}</section></div>`;
    root.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => { root.innerHTML = ""; }));
    root.querySelector(".pamet-modal-backdrop").addEventListener("click", (event) => { if (event.target === event.currentTarget) root.innerHTML = ""; });
    return root;
  }

  function credential() { return A.getBackendCredential ? A.getBackendCredential() : null; }
  async function api(path, options = {}) {
    const auth = credential();
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (auth?.deviceKey) headers.Authorization = `Bearer ${auth.deviceKey}`;
    const response = await fetch(path, { ...options, headers });
    const text = await response.text();
    let body = {}; try { body = text ? JSON.parse(text) : {}; } catch { body = { error: text }; }
    if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
    return body;
  }

  function upgradeNudge(feature) {
    const root = modal(`<div class="pamet-modal-head"><div><h2 class="pamet-modal-title">${esc(feature)} is included with Ultra</h2><p class="pamet-modal-sub">Ultra is designed for family profiles, coordinated care, and appointment preparation. Pro remains the best fit for individual tracking and insights.</p></div><button class="pamet-close" data-close aria-label="Close">×</button></div><button class="btn btn-primary btn-block" id="phase2SeePlans">See Pro &amp; Ultra</button>`);
    root.querySelector("#phase2SeePlans").addEventListener("click", () => { root.innerHTML = ""; $("#upgradeBtn")?.click(); });
  }

  function manageProfiles() {
    if (!ultra()) return upgradeNudge("Multi-profile management");
    const render = () => {
      const active = S.activeProfile;
      const root = modal(`<div class="pamet-modal-head"><div><h2 class="pamet-modal-title">Profiles</h2><p class="pamet-modal-sub">Keep each person’s health history separate on this device. The active profile receives new entries.</p></div><button class="pamet-close" data-close aria-label="Close">×</button></div><div class="phase2-profile-list">${S.profiles.map((profile) => `<div class="phase2-profile-row${profile.id === active.id ? " active" : ""}"><button type="button" data-switch-profile="${esc(profile.id)}"><strong>${esc(profile.name)}</strong><small>${esc(profile.relationship)}${profile.id === active.id ? " · Active" : ""}</small></button>${profile.id !== "primary" ? `<button type="button" class="pamet-text-button" data-delete-profile="${esc(profile.id)}">Remove</button>` : ""}</div>`).join("")}</div><form id="addProfileForm" class="pamet-form phase2-add-profile"><h3>Add a profile</h3><label>Profile name<input id="phase2ProfileName" maxlength="80" required placeholder="Name or label"></label><label>Relationship<select id="phase2Relationship"><option>Child</option><option>Parent</option><option>Partner</option><option>Other</option></select></label><button class="btn btn-primary">Add profile</button></form>`);
      root.querySelectorAll("[data-switch-profile]").forEach((button) => button.addEventListener("click", () => { if (S.switchProfile(button.dataset.switchProfile)) location.reload(); }));
      root.querySelectorAll("[data-delete-profile]").forEach((button) => button.addEventListener("click", () => { const profile = S.profiles.find((item) => item.id === button.dataset.deleteProfile); if (profile && confirm(`Remove ${profile.name} and all entries stored for this profile?`)) { S.removeProfile(profile.id); render(); } }));
      root.querySelector("#addProfileForm").addEventListener("submit", (event) => { event.preventDefault(); const profile = S.addProfile(root.querySelector("#phase2ProfileName").value, root.querySelector("#phase2Relationship").value); if (!profile) return toast("Profile could not be added.", true); toast(`${profile.name} added`); render(); });
    };
    render();
  }

  function periodSummary(days = 90) {
    const now = Date.now();
    const currentStart = now - days * 86400000;
    const previousStart = now - days * 2 * 86400000;
    const current = S.entries.filter((entry) => +new Date(entry.date) >= currentStart);
    const previous = S.entries.filter((entry) => +new Date(entry.date) >= previousStart && +new Date(entry.date) < currentStart);
    const counts = (entries) => entries.reduce((out, entry) => { (entry.symptoms || []).forEach((symptom) => { out[symptom] = (out[symptom] || 0) + 1; }); return out; }, {});
    const currentCounts = counts(current), previousCounts = counts(previous);
    const names = [...new Set([...Object.keys(currentCounts), ...Object.keys(previousCounts)])].sort((a, b) => (currentCounts[b] || 0) - (currentCounts[a] || 0)).slice(0, 6);
    const loggedDays = (entries) => new Set(entries.map((entry) => String(entry.date).slice(0, 10))).size;
    return { current, previous, names, currentCounts, previousCounts, currentDays: loggedDays(current), previousDays: loggedDays(previous), currentSeverity: average(current.map((entry) => entry.severity)), previousSeverity: average(previous.map((entry) => entry.severity)) };
  }

  function longitudinalAnalysis() {
    if (!ultra()) return upgradeNudge("Longitudinal analysis");
    const data = periodSummary(90);
    const strength = data.currentDays >= 30 && data.previousDays >= 30 ? "Strong" : data.currentDays >= 10 && data.previousDays >= 10 ? "Developing" : "Limited";
    modal(`<div class="pamet-modal-head"><div><h2 class="pamet-modal-title">Longitudinal analysis</h2><p class="pamet-modal-sub">Recent 90 days compared with the previous 90 days for ${esc(S.activeProfile.name)}.</p></div><button class="pamet-close" data-close aria-label="Close">×</button></div><div class="phase2-strength"><strong>Data strength: ${strength}</strong><span>${data.currentDays} recent logged days · ${data.previousDays} comparison days</span></div><div class="phase2-stat-grid"><div><strong>${data.currentDays}</strong><span>Recent logged days</span></div><div><strong>${data.currentSeverity.toFixed(1)}/10</strong><span>Average severity</span></div></div><div class="phase2-comparison">${data.names.length ? data.names.map((name) => { const current = data.currentCounts[name] || 0, previous = data.previousCounts[name] || 0, difference = current - previous; return `<div><strong>${esc(name)}</strong><span>${current} recent vs ${previous} previous · ${difference === 0 ? "stable" : difference > 0 ? `recorded ${difference} more time${difference === 1 ? "" : "s"}` : `recorded ${Math.abs(difference)} fewer time${difference === -1 ? "" : "s"}`}</span></div>`; }).join("") : `<p>Keep logging to build a comparison. Pamet needs entries in both periods.</p>`}</div><p class="pamet-reassurance">These are observations from user-recorded information. They do not establish cause, diagnosis, or treatment effect.</p>`);
  }

  function appointmentPrep() {
    if (!ultra()) return upgradeNudge("Appointment preparation");
    const report = S.report(), data = periodSummary(30);
    const questions = [];
    if (data.names[0]) questions.push(`What context would help explain the change in ${data.names[0]}?`);
    if (report.medications?.length) questions.push("Should we review the medications and supplements I recorded?");
    questions.push("What changes should I track before the next visit?");
    modal(`<div class="pamet-modal-head"><div><h2 class="pamet-modal-title">Appointment preparation</h2><p class="pamet-modal-sub">A discussion guide based on ${esc(S.activeProfile.name)}’s recorded history.</p></div><button class="pamet-close" data-close aria-label="Close">×</button></div><section class="phase2-prep"><h3>Bring to the visit</h3><ul><li>Your top concerns in priority order</li><li>When the change began and how often it appears</li><li>Your current medication list and recent changes</li><li>Questions you do not want to forget</li></ul><h3>Recorded changes to discuss</h3>${data.names.length ? `<ul>${data.names.slice(0, 4).map((name) => `<li><strong>${esc(name)}</strong>: ${data.currentCounts[name] || 0} recent vs ${data.previousCounts[name] || 0} previous logged days</li>`).join("")}</ul>` : `<p>There is not enough recorded history for a period comparison yet.</p>`}<h3>Questions to consider</h3><ul>${questions.map((question) => `<li>${esc(question)}</li>`).join("")}</ul></section><p class="pamet-reassurance">Pamet organizes what you recorded. It does not recommend diagnoses, tests, or treatments.</p>`);
  }

  function advancedVisitBrief() {
    if (!ultra()) return upgradeNudge("Advanced Visit Briefs");
    const report = S.report(), data = periodSummary(90);
    const printWindow = window.open("", "_blank");
    if (!printWindow) return toast("Allow pop-ups to open the Visit Brief.", true);
    printWindow.opener = null;
    const rows = (items) => items.map((item) => `<tr><th>${esc(item[0])}</th><td>${esc(item[1])}</td></tr>`).join("");
    printWindow.document.write(`<!doctype html><html><head><title>Pamet Advanced Visit Brief</title><style>body{font-family:Arial,sans-serif;color:#263638;margin:36px auto;max-width:760px;padding:0 20px}header{border-bottom:4px solid #4CAF7A;padding-bottom:16px}h1{color:#0F3D3E;margin:0}h2{font-size:18px;margin-top:26px}table{width:100%;border-collapse:collapse}th,td{text-align:left;vertical-align:top;border-bottom:1px solid #DDE3DF;padding:9px}th{width:38%}.notice{background:#EEF6FA;border:1px solid #CFE1EE;padding:12px;border-radius:10px;font-size:12px}.meta{color:#5B6B73;font-size:12px}@media print{button{display:none}}</style></head><body><header><h1>Advanced Visit Brief</h1><p>${esc(S.activeProfile.name)} · ${esc(report.rangeLabel)}</p></header><div class="notice">Generated from information recorded by the user for discussion with a healthcare professional. This is not a diagnosis or clinical assessment.</div><h2>Overview</h2><table>${rows(report.overview || [])}</table><h2>90-day comparison</h2><table>${rows(data.names.map((name) => [name, `${data.currentCounts[name] || 0} recent vs ${data.previousCounts[name] || 0} previous logged days`]))}</table>${report.medications?.length ? `<h2>Medications recorded</h2><table>${rows(report.medications)}</table>` : ""}${report.notes?.length ? `<h2>Recent notes</h2>${report.notes.slice(0, 8).map((note) => `<p><strong>${esc(note.date)}</strong><br>${esc(note.notes)}</p>`).join("")}` : ""}<p class="meta">Created ${esc(new Date().toLocaleString())}. Pamet observes; Pamet does not diagnose.</p><button onclick="window.print()">Print / Save PDF</button></body></html>`);
    printWindow.document.close();
  }

  async function advancedSharing() {
    if (!ultra()) return upgradeNudge("Advanced caregiver permissions");
    const root = modal(`<div class="pamet-modal-head"><div><h2 class="pamet-modal-title">Advanced sharing</h2><p class="pamet-modal-sub">Choose the profile, permission, and expiration for a revocable link.</p></div><button class="pamet-close" data-close aria-label="Close">×</button></div><form id="phase2ShareForm" class="pamet-form"><label>Recipient name<input id="phase2ShareName" required maxlength="100"></label><label>Email<input id="phase2ShareEmail" type="email" required maxlength="254"></label><label>Permission<select id="phase2SharePermission"><option value="view">View summary</option><option value="download">View and download summary</option></select></label><label>Link expires<select id="phase2ShareExpiry"><option value="7">7 days</option><option value="14">14 days</option><option value="30" selected>30 days</option><option value="90">90 days</option></select></label><label><span><input id="phase2IncludeNotes" type="checkbox" style="width:auto;margin-right:6px"> Include recent notes</span></label><div class="pamet-form-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary">Send invitation</button></div></form>`);
    root.querySelector("#phase2ShareForm").addEventListener("submit", async (event) => {
      event.preventDefault(); const report = S.report();
      try { await api("/api/sharing/invites", { method: "POST", body: JSON.stringify({ kind: "caregiver", name: root.querySelector("#phase2ShareName").value, email: root.querySelector("#phase2ShareEmail").value, permission: root.querySelector("#phase2SharePermission").value, expiresInDays: +root.querySelector("#phase2ShareExpiry").value, profileName: S.activeProfile.name, snapshot: { generatedAt: new Date().toISOString(), rangeLabel: report.rangeLabel, overview: report.overview, symptoms: report.breakdown, patterns: report.patterns, medications: report.medications, notes: root.querySelector("#phase2IncludeNotes").checked ? report.notes : [], disclaimer: "Generated from information recorded by the user. This is not a medical diagnosis or clinical assessment." } }) }); root.innerHTML = ""; toast("Secure invitation sent."); } catch (error) { toast(error.message, true); }
    });
  }

  function changePasswordDialog() {
    const root = modal(`<div class="pamet-modal-head"><div><h2 class="pamet-modal-title">Change password</h2><p class="pamet-modal-sub">Your password protects this device-local Pamet account.</p></div><button class="pamet-close" data-close aria-label="Close">×</button></div><form id="phase2PasswordForm" class="pamet-form"><label>Current password<input id="phase2OldPassword" type="password" autocomplete="current-password" required maxlength="128"></label><label>New password<input id="phase2NewPassword" type="password" autocomplete="new-password" minlength="10" maxlength="128" required></label><label>Confirm new password<input id="phase2ConfirmPassword" type="password" autocomplete="new-password" minlength="10" maxlength="128" required></label><div class="pamet-form-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary">Update password</button></div></form>`);
    root.querySelector("#phase2PasswordForm").addEventListener("submit", async (event) => { event.preventDefault(); const next = root.querySelector("#phase2NewPassword").value; if (next !== root.querySelector("#phase2ConfirmPassword").value) return toast("New passwords do not match.", true); try { await A.changePassword(root.querySelector("#phase2OldPassword").value, next); root.innerHTML = ""; toast("Password changed."); } catch (error) { toast(error.message, true); } });
  }

  function enhancePlanModal() {
    const grid = $(".pamet-plan-grid"); if (!grid || grid.dataset.phase2Enhanced) return;
    grid.dataset.phase2Enhanced = "true";
    const pro = grid.querySelector('[data-plan="pro"]'), ultraPlan = grid.querySelector('[data-plan="ultra"]');
    if (pro) { pro.classList.add("phase2-recommended-plan"); pro.insertAdjacentHTML("afterbegin", '<span class="phase2-plan-label">Most popular</span>'); }
    if (ultraPlan) ultraPlan.insertAdjacentHTML("afterbegin", '<span class="phase2-plan-label advanced">Advanced care coordination</span>');
    const annual = $("[data-int='annual']", grid.parentElement); if (annual) annual.textContent = "Annual · Best value";
  }

  function injectSettings() {
    const profileCard = $("#screen-settings .profile-card");
    if (!profileCard) return;
    const footer = $(".footer-line"); if (footer) footer.textContent = "Pamet v1.1.0 · Your health history, finally useful.";
    $("#phase2ProfileSwitcher")?.remove();

    let tools = $("#phase2UltraTools");
    if (!tools) { tools = document.createElement("section"); tools.id = "phase2UltraTools"; tools.className = "settings-card phase2-tools"; $("#planCompare").closest(".settings-card").insertAdjacentElement("afterend", tools); }
    tools.innerHTML = `<p class="settings-section">Prepare with Ultra</p><p class="phase2-tools-copy">Advanced care coordination for appointments, longer-term history, family profiles, and sharing.</p><div class="phase2-tool-grid"><button type="button" data-phase2="profiles"><strong>Manage profiles</strong><span>Keep each person's history separate</span></button><button type="button" data-phase2="prep"><strong>Appointment prep</strong><span>Build a visit discussion guide</span></button><button type="button" data-phase2="longitudinal"><strong>Longitudinal analysis</strong><span>Compare 90-day periods</span></button><button type="button" data-phase2="brief"><strong>Advanced Visit Brief</strong><span>Create a clinician-ready summary</span></button><button type="button" data-phase2="sharing"><strong>Advanced sharing</strong><span>Choose roles and expiration</span></button></div>`;
    const handlers = { profiles: manageProfiles, prep: appointmentPrep, longitudinal: longitudinalAnalysis, brief: advancedVisitBrief, sharing: advancedSharing };
    tools.querySelectorAll("[data-phase2]").forEach((button) => button.addEventListener("click", handlers[button.dataset.phase2]));
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest("#changePasswordBtn")) { event.preventDefault(); event.stopImmediatePropagation(); changePasswordDialog(); }
  }, true);

  document.title = "Pamet — Track, understand, prepare";
  const footer = $(".footer-line"); if (footer) footer.textContent = "Pamet v1.1.0 · Your health history, finally useful.";
  injectSettings();
  new MutationObserver(() => enhancePlanModal()).observe(document.body, { childList: true, subtree: true });
  $$(".tab[data-tab='settings']").forEach((tab) => tab.addEventListener("click", () => setTimeout(injectSettings, 20)));
  window.addEventListener("pamet:profile-updated", injectSettings);
  window.PametPhase2 = { periodSummary };
})();
