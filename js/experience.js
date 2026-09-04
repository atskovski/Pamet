/* Pamet 1.5.0 — Visit Brief naming, long-history Calendar tools, and accessibility refinements. */
(() => {
  'use strict';
  const S = window.PametStore;
  const $ = (selector, root = document) => root.querySelector(selector);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const calState = { query: '', symptom: 'all' };

  function normalizeVisitBriefLanguage() {
    const title = $('#screen-report .screen-title');
    if (title) title.textContent = 'Visit Brief';
    const email = $('#emailReport');
    if (email) { email.innerHTML = `${window.PametIcons?.svg('mail') || ''} Email visit brief`; }
    const download = $('#downloadPdf');
    if (download) { download.innerHTML = `${window.PametIcons?.svg('download') || ''} Download PDF`; }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.parentElement?.closest('script,style')) continue;
      const original = node.nodeValue || '';
      const next = original.replace(/Doctor Report/g, 'Visit Brief').replace(/Doctor report/g, 'Visit Brief').replace(/doctor report/g, 'visit brief');
      if (next !== original) node.nodeValue = next;
    }
  }

  function monthIndexFromLabel(label) {
    const parsed = new Date(`${label} 1`);
    return Number.isNaN(parsed.getTime()) ? null : parsed.getFullYear() * 12 + parsed.getMonth();
  }
  function goToMonth(date) {
    const target = date.getFullYear() * 12 + date.getMonth();
    let current = monthIndexFromLabel($('#calMonth')?.textContent || '');
    if (current === null) return;
    let safety = 0;
    while (current !== target && safety < 120) {
      (current < target ? $('#calNext') : $('#calPrev'))?.click();
      current += current < target ? 1 : -1;
      safety += 1;
    }
  }
  function selectCalendarDate(date) {
    goToMonth(date);
    requestAnimationFrame(() => {
      const day = String(date.getDate());
      const cell = [...document.querySelectorAll('#calGrid .cal-cell:not(.empty)')].find((candidate) => candidate.querySelector('.num')?.textContent?.trim() === day);
      cell?.click(); cell?.focus?.();
    });
  }

  function calendarEntries() {
    if (!S) return [];
    const q = calState.query.trim().toLowerCase();
    return [...S.entries].filter((entry) => calState.symptom === 'all' || (entry.symptoms || []).includes(calState.symptom)).filter((entry) => {
      if (!q) return true;
      return [entry.date, ...(entry.symptoms || []), ...(entry.medications || []), entry.activity, entry.mood, entry.notes].filter(Boolean).join(' ').toLowerCase().includes(q);
    }).sort((a,b) => new Date(b.date) - new Date(a.date));
  }

  function renderHistoryResults(root) {
    const list = root.querySelector('[data-calendar-results]');
    if (!list) return;
    const entries = calendarEntries().slice(0, 50);
    if (!entries.length) {
      list.innerHTML = `<div class="calendar-history-empty">No entries match this search. Your journal data has not been changed.</div>`;
      return;
    }
    list.innerHTML = entries.map((entry) => `<button type="button" class="calendar-history-row" data-history-date="${esc(entry.date)}"><span class="history-date">${new Date(entry.date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</span><span class="history-main"><strong>${(entry.symptoms || []).length ? esc((entry.symptoms || []).join(', ')) : 'No symptoms recorded'}</strong><small>${esc([entry.activity && entry.activity !== 'None' ? entry.activity : '', Number.isFinite(Number(entry.sleepHours)) ? `${entry.sleepHours}h sleep` : '', Number.isFinite(Number(entry.stressLevel)) ? `stress ${entry.stressLevel}/10` : ''].filter(Boolean).join(' · '))}</small></span><span aria-hidden="true">›</span></button>`).join('');
    list.querySelectorAll('[data-history-date]').forEach((button) => button.addEventListener('click', () => selectCalendarDate(new Date(button.dataset.historyDate))));
  }

  function applyCalendarFilter(root) {
    const monthLabel = $('#calMonth')?.textContent || '';
    const monthDate = new Date(`${monthLabel} 1`);
    if (Number.isNaN(monthDate.getTime())) return;
    document.querySelectorAll('#calGrid .cal-cell:not(.empty)').forEach((cell) => {
      const day = Number(cell.querySelector('.num')?.textContent || 0);
      const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), day, 12);
      const entry = S?.entryForDate?.(date);
      const matches = calState.symptom === 'all' || Boolean(entry && (entry.symptoms || []).includes(calState.symptom));
      cell.classList.toggle('calendar-filtered-out', !matches);
    });
  }

  function installCalendarTools() {
    const screen = $('#screen-calendar'); const col = screen?.querySelector('.content-col');
    if (!screen || !col) return;
    const nav = screen.querySelector('.cal-nav');
    if (nav && !nav.querySelector('[data-calendar-today]')) {
      const today = document.createElement('button');
      today.type = 'button'; today.className = 'btn btn-ghost calendar-today'; today.dataset.calendarToday = 'true';
      today.innerHTML = `${window.PametIcons?.svg('today') || ''}<span>Today</span>`;
      today.addEventListener('click', () => selectCalendarDate(new Date()));
      nav.prepend(today);
    }
    let tools = screen.querySelector('.calendar-history-tools');
    if (!tools) {
      tools = document.createElement('section'); tools.className = 'calendar-history-tools'; tools.setAttribute('aria-label','Search health history');
      const symptoms = [...new Set((S?.entries || []).flatMap((entry) => entry.symptoms || []))].sort();
      tools.innerHTML = `<div class="calendar-search-row"><label class="calendar-search"><span data-pamet-icon="search"></span><span class="sr-only">Search health history</span><input type="search" inputmode="search" placeholder="Search entries, symptoms, medications, or notes" data-calendar-search value="${esc(calState.query)}"></label><label class="calendar-filter"><span data-pamet-icon="filter"></span><span class="sr-only">Filter by symptom</span><select data-calendar-symptom><option value="all">All symptoms</option>${symptoms.map((symptom) => `<option value="${esc(symptom)}"${calState.symptom===symptom?' selected':''}>${esc(symptom)}</option>`).join('')}</select></label></div><details class="calendar-history-drawer"><summary>Search results <span class="history-count">${calendarEntries().length}</span></summary><div class="calendar-history-list" data-calendar-results></div></details>`;
      const card = screen.querySelector('.cal-card'); card?.insertAdjacentElement('beforebegin', tools);
      tools.querySelector('[data-calendar-search]').addEventListener('input', (event) => { calState.query = event.currentTarget.value; tools.querySelector('.history-count').textContent = String(calendarEntries().length); renderHistoryResults(tools); });
      tools.querySelector('[data-calendar-symptom]').addEventListener('change', (event) => { calState.symptom = event.currentTarget.value; tools.querySelector('.history-count').textContent = String(calendarEntries().length); renderHistoryResults(tools); applyCalendarFilter(tools); });
      tools.querySelector('.calendar-history-drawer').addEventListener('toggle', (event) => { if (event.currentTarget.open) renderHistoryResults(tools); });
    }
    applyCalendarFilter(tools);
    window.PametIcons?.hydrate();
  }

  function installAccessibility() {
    if (!document.querySelector('.pamet-skip-link')) {
      const skip = document.createElement('a'); skip.href = '#screens'; skip.className = 'pamet-skip-link'; skip.textContent = 'Skip to Pamet content'; document.body.prepend(skip);
    }
    const screens = $('#screens'); if (screens) { screens.setAttribute('role','main'); screens.setAttribute('tabindex','-1'); }
    document.querySelectorAll('[data-tab]').forEach((button) => {
      const active = button.classList.contains('active');
      button.setAttribute('aria-current', active ? 'page' : 'false');
      if (!button.getAttribute('aria-label')) button.setAttribute('aria-label', (button.textContent || button.dataset.tab || '').trim());
    });
    document.querySelectorAll('.screen-title').forEach((heading, index) => { if (!heading.id) heading.id = `pametScreenTitle${index}`; heading.closest('.screen')?.setAttribute('aria-labelledby', heading.id); });
    document.querySelectorAll('button:not([aria-label])').forEach((button) => { if (!button.textContent.trim() && button.title) button.setAttribute('aria-label', button.title); });
  }

  function focusActiveScreen(event) {
    const nav = event.target.closest?.('[data-tab]'); if (!nav) return;
    requestAnimationFrame(() => {
      document.querySelectorAll('[data-tab]').forEach((button) => button.setAttribute('aria-current', button.classList.contains('active') ? 'page' : 'false'));
      const active = document.querySelector('.screen.active'); active?.querySelector('.screen-title,h1,h2')?.focus?.({ preventScroll:true });
    });
  }

  function refresh() { normalizeVisitBriefLanguage(); installCalendarTools(); installAccessibility(); window.PametIcons?.hydrate(); }
  document.addEventListener('click', (event) => { focusActiveScreen(event); if (event.target.closest('[data-tab="calendar"],#calPrev,#calNext')) setTimeout(installCalendarTools,0); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') document.querySelector('#quickProfileRoot [data-quick-close]')?.click(); });
  document.addEventListener('pamet:settings-rendered', refresh);
  window.addEventListener('pamet:login', () => setTimeout(refresh,30));
  window.addEventListener('pamet:registered', () => setTimeout(refresh,30));
  window.addEventListener('pamet:profile-updated', () => setTimeout(refresh,0));
  window.addEventListener('pamet:entry-saved', () => setTimeout(installCalendarTools,0));
  window.addEventListener('pageshow', refresh);
  refresh();
})();
