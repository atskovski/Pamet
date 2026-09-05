/* Pamet temporary Ultra caregiver PDF fallback.
 * Keeps caregiver exports local while transactional email is unavailable.
 */
(() => {
  'use strict';

  const S = window.PametStore;
  if (!S) return;

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[char]));

  const isUltra = () => S.isUltra?.() === true;

  function caregiverSnapshot() {
    const report = S.report?.() || {};
    return {
      generatedAt: new Date().toISOString(),
      profileName: S.activeProfile?.name || 'Pamet profile',
      rangeLabel: report.rangeLabel || 'Recorded health history',
      overview: (report.overview || []).filter((row) => ['Days logged', 'Symptom days', 'Average severity', 'Most frequent symptom'].includes(row?.[0])),
      symptoms: (report.breakdown || []).slice(0, 10),
      medications: (report.medications || []).slice(0, 10),
      disclaimer: 'A limited summary shared by the Pamet user for caregiver context. This is not emergency monitoring, medical advice, diagnosis, or a clinical assessment.'
    };
  }

  function rows(items) {
    return (items || []).map((row) => `<tr><th>${esc(row?.[0] || '')}</th><td>${esc(row?.[1] || '')}</td></tr>`).join('');
  }

  function setLegacyStatus(root, message, kind = 'info') {
    const el = root?.querySelector?.('[data-care-status]');
    if (!el) return;
    el.hidden = false;
    el.className = `care-ux-status ${kind}`;
    el.textContent = message;
  }

  function openLocalCaregiverPdf(root) {
    const snapshot = caregiverSnapshot();
    const popup = window.open('', '_blank', 'width=860,height=1050');
    if (!popup) {
      setLegacyStatus(root, 'Your browser blocked the PDF window. Allow pop-ups for Pamet and try again.', 'warning');
      return false;
    }

    popup.opener = null;
    popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Pamet caregiver summary</title><style>body{font-family:Arial,sans-serif;color:#243638;max-width:780px;margin:36px auto;padding:0 24px}header{border-bottom:4px solid #4CAF7A;padding-bottom:14px}h1{color:#0F3D3E;margin-bottom:6px}h2{margin-top:26px}table{width:100%;border-collapse:collapse}th,td{padding:8px;border-bottom:1px solid #dde4df;text-align:left;vertical-align:top}th{width:42%}.note{font-size:12px;color:#647276;margin-top:28px;border-top:1px solid #dde4df;padding-top:14px}@media print{body{margin:0;max-width:none}}</style></head><body><header><h1>Caregiver summary</h1><p>${esc(snapshot.profileName)} · ${esc(snapshot.rangeLabel)}</p><small>Generated ${esc(new Date(snapshot.generatedAt).toLocaleString())}</small></header><h2>Tracking overview</h2><table>${rows(snapshot.overview)}</table>${snapshot.symptoms.length ? `<h2>Symptoms recorded</h2><table>${rows(snapshot.symptoms)}</table>` : ''}${snapshot.medications.length ? `<h2>Medications recorded</h2><table>${rows(snapshot.medications)}</table>` : ''}<p class="note">${esc(snapshot.disclaimer)} Created locally from information recorded in Pamet. No email provider is used for this PDF. In the browser print dialog, choose Save as PDF.</p></body></html>`);
    popup.document.close();
    setTimeout(() => {
      popup.focus();
      popup.print();
    }, 250);
    setLegacyStatus(root, 'Caregiver PDF opened locally. In the print dialog, choose Save as PDF.', 'success');
    return true;
  }

  function enhanceLegacyCaregiverModal(root) {
    const modal = root?.querySelector?.('.care-share-modal');
    const form = root?.querySelector?.('#careShareForm');
    if (!modal || !form) return;
    const heading = modal.querySelector('.pamet-modal-title')?.textContent || '';
    if (!/caregiver access/i.test(heading)) return;

    let fallback = form.querySelector('#caregiverPdfFallback');
    if (!isUltra()) {
      fallback?.remove();
      return;
    }

    if (!fallback) {
      fallback = document.createElement('div');
      fallback.id = 'caregiverPdfFallback';
      fallback.className = 'caregiver-pdf-fallback';
      fallback.innerHTML = '<button type="button" class="btn btn-ghost btn-block" id="caregiverPdfDownload">Download caregiver PDF</button><p class="phase2-form-help">Ultra fallback: creates the limited caregiver summary locally on this device. Nothing is emailed or uploaded by this action.</p>';
      const actions = form.querySelector('.pamet-form-actions');
      if (actions) actions.before(fallback);
      else form.appendChild(fallback);
      fallback.querySelector('#caregiverPdfDownload')?.addEventListener('click', () => openLocalCaregiverPdf(root));
    }

    const status = root.querySelector('[data-care-status]');
    if (status?.textContent?.includes('Email delivery is not configured.')) {
      status.textContent = 'Email delivery is not configured yet. Ultra can download the caregiver summary as a local PDF while secure email invitations are unavailable.';
    }
  }

  function alignEnhancedCaregiverModal(root) {
    const modal = root?.querySelector?.('.enhanced-share-modal');
    const form = root?.querySelector?.('#enhancedShareForm');
    const pdfButton = root?.querySelector?.('#enhancedSharePdf');
    if (!modal || !form || !pdfButton) return;
    const heading = modal.querySelector('.pamet-modal-title')?.textContent || '';
    if (!/caregiver access/i.test(heading)) return;

    const ultra = isUltra();
    pdfButton.hidden = !ultra;
    if (ultra) pdfButton.textContent = 'Download caregiver PDF';

    const help = form.querySelector('.phase2-form-help');
    if (help) {
      help.textContent = ultra
        ? 'The caregiver PDF is created locally from the selected summary. Secure links are expiring and revocable.'
        : 'Secure links are expiring and revocable. Local caregiver PDF fallback is available with Ultra.';
    }

    const status = root.querySelector('[data-enhanced-status]');
    if (!ultra && status?.textContent?.includes('use Create PDF instead')) {
      status.textContent = 'Email delivery is not configured right now. Secure invitations will be available after Pamet has a verified sending domain.';
    }
  }

  function refresh() {
    const legacyRoot = document.querySelector('#careUxModalRoot');
    if (legacyRoot) enhanceLegacyCaregiverModal(legacyRoot);
    const enhancedRoot = document.querySelector('#careSharingEnhancedRoot');
    if (enhancedRoot) alignEnhancedCaregiverModal(enhancedRoot);
  }

  document.addEventListener('DOMContentLoaded', refresh, { once:true });
  document.addEventListener('pamet:settings-rendered', refresh);
  window.addEventListener('pamet:entitlements', refresh);

  const observer = new MutationObserver(refresh);
  observer.observe(document.documentElement, { childList:true, subtree:true, characterData:true });
  refresh();

  window.PametCaregiverPdfFallback = Object.freeze({ refresh });
})();
