/* Temporary Ultra caregiver PDF fallback while email is unavailable. */
(() => {
  'use strict';
  const S = window.PametStore;
  if (!S) return;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const rows = a => (a || []).map(r => `<tr><td>${esc(r?.[0] || '')}</td><td>${esc(r?.[1] || '')}</td></tr>`).join('');

  function printCaregiver(root) {
    const r = S.report?.() || {}, w = window.open('', '_blank', 'width=820,height=1000');
    if (!w) return;
    const overview = (r.overview || []).filter(x => ['Days logged','Symptom days','Average severity','Most frequent symptom'].includes(x?.[0]));
    w.opener = null;
    w.document.write(`<!doctype html><html><head><title>Pamet caregiver summary</title><style>body{font:16px Arial;color:#243638;max-width:760px;margin:36px auto}table{width:100%;border-collapse:collapse}td{padding:8px;border-bottom:1px solid #ddd}</style></head><body><h1>Caregiver summary</h1><p>${esc(S.activeProfile?.name || 'Pamet profile')} · ${esc(r.rangeLabel || 'Recorded history')}</p><h2>Tracking overview</h2><table>${rows(overview)}</table>${r.breakdown?.length ? `<h2>Symptoms recorded</h2><table>${rows(r.breakdown.slice(0,10))}</table>` : ''}${r.medications?.length ? `<h2>Medications recorded</h2><table>${rows(r.medications.slice(0,10))}</table>` : ''}<p><small>Limited caregiver summary created locally from information recorded in Pamet. This is not emergency monitoring, medical advice, diagnosis, or a clinical assessment.</small></p></body></html>`);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 200);
    const s = root.querySelector('[data-care-status]');
    if (s) s.textContent = 'Caregiver PDF opened locally. In the print dialog, choose Save as PDF.';
  }

  function refresh() {
    const root = document.querySelector('#careUxModalRoot'), form = root?.querySelector('#careShareForm');
    if (!form || !/caregiver access/i.test(root.querySelector('.pamet-modal-title')?.textContent || '')) return;
    let b = form.querySelector('#caregiverPdfDownload');
    if (S.isUltra?.() !== true) { b?.remove(); return; }
    if (!b) {
      b = document.createElement('button');
      b.type = 'button'; b.id = 'caregiverPdfDownload'; b.className = 'btn btn-ghost btn-block'; b.textContent = 'Download caregiver PDF';
      b.addEventListener('click', () => printCaregiver(root));
      form.querySelector('.pamet-form-actions')?.before(b);
    }
    const s = root.querySelector('[data-care-status]');
    if (s?.textContent.includes('Email delivery is not configured.')) s.textContent = 'Email delivery is not configured yet. Ultra can download the caregiver summary as a local PDF.';
  }

  window.addEventListener('pamet:entitlements', refresh);
  new MutationObserver(refresh).observe(document.documentElement, {childList:true, subtree:true});
  refresh();
})();
