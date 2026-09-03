/* Pamet 1.5.1 — care sharing, profile badge refresh, and appointment workspace UX. */
(() => {
  'use strict';
  const S = window.PametStore;
  const A = window.PametAuth;
  if (!S || !A) return;
  const $ = (selector, root = document) => root.querySelector(selector);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const lines = (value) => String(value || '').split(/\n+/).map(v => v.trim()).filter(Boolean).slice(0, 12);
  const DRAFT_PREFIX = 'pamet_appointment_draft_v151_';

  function closeModal(root) { if (root) root.innerHTML = ''; }
  function modal(content, className = '') {
    let root = $('#careUxModalRoot');
    if (!root) { root = document.createElement('div'); root.id = 'careUxModalRoot'; document.body.appendChild(root); }
    root.innerHTML = `<div class="pamet-modal-backdrop care-ux-backdrop"><section class="pamet-modal phase2-modal ${className}" role="dialog" aria-modal="true">${content}</section></div>`;
    root.querySelectorAll('[data-care-close]').forEach(btn => btn.addEventListener('click', () => closeModal(root)));
    root.querySelector('.pamet-modal-backdrop')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(root); });
    return root;
  }
  function status(root, message, kind = 'info') {
    const el = $('[data-care-status]', root);
    if (!el) return;
    el.hidden = !message;
    el.className = `care-ux-status ${kind}`;
    el.textContent = message || '';
  }
  async function api(path, options = {}) {
    const credential = A.getBackendCredential?.();
    const headers = {'Content-Type':'application/json', ...(options.headers || {})};
    if (credential?.deviceKey) headers.Authorization = `Bearer ${credential.deviceKey}`;
    const response = await fetch(path, {credentials:'same-origin', cache:'no-store', ...options, headers});
    const text = await response.text();
    let body = {}; try { body = text ? JSON.parse(text) : {}; } catch { body = {error:text}; }
    if (!response.ok) { const error = new Error(body.error || `Request failed (${response.status})`); error.status = response.status; throw error; }
    return body;
  }

  function caregiverSnapshot() {
    const report = S.report();
    return {
      generatedAt: new Date().toISOString(),
      profileName: S.activeProfile.name,
      rangeLabel: report.rangeLabel,
      overview: (report.overview || []).filter(row => ['Days logged','Symptom days','Average severity','Most frequent symptom'].includes(row[0])),
      symptoms: (report.breakdown || []).slice(0, 8),
      medications: (report.medications || []).slice(0, 8),
      notes: [],
      disclaimer: 'A limited summary shared by the Pamet user for caregiver context. This is not emergency monitoring, medical advice, or a clinical assessment.'
    };
  }

  function providerSnapshot(includeNotes = true) {
    const report = S.report();
    const patterns = S.patterns().filter(p => !p.isEmerging).slice(0, 8).map(p => ({title:p.title, detail:p.detail, occurrences:p.occurrences, confidence:p.confidence}));
    const entries = S.entries.slice(0, 30);
    const avg = key => entries.length ? (entries.reduce((sum,e) => sum + (+e[key] || 0), 0) / entries.length).toFixed(1) : '—';
    return {
      generatedAt: new Date().toISOString(),
      profileName: S.activeProfile.name,
      rangeLabel: report.rangeLabel,
      overview: report.overview || [],
      symptoms: report.breakdown || [],
      patterns,
      medications: report.medications || [],
      recentContext: {
        averageSleepHours: avg('sleepHours'),
        averageStress: avg('stressLevel'),
        averageHydrationGlasses: avg('waterGlasses'),
        recentLoggedEntries: entries.length
      },
      notes: includeNotes ? (report.notes || []).slice(0, 10) : [],
      discussionPrompts: [
        'Which recorded symptom changes are most important to review?',
        'Are any medication or supplement entries relevant to the current symptoms?',
        'What should the patient keep tracking before the next visit?'
      ],
      disclaimer: 'Patient-generated Visit Brief from user-recorded information. Pamet observations describe recorded associations and do not establish diagnosis, cause, or treatment effect.'
    };
  }

  async function openShare(kind) {
    const provider = kind === 'provider';
    const title = provider ? 'Primary Care Access' : 'Caregiver access';
    const root = modal(`<div class="pamet-modal-head"><div><h2 class="pamet-modal-title">${title}</h2><p class="pamet-modal-sub">${provider ? 'Send a more detailed, clinician-oriented Visit Brief with an expiring link.' : 'Send a limited, secure summary to a trusted caregiver with an expiring link.'}</p></div><button class="pamet-close" data-care-close aria-label="Close">×</button></div><div data-care-status class="care-ux-status info" role="status" aria-live="polite">Checking secure email delivery…</div><form id="careShareForm" class="pamet-form"><label>${provider ? 'Clinician or practice name' : 'Caregiver name'}<input id="careShareName" required maxlength="100"></label><label>Email<input id="careShareEmail" type="email" required maxlength="254"></label><label>Link expires<select id="careShareExpiry"><option value="7">7 days</option><option value="14">14 days</option><option value="30" selected>30 days</option><option value="90">90 days</option></select></label><label>Access<select id="careSharePermission"><option value="view">View secure summary</option><option value="download">View and download</option></select></label>${provider ? '<label class="phase2-check-row"><input id="careShareNotes" type="checkbox" checked><span>Include recent notes in the Visit Brief</span></label><div class="care-ux-report-preview"><strong>Primary Care Visit Brief includes</strong><span>Overview · symptom history · supported Pamet observations · medications · recent sleep/stress/hydration context · discussion prompts</span></div>' : '<div class="care-ux-report-preview"><strong>Caregiver summary includes</strong><span>Basic tracking overview · symptom frequency · medications recorded. Detailed notes and clinician-oriented pattern detail are excluded.</span></div>'}<p class="phase2-form-help">All progress, errors, and confirmation will stay in this window. Links are expiring and revocable.</p><div class="pamet-form-actions"><button type="button" class="btn btn-ghost" data-care-close>Cancel</button><button class="btn btn-primary" id="careShareSubmit">Send secure invitation</button></div></form>`,'care-share-modal');
    let emailReady = true;
    try {
      const cfg = await api('/api/billing/config');
      emailReady = cfg.emailEnabled === true;
      status(root, emailReady ? 'Secure email delivery is ready.' : 'Email delivery is not configured. Pamet needs a verified sender/domain before invitations can be sent.', emailReady ? 'success' : 'warning');
    } catch { status(root, 'Pamet could not confirm email delivery status. You can still try to send the invitation.', 'warning'); }
    const submit = $('#careShareSubmit', root);
    if (!emailReady) submit.disabled = true;
    $('#careShareForm', root).addEventListener('submit', async event => {
      event.preventDefault();
      const name = $('#careShareName', root).value.trim();
      const email = $('#careShareEmail', root).value.trim();
      const expiresInDays = +$('#careShareExpiry', root).value;
      const permission = $('#careSharePermission', root).value;
      submit.disabled = true;
      status(root, `Sending secure invitation to ${email}…`, 'info');
      try {
        const snapshot = provider ? providerSnapshot($('#careShareNotes', root)?.checked !== false) : caregiverSnapshot();
        await api('/api/sharing/invites', {method:'POST', body:JSON.stringify({kind:provider ? 'provider' : 'caregiver', name, email, permission, expiresInDays, profileName:S.activeProfile.name, snapshot})});
        $('#careShareForm', root).hidden = true;
        status(root, '', 'success');
        const panel = document.createElement('section');
        panel.className = 'care-ux-send-confirmation';
        panel.setAttribute('role','status');
        panel.setAttribute('aria-live','polite');
        panel.innerHTML = `<div class="care-ux-success-mark">✓</div><h3>Secure invitation sent</h3><p><strong>${esc(name)}</strong> was emailed at <strong>${esc(email)}</strong>.</p><p>${provider ? 'The Primary Care Visit Brief contains the clinician-oriented summary selected above.' : 'The caregiver receives the limited summary only.'}</p><small>Returning to Settings…</small>`;
        root.querySelector('.care-share-modal').appendChild(panel);
        setTimeout(() => closeModal(root), 2200);
      } catch (error) {
        status(root, error.message || 'The invitation could not be sent. Nothing was shared. Please try again.', 'error');
        submit.disabled = !emailReady;
      }
    });
  }

  function installCareAccessButtons() {
    const caregiver = $('#setCaregiver')?.closest('.setting-row');
    const primary = $('#setPrimaryCare')?.closest('.setting-row');
    if (caregiver && caregiver.dataset.careUx !== 'true') {
      caregiver.dataset.careUx = 'true';
      caregiver.classList.add('care-access-row');
      $('#setCaregiver')?.remove();
      caregiver.insertAdjacentHTML('beforeend','<button type="button" class="btn btn-ghost care-access-action" data-care-share="caregiver">Share securely</button>');
    }
    if (primary && primary.dataset.careUx !== 'true') {
      primary.dataset.careUx = 'true';
      primary.classList.add('care-access-row');
      $('#setPrimaryCare')?.remove();
      primary.insertAdjacentHTML('beforeend','<button type="button" class="btn btn-ghost care-access-action" data-care-share="provider">Create Visit Brief</button>');
    }
  }

  function refreshProfileBadge() {
    const button = $('#quickProfileButton');
    if (!button) return;
    const count = S.profiles.length;
    button.hidden = count < 2;
    button.setAttribute('aria-label', `Switch profile. Currently ${S.activeProfile.name}. ${count} profile${count === 1 ? '' : 's'} available.`);
    let dot = button.querySelector('.profile-icon-dot');
    if (count >= 2 && !dot) { dot = document.createElement('span'); dot.className = 'profile-icon-dot'; button.appendChild(dot); }
    if (dot) dot.textContent = String(count);
  }

  function draftKey() { return DRAFT_PREFIX + S.activeProfile.id; }
  function saveDraft(data) { localStorage.setItem(draftKey(), JSON.stringify({...data, savedAt:new Date().toISOString()})); }
  function loadDraft() { try { return JSON.parse(localStorage.getItem(draftKey())) || {}; } catch { return {}; } }
  function clearDraft() { try { localStorage.removeItem(draftKey()); } catch {} }

  function guideData() {
    const report = S.report();
    const patterns = S.patterns().slice(0,4);
    return {report, patterns};
  }

  async function openAppointmentWorkspace() {
    const draft = loadDraft();
    const guide = guideData();
    const root = modal(`<div class="pamet-modal-head"><div><h2 class="pamet-modal-title">Appointment workspace</h2><p class="pamet-modal-sub">Plan a visit for ${esc(S.activeProfile.name)}. Local drafts stay on this device; saved appointments sync to your secure Pamet account when the session is connected.</p></div><button class="pamet-close" data-care-close aria-label="Close">×</button></div><div data-care-status class="care-ux-status info" role="status" aria-live="polite">Checking secure appointment sync…</div><div class="care-appointment-grid"><form id="careAppointmentForm" class="pamet-form"><h3>Plan the visit</h3><label>Visit type<select id="careVisitType"><option>Primary care</option><option>Specialist</option><option>Follow-up</option><option>Medication review</option><option>New symptom</option><option>Preventive visit</option><option>Other</option></select></label><label>Clinician or practice<input id="careClinician" maxlength="140" placeholder="Optional"></label><label>Date and time<div class="care-date-wrap"><input id="careStarts" type="datetime-local" required><span class="care-date-icon" aria-hidden="true">✓</span></div></label><label class="care-confirm-date"><input id="careDateConfirmed" type="checkbox" disabled><span>Confirm this appointment date and time</span></label><label>Reason for visit<textarea id="careReason" maxlength="1000" placeholder="What would you like to discuss?"></textarea></label><label>Questions<textarea id="careQuestions" maxlength="1500" placeholder="One question per line"></textarea></label><label>Reminder<select id="careReminder"><option value="60">1 hour before</option><option value="1440" selected>1 day before</option><option value="2880">2 days before</option><option value="10080">1 week before</option></select></label><div class="care-save-explainer"><strong>Where things are saved</strong><span><b>Save draft on this device</b> stores this planning form only in this browser. <b>Save appointment</b> stores the visit and reminder in your secure Pamet account so it can appear in Upcoming and saved visits.</span></div><div class="pamet-form-actions"><button type="button" class="btn btn-ghost" id="careSaveDraft">Save draft on this device</button><button class="btn btn-primary" id="careSaveAppointment">Save appointment</button></div></form><section class="care-appointment-side"><h3>Discussion guide</h3><div class="care-guide"><strong>Recent summary</strong><span>${esc((guide.report.overview || []).slice(0,4).map(r => `${r[0]}: ${r[1]}`).join(' · ') || 'Keep logging to build a summary.')}</span></div><div class="care-guide"><strong>Pamet observations to discuss</strong><span>${esc(guide.patterns.map(p => p.title).join(' · ') || 'No supported observations yet.')}</span></div><div class="care-guide"><strong>Questions to consider</strong><span>What changed since the last visit? · Which symptoms matter most today? · What should I keep tracking?</span></div><hr><div class="care-saved-header"><h3>Upcoming and saved visits</h3><span id="careServerState">Checking…</span></div><div id="careAppointmentList"><p>Loading saved visits…</p></div><button type="button" class="btn btn-ghost" id="careRetrySync" hidden>Retry secure sync</button></section></div>`,'care-appointment-modal');

    const ids = {type:'#careVisitType', clinician:'#careClinician', starts:'#careStarts', reason:'#careReason', questions:'#careQuestions', reminder:'#careReminder'};
    if (draft.visitType) $(ids.type, root).value = draft.visitType;
    if (draft.clinician) $(ids.clinician, root).value = draft.clinician;
    if (draft.startsLocal) $(ids.starts, root).value = draft.startsLocal;
    if (draft.reason) $(ids.reason, root).value = draft.reason;
    if (draft.questions) $(ids.questions, root).value = draft.questions;
    if (draft.reminderMinutes) $(ids.reminder, root).value = String(draft.reminderMinutes);

    const dateInput = $('#careStarts', root), dateConfirm = $('#careDateConfirmed', root);
    const syncDateConfirmation = () => { dateConfirm.disabled = !dateInput.value; if (!dateInput.value) dateConfirm.checked = false; };
    dateInput.addEventListener('change', () => { dateConfirm.checked = false; syncDateConfirmation(); status(root, dateInput.value ? 'Date and time selected. Check the confirmation box before saving the appointment.' : 'Choose a date and time.', 'info'); });
    syncDateConfirmation();

    const fromForm = () => ({visitType:$(ids.type, root).value, clinician:$(ids.clinician, root).value, startsLocal:$(ids.starts, root).value, reason:$(ids.reason, root).value, questions:$(ids.questions, root).value, reminderMinutes:+$(ids.reminder, root).value});
    $('#careSaveDraft', root).addEventListener('click', () => {
      saveDraft(fromForm());
      const btn = $('#careSaveDraft', root); const old = btn.textContent; btn.textContent = 'Draft saved ✓';
      status(root, `Draft saved only on this device for ${S.activeProfile.name}. It has not been added to Upcoming and saved visits.`, 'success');
      setTimeout(() => { if (btn.isConnected) btn.textContent = old; }, 2500);
    });

    let serverReady = false;
    const renderAppointments = items => {
      const list = $('#careAppointmentList', root);
      const filtered = (items || []).filter(item => !item.profileId || item.profileId === S.activeProfile.id);
      list.innerHTML = filtered.length ? filtered.map(item => `<div class="care-saved-visit"><div><strong>${esc(item.clinician || 'Appointment')}</strong><small>${esc(new Date(item.startsAt).toLocaleString())}</small><span>${esc(item.reason || 'General visit')} · Reminder ${Number(item.reminderMinutes || 1440) >= 1440 ? `${Math.round(Number(item.reminderMinutes || 1440)/1440)} day(s) before` : `${Number(item.reminderMinutes || 60)} minutes before`}</span></div></div>`).join('') : `<p>No secure appointments saved for ${esc(S.activeProfile.name)} yet.</p>`;
    };
    const connect = async (quiet = false) => {
      if (!quiet) status(root, 'Refreshing secure appointment sync…', 'info');
      try {
        const data = await api('/api/appointments');
        serverReady = true;
        renderAppointments(data.appointments || []);
        $('#careServerState', root).textContent = 'Secure sync connected';
        $('#careRetrySync', root).hidden = true;
        status(root, 'Secure appointment sync is connected. You do not need to sign in again.', 'success');
      } catch (error) {
        serverReady = false;
        $('#careServerState', root).textContent = 'Local planning available';
        $('#careRetrySync', root).hidden = false;
        $('#careAppointmentList', root).innerHTML = `<div class="care-sync-help"><strong>${error.status === 401 ? 'Pamet could not automatically reconnect the secure appointment session.' : 'Saved visits are temporarily unavailable.'}</strong><p>Your health history and local draft remain on this device. You can keep planning. Retry sync first; Pamet will only ask you to sign in if the secure server session has truly expired.</p></div>`;
        status(root, error.status === 401 ? 'Secure appointment sync is disconnected. Nothing was lost. Retry sync; if the server session has expired, sign-in will be needed only to save or retrieve synced appointments.' : error.message, 'warning');
      }
    };
    $('#careRetrySync', root).addEventListener('click', () => connect());
    await connect(true);

    $('#careAppointmentForm', root).addEventListener('submit', async event => {
      event.preventDefault();
      const draftData = fromForm();
      if (!draftData.startsLocal) return status(root, 'Choose an appointment date and time before saving.', 'error');
      if (!dateConfirm.checked) return status(root, 'Confirm the selected date and time using the checkbox before saving the appointment.', 'error');
      saveDraft(draftData);
      if (!serverReady) {
        await connect();
        if (!serverReady) return status(root, 'Draft saved on this device. Secure appointment sync is still disconnected, so the visit has not been added to Upcoming and saved visits.', 'warning');
      }
      const submit = $('#careSaveAppointment', root); submit.disabled = true;
      status(root, 'Saving appointment to your secure Pamet account…', 'info');
      const payload = {profileId:S.activeProfile.id, clinician:draftData.clinician || 'Appointment', startsAt:new Date(draftData.startsLocal).toISOString(), reason:[draftData.visitType,draftData.reason].filter(Boolean).join(' — '), concerns:[], questions:lines(draftData.questions), reminderMinutes:draftData.reminderMinutes};
      try {
        await api('/api/appointments', {method:'POST', body:JSON.stringify(payload)});
        clearDraft();
        const data = await api('/api/appointments'); renderAppointments(data.appointments || []);
        status(root, `Appointment saved to Upcoming and saved visits for ${S.activeProfile.name}. The reminder setting is stored with the secure appointment.`, 'success');
        submit.textContent = 'Appointment saved ✓';
        dateConfirm.checked = false;
        setTimeout(() => { if (submit.isConnected) submit.textContent = 'Save appointment'; }, 3000);
      } catch (error) {
        if (error.status === 401) serverReady = false;
        status(root, `The appointment could not sync. Your draft is still saved on this device. ${error.status === 401 ? 'Retry secure sync before signing in again.' : error.message}`, 'error');
      } finally { submit.disabled = false; }
    });
  }

  document.addEventListener('click', event => {
    const share = event.target.closest('[data-care-share]');
    if (share) { event.preventDefault(); openShare(share.dataset.careShare); return; }
    const phase = event.target.closest('[data-phase2]');
    if (phase?.dataset.phase2 === 'sharing') { event.preventDefault(); event.stopImmediatePropagation(); openShare('caregiver'); }
    if (phase?.dataset.phase2 === 'prep') { event.preventDefault(); event.stopImmediatePropagation(); openAppointmentWorkspace(); }
  }, true);

  const refresh = () => { installCareAccessButtons(); refreshProfileBadge(); };
  document.addEventListener('pamet:settings-rendered', refresh);
  window.addEventListener('pamet:profile-updated', refresh);
  new MutationObserver(() => requestAnimationFrame(refresh)).observe(document.body, {childList:true, subtree:true});
  refresh();
  window.PametCareUx = {openShare, openAppointmentWorkspace, refreshProfileBadge};
})();
