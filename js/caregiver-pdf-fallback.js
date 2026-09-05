/* Temporary Ultra caregiver PDF fallback while email delivery is unavailable. */
(() => {
  'use strict';
  const S = window.PametStore;
  if (!S) return;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ultra = () => S.isUltra?.() === true;
  const rows = a => (a || []).map(r => `<tr><th>${esc(r?.[0] || '')}</th><td>${esc(r?.[1] || '')}</td></tr>`).join('');

  function pdf(root) {
    const r = S.report?.() || {};
    const overview = (r.overview || []).filter(x => ['Days logged','Symptom days','Average severity','Most frequent symptom'].includes(x?.[0]));
    const symptoms = (r.breakdown || []).slice(0, 10);
    const medications = (r.medications || []).slice(0, 10);
    const w = window.open('', '_blank', 'width=860,height=1050');
    const status = root?.querySelector?.('[data-care-status]');
    if (!w) {
      if (status) status.textContent = 'Your browser blocked the PDF window. Allow pop-ups for Pamet and try again.';
      return;
    }
    w.opener = null;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Pamet caregiver summary</title><style>body{font:16px Arial;color:#243638;max-width:780px;margin:36px auto;padding:0 24px}h1{color:#0f3d3e}table{width:100%;border-collapse:collapse}th,td{padding:8px;border-bottom:1px solid #dde4df;text-align:left}th{width:42%}.note{font-size:12px;color:#647276;margin-top:28px}</style></head><body><h1>Caregiver summary</h1><p>${esc(S.activeProfile?.name || 'Pamet profile')} · ${esc(r.rangeLabel || 'Recorded health history')}</p><h2>Tracking overview</h2><table>${rows(overview)}</table>${symptoms.length ? `<h2>Symptoms recorded</h2><table>${rows(symptoms)}</table>` : ''}${medications.length ? `<h2>Medications recorded</h2><table>${rows(medications)}</table>` : ''}<p class="note">Limited caregiver summary created locally from information recorded in Pamet. This is not emergency monitoring, medical advice, diagnosis, or a clinical assessment. Choose Save as PDF in the print dialog.</p></body></html>`);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 200);
    if (status) status.textContent = 'Caregiver PDF opened locally. In the print dialog, choose Save as PDF.';
  }

  function refresh() {
    const legacy = document.querySelector('#careUxModalRoot');
    const form = legacy?.querySelector('#careShareForm');
    const caregiver = /caregiver access/i.test(legacy?.querySelector('.pamet-modal-title')?.textContent || '');
    let button = form?.querySelector('#caregiverPdfDownload');
    if (form && caregiver) {
      if (!ultra()) button?.remove();
      else {
        if (!button) {
          button = document.createElement('button');
          button.type = 'button';
          button.id = 'caregiverPdfDownload';
          button.className = 'btn btn-ghost btn-block';
          button.textContent = 'Download caregiver PDF';
          button.addEventListener('click', () => pdf(legacy));
          form.querySelector('.pamet-form-actions')?.before(button);
        }
        const s = legacy.querySelector('[data-care-status]');
        if (s?.textContent.includes('Email delivery is not configured.')) s.textContent = 'Email delivery is not configured yet. Ultra can download the caregiver summary as a local PDF while secure email invitations are unavailable.';
      }
    }

    const enhanced = document.querySelector('#careSharingEnhancedRoot');
    const enhancedCaregiver = /caregiver access/i.test(enhanced?.querySelector('.pamet-modal-title')?.textContent || '');
    const enhancedPdf = enhancedCaregiver ? enhanced?.querySelector('#enhancedSharePdf') : null;
    if (enhancedPdf) {
      enhancedPdf.hidden = !ultra();
      if (ultra()) enhancedPdf.textContent = 'Download caregiver PDF';
      else {
        const s = enhanced.querySelector('[data-enhanced-status]');
        if (s?.textContent.includes('use Create PDF instead')) s.textContent = 'Email delivery is not configured right now. Secure invitations will be available after Pamet has a verified sending domain.';
      }
    }
  }

  document.addEventListener('pamet:settings-rendered', refresh);
  window.addEventListener('pamet:entitlements', refresh);
  new MutationObserver(refresh).observe(document.documentElement, {childList:true, subtree:true});
  refresh();
})();
