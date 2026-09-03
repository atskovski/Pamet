/* Pamet v1.3.0 — profiles, appointment preparation, health-history comparisons, and advanced sharing. */
(function () {
  "use strict";
  const S = window.PametStore;
  const A = window.PametAuth;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  if (!S || !A) return;

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const ultra = () => S.settings.plan === "ultra";
  const average = (values) => values.length ? values.reduce((sum, value) => sum + (+value || 0), 0) / values.length : 0;
  const APPOINTMENT_DRAFT_PREFIX = "pamet_appointment_draft_v130_";

  function toast(message, error = false, duration = 4200) {
    let item = $(".pamet-toast");
    if (item) item.remove();
    item = document.createElement("div");
    item.className = "pamet-toast" + (error ? " error" : "");
    item.textContent = message;
    document.body.appendChild(item);
    setTimeout(() => item.remove(), duration);
  }

  function modal(content) {
    let root = $("#phase2ModalRoot");
    if (!root) { root = document.createElement("div"); root.id = "phase2ModalRoot"; document.body.appendChild(root); }
    root.innerHTML = `<div class="pamet-modal-backdrop"><section class="pamet-modal phase2-modal" role="dialog" aria-modal="true">${content}</section></div>`;
    root.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => { root.innerHTML = ""; }));
    root.querySelector(".pamet-modal-backdrop")?.addEventListener("click", (event) => { if (event.target === event.currentTarget) root.innerHTML = ""; });
    return root;
  }

  function inlineStatus(root, message, kind = "info", timeout = 0) {
    const status = $("[data-phase2-status]", root);
    if (!status) return;
    status.className = `phase2-inline-status ${kind}`;
    status.textContent = message;
    status.hidden = !message;
    if (timeout) setTimeout(() => { if (status.textContent === message) { status.textContent = ""; status.hidden = true; } }, timeout);
  }

  function credential() { return A.getBackendCredential ? A.getBackendCredential() : null; }
  async function api(path, options = {}) {
    const auth = credential();
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (auth?.deviceKey) headers.Authorization = `Bearer ${auth.deviceKey}`;
    const response = await fetch(path, { credentials: "same-origin", ...options, headers });
    const text = await response.text();
    let body = {}; try { body = text ? JSON.parse(text) : {}; } catch { body = { error: text }; }
    if (!response.ok) {
      const error = new Error(body.error || `Request failed (${response.status})`);
      error.status = response.status;
      error.body = body;
      throw error;
    }
    return body;
  }

  function upgradeNudge(feature) {
    const root = modal(`<div class="pamet-modal-head"><div><h2 class="pamet-modal-title">${esc(feature)} is included with Ultra</h2><p class="pamet-modal-sub">Ultra is designed for family profiles, coordinated care, and appointment preparation. Pro remains the best fit for individual tracking and insights.</p></div><button class="pamet-close" data-close aria-label="Close">×</button></div><button class="btn btn-primary btn-block" id="phase2SeePlans">See Pro &amp; Ultra</button>`);
    root.querySelector("#phase2SeePlans").addEventListener("click", () => { root.innerHTML = ""; $("#upgradeBtn")?.click(); });
  }

  function profileEntryCount(profileId) {
    try { return S.entriesForProfile(profileId).length; } catch { return 0; }
  }

  function manageProfiles() {
    if (!ultra()) return upgradeNudge("Multi-profile management");
    const render = () => {
      const active = S.activeProfile;
      const root = modal(`<div class="pamet-modal-head"><div><h2 class="pamet-modal-title">Profiles</h2><p class="pamet-modal-sub">Keep each person’s health history separate. Switching profiles never deletes another profile’s entries.</p></div><button class="pamet-close" data-close aria-label="Close">×</button></div><div class="phase2-current-profile"><span>Currently viewing</span><strong>${esc(active.name)}</strong><small>${esc(active.relationship)} · ${profileEntryCount(active.id)} ${profileEntryCount(active.id) === 1 ? "entry" : "entries"}</small></div><div class="phase2-profile-list">${S.profiles.map((profile) => `<div class="phase2-profile-row${profile.id === active.id ? " active" : ""}"><button type="button" data-switch-profile="${esc(profile.id)}"><strong>${esc(profile.name)}</strong><small>${esc(profile.relationship)}${profile.id === active.id ? " · Active" : ""} · ${profileEntryCount(profile.id)} ${profileEntryCount(profile.id) === 1 ? "entry" : "entries"}</small></button>${profile.id !== "primary" ? `<button type="button" class="pamet-text-button" data-delete-profile="${esc(profile.id)}">Remove</button>` : ""}</div>`).join("")}</div><form id="addProfileForm" class="pamet-form phase2-add-profile"><h3>Add a profile</h3><p class="phase2-form-help">A new profile starts with 0 entries and its own health history.</p><label>Profile name<input id="phase2ProfileName" maxlength="80" required placeholder="Name or label"></label><label>Relationship<select id="phase2Relationship"><option>Child</option><option>Parent</option><option>Partner</option><option>Other</option></select></label><button class="btn btn-primary">Review new profile</button></form><section id="phase2ProfileConfirm" class="phase2-confirm-card" hidden aria-live="polite"></section>`);

      root.querySelectorAll("[data-switch-profile]").forEach((button) => button.addEventListener("click", () => {
        const profile = S.profiles.find((item) => item.id === button.dataset.switchProfile);
        if (!profile || profile.id === active.id) return;
        const confirmBox = $("#phase2ProfileConfirm", root);
        confirmBox.hidden = false;
        confirmBox.innerHTML = `<strong>Switch to ${esc(profile.name)}?</strong><p>Pamet will end the current profile session for ${esc(active.name)} and reopen with ${esc(profile.name)} active. Your Pamet account stays signed in, and no profile data is deleted.</p><div class="pamet-form-actions"><button type="button" class="btn btn-ghost" data-cancel-switch>Cancel</button><button type="button" class="btn btn-primary" data-confirm-switch>Switch profile</button></div>`;
        $("[data-cancel-switch]", confirmBox).addEventListener("click", () => { confirmBox.hidden = true; confirmBox.innerHTML = ""; });
        $("[data-confirm-switch]", confirmBox).addEventListener("click", () => { if (S.switchProfile(profile.id)) location.reload(); });
        confirmBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }));

      root.querySelectorAll("[data-delete-profile]").forEach((button) => button.addEventListener("click", () => {
        const profile = S.profiles.find((item) => item.id === button.dataset.deleteProfile);
        if (!profile) return;
        const confirmBox = $("#phase2ProfileConfirm", root);
        confirmBox.hidden = false;
        confirmBox.innerHTML = `<strong>Remove ${esc(profile.name)}?</strong><p>This action removes the profile and its locally stored entries from this device. Export anything you need first.</p><div class="pamet-form-actions"><button type="button" class="btn btn-ghost" data-cancel-remove>Cancel</button><button type="button" class="btn btn-primary phase2-danger-action" data-confirm-remove>Remove profile</button></div>`;
        $("[data-cancel-remove]", confirmBox).addEventListener("click", () => { confirmBox.hidden = true; confirmBox.innerHTML = ""; });
        $("[data-confirm-remove]", confirmBox).addEventListener("click", () => { S.removeProfile(profile.id); render(); });
      }));

      root.querySelector("#addProfileForm").addEventListener("submit", (event) => {
        event.preventDefault();
        const name = root.querySelector("#phase2ProfileName").value.trim();
        const relationship = root.querySelector("#phase2Relationship").value;
        if (!name) return;
        const confirmBox = $("#phase2ProfileConfirm", root);
        confirmBox.hidden = false;
        confirmBox.innerHTML = `<strong>Create ${esc(name)} and switch now?</strong><p>Your current profile session for ${esc(active.name)} will end and Pamet will reopen with <strong>${esc(name)}</strong> active. Your Pamet account remains signed in. Existing profiles and health data are preserved. ${esc(name)} starts fresh with 0 entries and will need new tracking from scratch.</p><div class="pamet-form-actions"><button type="button" class="btn btn-ghost" data-cancel-create>Cancel</button><button type="button" class="btn btn-primary" data-confirm-create>Create &amp; switch</button></div>`;
        $("[data-cancel-create]", confirmBox).addEventListener("click", () => { confirmBox.hidden = true; confirmBox.innerHTML = ""; });
        $("[data-confirm-create]", confirmBox).addEventListener("click", () => {
          const profile = S.addProfile(name, relationship);
          if (!profile) { confirmBox.innerHTML = `<strong>Profile could not be added.</strong><p>Confirm Ultra is active and try again.</p>`; return; }
          S.switchProfile(profile.id);
          confirmBox.innerHTML = `<strong>${esc(profile.name)} is ready.</strong><p>0 entries · switching to the new profile now. Existing profile data remains unchanged.</p>`;
          setTimeout(() => location.reload(), 700);
        });
        confirmBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
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
    if (!ultra()) return upgradeNudge("Health history over time");
    const data = periodSummary(90);
    const strength = data.currentDays >= 30 && data.previousDays >= 30 ? "Strong" : data.currentDays >= 10 && data.previousDays >= 10 ? "Developing" : "Limited";
    modal(`<div class="pamet-modal-head"><div><h2 class="pamet-modal-title">Health history over time</h2><p class="pamet-modal-sub">Recent 90 days compared with the previous 90 days for ${esc(S.activeProfile.name)}.</p></div><button class="pamet-close" data-close aria-label="Close">×</button></div><div class="phase2-strength"><strong>Data strength: ${strength}</strong><span>${data.currentDays} recent logged days · ${data.previousDays} comparison days</span></div><div class="phase2-stat-grid"><div><strong>${data.currentDays}</strong><span>Recent logged days</span></div><div><strong>${data.currentSeverity.toFixed(1)}/10</strong><span>Average severity</span></div></div><div class="phase2-comparison">${data.names.length ? data.names.map((name) => { const current = data.currentCounts[name] || 0, previous = data.previousCounts[name] || 0, difference = current - previous; return `<div><strong>${esc(name)}</strong><span>${current} recent vs ${previous} previous · ${difference === 0 ? "stable" : difference > 0 ? `recorded ${difference} more time${difference === 1 ? "" : "s"}` : `recorded ${Math.abs(difference)} fewer time${difference === -1 ? "" : "s"}`}</span></div>`; }).join("") : `<p>Keep logging to build a comparison. Pamet needs entries in both periods.</p>`}</div><p class="pamet-reassurance">These are observations from user-recorded information. They do not establish cause, diagnosis, or treatment effect.</p>`);
  }

  function appointmentSuggestions() {
    const report = S.report();
    const data = periodSummary(30);
    const patterns = S.patterns().slice(0, 4);
    const concerns = data.names.slice(0, 4).map((name) => `${name}: recorded on ${data.currentCounts[name] || 0} recent logged day${(data.currentCounts[name] || 0) === 1 ? "" : "s"}`);
    const questions = [];
    if (data.names[0]) questions.push(`What context would help explain the recent change in ${data.names[0]}?`);
    if (report.medications?.length) questions.push("Should we review the medications and supplements I recorded?");
    if (patterns[0]) questions.push(`Is there anything important to consider about the pattern I recorded: “${patterns[0].title}”?`);
    questions.push("What changes should I keep tracking before the next visit?");
    return { report, data, patterns, concerns, questions };
  }

  function appointmentDraftKey() { return APPOINTMENT_DRAFT_PREFIX + S.activeProfile.id; }
  function loadAppointmentDraft() { try { return JSON.parse(localStorage.getItem(appointmentDraftKey())) || {}; } catch { return {}; } }
  function saveAppointmentDraft(draft) { try { localStorage.setItem(appointmentDraftKey(), JSON.stringify({ ...draft, savedAt: new Date().toISOString() })); } catch {} }
  function clearAppointmentDraft() { try { localStorage.removeItem(appointmentDraftKey()); } catch {} }
  function appointmentLines(value) { return String(value || "").split(/\n+/).map((item) => item.trim()).filter(Boolean).slice(0, 10); }

  async function appointmentPrep() {
    if (!ultra()) return upgradeNudge("Appointment preparation");
    const suggestions = appointmentSuggestions();
    const draft = loadAppointmentDraft();
    const root = modal(`<div class="pamet-modal-head"><div><h2 class="pamet-modal-title">Appointment workspace</h2><p class="pamet-modal-sub">Plan a visit for ${esc(S.activeProfile.name)}, build a discussion guide from recorded history, and keep questions in one place.</p></div><button class="pamet-close" data-close aria-label="Close">×</button></div><div data-phase2-status class="phase2-inline-status info" role="status" aria-live="polite">Connecting to your secure Pamet account…</div><div class="phase2-appointment-grid"><form id="appointmentForm" class="pamet-form phase2-appointment-form"><h3>Plan the visit</h3><label>Visit type<select id="appointmentType"><option>Primary care</option><option>Specialist</option><option>Follow-up</option><option>Medication review</option><option>New symptom</option><option>Preventive visit</option><option>Other</option></select></label><label>Clinician or practice<input id="appointmentClinician" maxlength="120" required value="${esc(draft.clinician || "")}"></label><label>Date and time<input id="appointmentStarts" type="datetime-local" required value="${esc(draft.startsLocal || "")}"></label><label>Reason for visit<input id="appointmentReason" maxlength="500" value="${esc(draft.reason || "")}" placeholder="What do you want to focus on?"></label><label>Top concerns, one per line<textarea id="appointmentConcerns" maxlength="2000" placeholder="Most important symptoms or changes">${esc(draft.concerns || suggestions.concerns.join("\n"))}</textarea></label><label>Questions for the visit, one per line<textarea id="appointmentQuestions" maxlength="2000">${esc(draft.questions || suggestions.questions.join("\n"))}</textarea></label><label>Reminder timing<select id="appointmentReminder"><option value="60">1 hour before</option><option value="180">3 hours before</option><option value="1440" selected>1 day before</option><option value="2880">2 days before</option><option value="10080">1 week before</option></select></label><div class="phase2-guide-options"><label><input type="checkbox" id="guidePatterns" checked> Include Pamet patterns</label><label><input type="checkbox" id="guideMeds" checked> Include recorded medications</label><label><input type="checkbox" id="guideNotes" checked> Include recent notes</label></div><div class="pamet-form-actions"><button type="button" class="btn btn-ghost" id="saveAppointmentDraft">Save draft on this device</button><button class="btn btn-primary">Save appointment</button></div></form><aside class="phase2-discussion-guide"><div class="phase2-guide-head"><div><span>Discussion guide</span><strong>${esc(S.activeProfile.name)}</strong></div><button type="button" class="btn btn-ghost" id="refreshDiscussionGuide">Refresh</button></div><div id="discussionGuidePreview"></div></aside></div><section class="phase2-prep"><div class="phase2-section-head"><h3>Upcoming and saved visits</h3><span id="appointmentServerState">Loading…</span></div><div id="appointmentList"><p>Checking your saved visits…</p></div></section><p class="pamet-reassurance">Pamet organizes information you recorded so you can prepare for a conversation with a healthcare professional. It does not diagnose conditions or recommend tests or treatments.</p>`);

    let serverReady = true;
    const renderGuide = () => {
      const includePatterns = $("#guidePatterns", root).checked;
      const includeMeds = $("#guideMeds", root).checked;
      const includeNotes = $("#guideNotes", root).checked;
      const concerns = appointmentLines($("#appointmentConcerns", root).value);
      const questions = appointmentLines($("#appointmentQuestions", root).value);
      const reason = $("#appointmentReason", root).value.trim();
      const type = $("#appointmentType", root).value;
      const preview = $("#discussionGuidePreview", root);
      const patternHtml = includePatterns && suggestions.patterns.length ? `<section><h4>Patterns to mention</h4><ul>${suggestions.patterns.map((item) => `<li><strong>${esc(item.title)}</strong><span>${esc(item.occurrences || item.detail || "Recorded pattern")}</span></li>`).join("")}</ul></section>` : "";
      const meds = Array.isArray(suggestions.report.medications) ? suggestions.report.medications.slice(0, 8) : [];
      const medHtml = includeMeds && meds.length ? `<section><h4>Recorded medications / supplements</h4><ul>${meds.map((item) => `<li>${esc(Array.isArray(item) ? item.join(": ") : item)}</li>`).join("")}</ul></section>` : "";
      const notes = Array.isArray(suggestions.report.notes) ? suggestions.report.notes.slice(0, 4) : [];
      const noteHtml = includeNotes && notes.length ? `<section><h4>Recent notes</h4><ul>${notes.map((item) => `<li><strong>${esc(item.date || "Recent")}</strong><span>${esc(item.notes || item.text || "")}</span></li>`).join("")}</ul></section>` : "";
      preview.innerHTML = `<section class="phase2-guide-summary"><h4>Visit focus</h4><p><strong>${esc(type)}</strong>${reason ? ` · ${esc(reason)}` : ""}</p><p>${suggestions.data.currentDays} logged day${suggestions.data.currentDays === 1 ? "" : "s"} in the recent comparison period · average severity ${suggestions.data.currentSeverity.toFixed(1)}/10.</p></section><section><h4>Top concerns</h4>${concerns.length ? `<ol>${concerns.map((item) => `<li>${esc(item)}</li>`).join("")}</ol>` : `<p>No concerns added yet.</p>`}</section><section><h4>Questions to ask</h4>${questions.length ? `<ol>${questions.map((item) => `<li>${esc(item)}</li>`).join("")}</ol>` : `<p>No questions added yet.</p>`}</section>${patternHtml}${medHtml}${noteHtml}<section class="phase2-visit-checklist"><h4>Before the visit</h4><label><input type="checkbox"> Review your most recent entries</label><label><input type="checkbox"> Confirm medication and supplement list</label><label><input type="checkbox"> Put the top 2–3 questions first</label><label><input type="checkbox"> Bring or download your Visit Brief if useful</label></section>`;
    };

    ["appointmentReason", "appointmentConcerns", "appointmentQuestions", "appointmentType", "guidePatterns", "guideMeds", "guideNotes"].forEach((id) => $("#" + id, root)?.addEventListener("input", renderGuide));
    $("#refreshDiscussionGuide", root).addEventListener("click", renderGuide);
    renderGuide();

    const draftFromForm = () => ({ clinician: $("#appointmentClinician", root).value, startsLocal: $("#appointmentStarts", root).value, reason: $("#appointmentReason", root).value, concerns: $("#appointmentConcerns", root).value, questions: $("#appointmentQuestions", root).value, reminderMinutes: +$("#appointmentReminder", root).value, visitType: $("#appointmentType", root).value });
    $("#saveAppointmentDraft", root).addEventListener("click", () => { saveAppointmentDraft(draftFromForm()); inlineStatus(root, `Draft saved on this device for ${S.activeProfile.name}.`, "success", 5000); });

    const renderAppointments = (items) => {
      const list = $("#appointmentList", root);
      const activeItems = items.filter((item) => !item.profileId || item.profileId === S.activeProfile.id);
      list.innerHTML = activeItems.length ? activeItems.map((item) => `<div class="phase2-appointment-row"><div><strong>${esc(item.clinician)}</strong><small>${esc(new Date(item.startsAt).toLocaleString())} · ${esc(item.reason || "General visit")}</small><span>Reminder: ${Number(item.reminderMinutes || 1440) >= 1440 ? `${Math.round(Number(item.reminderMinutes || 1440) / 1440)} day(s) before` : `${Number(item.reminderMinutes || 60)} minutes before`}</span></div><button class="pamet-text-button" data-remove-appointment="${esc(item.id)}">Remove</button></div>`).join("") : `<p>No saved appointments for ${esc(S.activeProfile.name)} yet.</p>`;
      list.querySelectorAll("[data-remove-appointment]").forEach((button) => button.addEventListener("click", async () => {
        button.disabled = true;
        try { await api(`/api/appointments/${encodeURIComponent(button.dataset.removeAppointment)}`, { method: "DELETE" }); button.closest(".phase2-appointment-row")?.remove(); inlineStatus(root, "Appointment removed.", "success", 4500); }
        catch (error) { inlineStatus(root, error.message, "error"); button.disabled = false; }
      }));
    };

    try {
      const appointments = (await api("/api/appointments")).appointments || [];
      renderAppointments(appointments);
      $("#appointmentServerState", root).textContent = "Secure sync connected";
      inlineStatus(root, "Appointment workspace connected to your Pamet account.", "success", 3500);
    } catch (error) {
      serverReady = false;
      $("#appointmentServerState", root).textContent = "Local planning mode";
      $("#appointmentList", root).innerHTML = `<div class="phase2-auth-help"><strong>${error.status === 401 ? "Your secure Pamet session needs to reconnect." : "Saved visits are temporarily unavailable."}</strong><p>Your local health history is still on this device. You can keep building the discussion guide or save a local draft. Sign in again to sync appointments and reminder settings.</p>${error.status === 401 ? '<button type="button" class="btn btn-primary" id="appointmentReconnect">Sign in again</button>' : ''}</div>`;
      inlineStatus(root, error.status === 401 ? "Authentication is required only for server-saved appointments. Local planning remains available." : error.message, "warning");
      $("#appointmentReconnect", root)?.addEventListener("click", async () => { await A.endSession(); location.reload(); });
    }

    root.querySelector("#appointmentForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const formDraft = draftFromForm();
      saveAppointmentDraft(formDraft);
      if (!serverReady) return inlineStatus(root, "Draft saved on this device. Sign in again when you are ready to sync the appointment and reminder timing.", "warning");
      const startsValue = $("#appointmentStarts", root).value;
      if (!startsValue) return inlineStatus(root, "Choose an appointment date and time.", "error");
      const payload = { profileId: S.activeProfile.id, clinician: $("#appointmentClinician", root).value, startsAt: new Date(startsValue).toISOString(), reason: [$("#appointmentType", root).value, $("#appointmentReason", root).value].filter(Boolean).join(" — "), concerns: appointmentLines($("#appointmentConcerns", root).value), questions: appointmentLines($("#appointmentQuestions", root).value), reminderMinutes: +$("#appointmentReminder", root).value };
      const submit = event.currentTarget.querySelector('button[type="submit"]');
      submit.disabled = true;
      inlineStatus(root, "Saving appointment…", "info");
      try {
        await api("/api/appointments", { method: "POST", body: JSON.stringify(payload) });
        clearAppointmentDraft();
        inlineStatus(root, `Appointment saved for ${S.activeProfile.name}. Your selected reminder timing is stored with the visit.`, "success", 6500);
        const appointments = (await api("/api/appointments")).appointments || [];
        renderAppointments(appointments);
        event.currentTarget.reset();
        $("#appointmentReminder", root).value = "1440";
        renderGuide();
      } catch (error) {
        if (error.status === 401) serverReady = false;
        inlineStatus(root, error.status === 401 ? "Your session expired before the appointment could sync. The draft is still saved on this device; sign in again and retry." : error.message, "error");
      } finally { submit.disabled = false; }
    });
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
    const root = modal(`<div class="pamet-modal-head"><div><h2 class="pamet-modal-title">Advanced sharing</h2><p class="pamet-modal-sub">Email a secure, expiring summary for ${esc(S.activeProfile.name)}. The invitation can be revoked later.</p></div><button class="pamet-close" data-close aria-label="Close">×</button></div><div data-phase2-status class="phase2-inline-status info" role="status" aria-live="polite">Checking email delivery…</div><form id="phase2ShareForm" class="pamet-form"><label>Recipient name<input id="phase2ShareName" required maxlength="100"></label><label>Email<input id="phase2ShareEmail" type="email" required maxlength="254"></label><label>Permission<select id="phase2SharePermission"><option value="view">View summary</option><option value="download">View and download summary</option></select></label><label>Link expires<select id="phase2ShareExpiry"><option value="7">7 days</option><option value="14">14 days</option><option value="30" selected>30 days</option><option value="90">90 days</option></select></label><label class="phase2-check-row"><input id="phase2IncludeNotes" type="checkbox"> <span>Include recent notes</span></label><p class="phase2-form-help" id="phase2EmailHelp">Pamet sends the invitation through the configured email service; the recipient never receives your account password or device data.</p><div class="pamet-form-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="phase2ShareSubmit">Send invitation</button></div></form><section id="phase2ShareResult" class="phase2-share-result" hidden></section>`);
    let emailReady = true;
    try {
      const config = await api("/api/billing/config");
      emailReady = config.emailEnabled === true;
      if (emailReady) inlineStatus(root, "Email delivery is ready.", "success", 3500);
      else inlineStatus(root, "Email delivery is not configured yet. A verified sender/domain and email service configuration are required before invitations can be sent.", "warning");
    } catch {
      inlineStatus(root, "Pamet could not confirm email delivery status. You can still try to send the invitation.", "warning");
    }
    if (!emailReady) $("#phase2ShareSubmit", root).disabled = true;

    root.querySelector("#phase2ShareForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const report = S.report();
      const recipientName = root.querySelector("#phase2ShareName").value.trim();
      const recipientEmail = root.querySelector("#phase2ShareEmail").value.trim();
      const expiresInDays = +root.querySelector("#phase2ShareExpiry").value;
      const permission = root.querySelector("#phase2SharePermission").value;
      const submit = root.querySelector("#phase2ShareSubmit");
      submit.disabled = true;
      inlineStatus(root, `Sending a secure invitation to ${recipientEmail}…`, "info");
      try {
        await api("/api/sharing/invites", { method: "POST", body: JSON.stringify({ kind: "caregiver", name: recipientName, email: recipientEmail, permission, expiresInDays, profileName: S.activeProfile.name, snapshot: { generatedAt: new Date().toISOString(), rangeLabel: report.rangeLabel, overview: report.overview, symptoms: report.breakdown, patterns: report.patterns, medications: report.medications, notes: root.querySelector("#phase2IncludeNotes").checked ? report.notes : [], disclaimer: "Generated from information recorded by the user. This is not a medical diagnosis or clinical assessment." } }) });
        root.querySelector("#phase2ShareForm").hidden = true;
        const result = root.querySelector("#phase2ShareResult");
        result.hidden = false;
        result.innerHTML = `<div class="phase2-success-mark" aria-hidden="true">✓</div><h3>Invitation sent</h3><p><strong>${esc(recipientName)}</strong> was emailed at <strong>${esc(recipientEmail)}</strong>.</p><dl><div><dt>Profile</dt><dd>${esc(S.activeProfile.name)}</dd></div><div><dt>Permission</dt><dd>${permission === "download" ? "View and download" : "View summary"}</dd></div><div><dt>Expires</dt><dd>${expiresInDays} days</dd></div></dl><p class="phase2-form-help">The link is revocable. Pamet does not send your login credentials or your full local journal.</p><div class="pamet-form-actions"><button type="button" class="btn btn-ghost" id="phase2SendAnother">Send another</button><button type="button" class="btn btn-primary" data-close>Done</button></div>`;
        result.querySelector("[data-close]").addEventListener("click", () => { root.innerHTML = ""; });
        result.querySelector("#phase2SendAnother").addEventListener("click", () => { result.hidden = true; root.querySelector("#phase2ShareForm").hidden = false; root.querySelector("#phase2ShareForm").reset(); submit.disabled = !emailReady; inlineStatus(root, "Ready to send another secure invitation.", "success", 3500); });
        inlineStatus(root, `Invitation sent successfully to ${recipientEmail}.`, "success", 6500);
      } catch (error) {
        inlineStatus(root, error.message, "error");
        submit.disabled = !emailReady;
      }
    });
  }

  function changePasswordDialog() {
    const root = modal(`<div class="pamet-modal-head"><div><h2 class="pamet-modal-title">Change password</h2><p class="pamet-modal-sub">Your password protects this device-local Pamet account.</p></div><button class="pamet-close" data-close aria-label="Close">×</button></div><form id="phase2PasswordForm" class="pamet-form"><label>Current password<input id="phase2OldPassword" type="password" autocomplete="current-password" required maxlength="128"></label><label>New password<input id="phase2NewPassword" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label><label>Confirm new password<input id="phase2ConfirmPassword" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label><div class="pamet-form-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary">Update password</button></div></form>`);
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
    const active = S.activeProfile;
    let context = $("#phase2ProfileSwitcher");
    if (!context) {
      context = document.createElement("section");
      context.id = "phase2ProfileSwitcher";
      context.className = "settings-card phase2-profile-switcher";
      profileCard.insertAdjacentElement("beforebegin", context);
    }
    const entryCount = profileEntryCount(active.id);
    context.innerHTML = `<div class="phase2-profile-context-copy"><span class="phase2-profile-eyebrow">Currently viewing</span><strong>${esc(active.name)}</strong><span>${esc(active.relationship)} · ${entryCount ? `${entryCount} ${entryCount === 1 ? "entry" : "entries"}` : "Fresh profile · 0 entries"}</span></div><button type="button" class="btn btn-ghost" id="phase2ManageProfilesTop">Manage profiles</button>`;
    $("#phase2ManageProfilesTop", context).addEventListener("click", manageProfiles);

    let tools = $("#phase2UltraTools");
    if (!tools) { tools = document.createElement("section"); tools.id = "phase2UltraTools"; tools.className = "settings-card phase2-tools"; $("#planCompare").closest(".settings-card").insertAdjacentElement("afterend", tools); }
    tools.innerHTML = `<p class="settings-section">Prepare with Ultra</p><p class="phase2-tools-copy">Visit preparation, health history over time, family profiles, and care-team coordination.</p><div class="phase2-tool-grid"><button type="button" data-phase2="profiles"><strong>Manage profiles</strong><span>Keep each person’s health history separate</span></button><button type="button" data-phase2="prep"><strong>Appointment workspace</strong><span>Plan a visit and build a discussion guide</span></button><button type="button" data-phase2="longitudinal"><strong>Health history over time</strong><span>Compare meaningful time periods</span></button><button type="button" data-phase2="brief"><strong>Advanced Visit Brief</strong><span>Create a clinician-ready summary</span></button><button type="button" data-phase2="sharing"><strong>Advanced sharing</strong><span>Email a secure, expiring summary</span></button></div>`;
    const handlers = { profiles: manageProfiles, prep: appointmentPrep, longitudinal: longitudinalAnalysis, brief: advancedVisitBrief, sharing: advancedSharing };
    tools.querySelectorAll("[data-phase2]").forEach((button) => button.addEventListener("click", handlers[button.dataset.phase2]));
    document.dispatchEvent(new CustomEvent("pamet:settings-rendered"));
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest("#changePasswordBtn")) { event.preventDefault(); event.stopImmediatePropagation(); changePasswordDialog(); }
  }, true);

  document.title = "Pamet — Track, understand, prepare";
  injectSettings();
  new MutationObserver(() => enhancePlanModal()).observe(document.body, { childList: true, subtree: true });
  $$(".tab[data-tab='settings']").forEach((tab) => tab.addEventListener("click", () => setTimeout(injectSettings, 20)));
  window.addEventListener("pamet:profile-updated", injectSettings);
  window.PametPhase2 = { periodSummary, manageProfiles, appointmentPrep, advancedSharing };
})();
