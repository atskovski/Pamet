/* Pamet interaction controller — resilient Insights controls and live plan-aware logging feedback. */
(() => {
  'use strict';

  const S = window.PametStore;
  const BaseInsights = window.PametInsights;
  const Charts = window.PametInsightsCharts;
  const E = window.PametEntitlements;
  if (!S || !BaseInsights?.buildObservations || !BaseInsights?.coverage || !Charts?.render) return;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const WINDOWS = Object.freeze([7, 14, 30, 60, 90, 180, 365]);
  const FREE_HISTORY_DAYS = 90;
  const categoryLabel = Object.freeze({ symptom: 'Symptoms', lifestyle: 'Lifestyle', medication: 'Medications', sleepstress: 'Sleep / Stress' });
  const planCategories = Object.freeze({
    symptoms: Object.freeze({ selector: '#symptomGrid .sym-btn.selected', plural: 'symptoms' }),
    moods: Object.freeze({ selector: '#moodFlow .chip.selected', plural: 'moods' }),
    activities: Object.freeze({ selector: '#activityFlow .chip.selected', plural: 'activities' }),
    meds: Object.freeze({ selector: '#medFlow .chip.selected', plural: 'medications' })
  });

  const state = {
    days: 7,
    category: 'all',
    showArchived: false,
    expanded: new Set(),
    status: '',
    chartMode: 'basic',
    chartMetric: 'frequency',
    chartSymptom: 'all',
    chartType: 'line'
  };
  const profileId = () => String(S.activeProfile?.id || 'primary');
  const archiveKey = () => `pamet_archived_observations_v1_${profileId()}`;
  const paidComparisons = () => E?.has?.('correlations') === true;
  const longHistory = () => E?.has?.('unlimitedHistory') === true;
  const isLongWindow = (days) => Number(days) > FREE_HISTORY_DAYS;
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const parseDate = (value) => new Date(value);
  const dayKey = (value) => {
    const date = parseDate(value);
    if (Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  };
  const formatDate = (value) => parseDate(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const distinctDays = (entries) => new Set(entries.map((entry) => dayKey(entry.date)).filter(Boolean)).size;
  const percent = (numerator, denominator) => denominator ? Math.round((Number(numerator || 0) / Number(denominator)) * 100) : 0;

  function archivedSet() {
    try { return new Set(JSON.parse(localStorage.getItem(archiveKey()) || '[]')); }
    catch { return new Set(); }
  }

  function saveArchived(set) {
    localStorage.setItem(archiveKey(), JSON.stringify([...set]));
  }

  function normalizeWindowForPlan() {
    if (isLongWindow(state.days) && !longHistory()) state.days = FREE_HISTORY_DAYS;
    if (!paidComparisons() && state.chartMode === 'advanced') state.chartMode = 'basic';
  }

  function entriesWithin(days) {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const start = new Date(end);
    start.setDate(start.getDate() - days + 1);
    start.setHours(0, 0, 0, 0);
    return [...(S.entries || [])].filter((entry) => {
      const date = parseDate(entry?.date);
      return !Number.isNaN(date.getTime()) && date >= start && date <= end;
    });
  }

  function insightSummary(entries, observations) {
    const days = distinctDays(entries);
    const c = BaseInsights.coverage(entries);
    const symptomDays = distinctDays(entries.filter((entry) => (entry.symptoms || []).length));
    const clearDays = distinctDays(entries.filter((entry) => Array.isArray(entry.symptoms) && !entry.symptoms.length));
    const consistency = percent(days, state.days);
    const fields = [['Symptoms','symptom'],['Sleep','sleep'],['Stress','stress'],['Hydration','hydration'],['Activity','activity'],['Medications','medication'],['Notes','notes']].map(([label,key]) => [label,key,Number(c[key] || 0)]);
    let label = observations.length ? `${observations.length} pattern${observations.length === 1 ? '' : 's'} worth reviewing` : 'No supported patterns yet';
    let note = observations.length ? `These are the specific observations Pamet can support from ${days} logged days in this ${state.days}-day window.` : `Pamet did not find a repeat pattern that clears the display threshold in this ${state.days}-day window.`;
    if (!days) { label = 'Start your baseline'; note = `Log your first day in this ${state.days}-day window to begin building an observational baseline.`; }
    else if (days < 3 && !observations.length) { label = 'Baseline started'; note = `${days} logged day${days === 1 ? '' : 's'} can support a history summary; more repeat history is needed for stronger comparisons.`; }
    const level = !days ? 'No tracking foundation yet' : days < 3 ? 'Limited tracking foundation' : days < 7 || c.overall < 60 ? 'Building tracking foundation' : days >= 14 && c.overall >= 80 && (!symptomDays || clearDays >= 3) ? 'Strong tracking foundation' : 'Good tracking foundation';
    const weak = [...fields].sort((a,b) => a[2] - b[2])[0];
    const next = !days ? 'Log your first entry to begin the baseline.' : days < 3 ? `Log ${3-days} more day${3-days === 1 ? '' : 's'} to reach the first repeat-comparison baseline.` : symptomDays && clearDays < 2 ? 'When applicable, include symptom-free days so Pamet has a comparison baseline.' : weak?.[2] < 70 ? `Add ${weak[0].toLowerCase()} more consistently on the days you log.` : 'Keep logging as usual; this window already has useful structured detail.';
    return { days, c, symptomDays, clearDays, consistency, fields, label, note, level, next };
  }

  function observationCard(item, isArchived) {
    const id = `evidence-${item.id.replace(/[^a-z0-9]+/gi, '-')}`;
    const expanded = state.expanded.has(item.id);
    const evidence = Array.isArray(item.evidence) ? item.evidence : [];
    return `<article class="observation-card" data-observation-id="${escapeHtml(item.id)}" data-category="${escapeHtml(item.category)}">
      <div class="observation-top"><div><span class="observation-category">${escapeHtml(categoryLabel[item.category] || 'Observation')}</span><h3>${escapeHtml(item.title)}</h3></div><span class="trend-badge ${escapeHtml(item.trend?.key || 'developing')}">${escapeHtml(item.trend?.label || 'Developing')}</span></div>
      <p class="observation-summary">${escapeHtml(item.summary)}</p>
      <div class="observation-history"><span><strong>First seen</strong>${item.firstSeen ? escapeHtml(formatDate(item.firstSeen)) : '—'}</span><span><strong>Last seen</strong>${item.lastSeen ? escapeHtml(formatDate(item.lastSeen)) : '—'}</span><span><strong>Supporting entries</strong>${Number(item.matchCount || 0)}</span></div>
      <div class="observation-actions"><button type="button" class="link-btn" data-observation-evidence="${escapeHtml(item.id)}" aria-expanded="${expanded}" aria-controls="${id}">${expanded ? 'Hide supporting history' : 'Why am I seeing this?'}</button><button type="button" class="link-btn archive-action" data-observation-archive="${escapeHtml(item.id)}" aria-label="${isArchived ? 'Restore' : 'Archive'} ${escapeHtml(item.title)}">${window.PametIcons?.svg(isArchived ? 'restore' : 'archive') || ''}${isArchived ? 'Restore' : 'Archive'}</button></div>
      <div class="observation-evidence${expanded ? ' is-open' : ''}" id="${id}" ${expanded ? '' : 'hidden'}><h4>Why Pamet surfaced this</h4><p class="evidence-window">Based on entries in your selected ${state.days}-day window.</p><ul>${evidence.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul><p class="trend-explanation">${escapeHtml(item.trend?.explanation || 'Pamet needs more history before it can compare recent and earlier frequency.')}</p><p class="observation-caution">Use this as a prompt for your own notes or a clinician conversation—not as a diagnosis or treatment recommendation.</p></div>
    </article>`;
  }

  function emptyState(info, archived) {
    if (state.showArchived) return '<section class="insights-empty"><span data-pamet-icon="archive"></span><h3>No archived observations</h3><p>Archiving removes an observation from the active Insights workspace only. Your journal entries stay unchanged.</p></section>';
    const category = state.category === 'all' ? '' : ` for ${categoryLabel[state.category]}`;
    return `<section class="insights-empty"><span data-pamet-icon="insights"></span><h3>No supported observations${category}</h3><p>${info.days < 3 ? `Keep logging complete entries so Pamet has enough history to summarize inside this ${state.days}-day window.` : `Pamet is not forcing a conclusion from limited or inconsistent data in this ${state.days}-day window. Keep tracking and this view will update as your history changes.`}</p>${archived.size ? '<button type="button" class="link-btn" data-insights-archived>Review archived observations</button>' : ''}</section>`;
  }

  function renderWindowButton(days) {
    const locked = isLongWindow(days) && !longHistory();
    const classes = `chip-btn${state.days === days ? ' active' : ''}${locked ? ' history-locked' : ''}`;
    const lockLabel = locked ? '<span class="insights-window-lock" aria-hidden="true">Pro+</span>' : '';
    return `<button type="button" data-insights-days="${days}" class="${classes}" aria-pressed="${state.days === days}"${locked ? ' aria-label="' + days + ' days — Pro and Ultra"' : ''}><span>${days} days</span>${lockLabel}</button>`;
  }

  function renderInsights() {
    const screen = $('#screen-patterns');
    const column = screen?.querySelector('.content-col');
    if (!screen || !column) return;
    normalizeWindowForPlan();
    screen.dataset.insightsV15Rendering = 'true';
    screen.dataset.insightsCharting = 'true';
    column.dataset.pametInsightsController = 'true';

    const entries = entriesWithin(state.days);
    const all = BaseInsights.buildObservations(entries);
    const archived = archivedSet();
    const active = all.filter((item) => !archived.has(item.id));
    if (!paidComparisons() && !['all','symptom'].includes(state.category)) state.category = 'all';
    const visible = all.filter((item) => state.showArchived ? archived.has(item.id) : !archived.has(item.id)).filter((item) => state.category === 'all' || item.category === state.category);
    const info = insightSummary(entries, active);
    const categories = paidComparisons() ? [['all','All'],['symptom','Symptoms'],['lifestyle','Lifestyle'],['medication','Medications'],['sleepstress','Sleep / Stress']] : [['all','All'],['symptom','Symptoms']];
    const helper = paidComparisons() ? 'Pamet summarizes repeat relationships in what you record. It does not diagnose conditions or determine what caused a symptom.' : 'Free Insights summarizes symptom frequency and trend. Recorded-factor comparisons and medication observations unlock with Pro.';
    const historyNote = longHistory()
      ? 'Choose a window from 7 through 365 days. Charts keep one calendar-day slot per day and thin only the date labels as the window grows.'
      : 'Free includes up to 90 days of history. Pro and Ultra unlock 180-day and 365-day views plus advanced charting.';
    const findings = active.length ? `<div class="findings-preview-grid">${active.slice(0,4).map((item) => `<div class="finding-preview"><span class="finding-preview-category">${escapeHtml(categoryLabel[item.category] || 'Observation')}</span><strong>${escapeHtml(item.title)}</strong><span class="finding-preview-meta">${Number(item.matchCount || 0)} supporting entr${Number(item.matchCount || 0) === 1 ? 'y' : 'ies'} · ${escapeHtml(item.trend?.label || 'Developing')}</span></div>`).join('')}</div>${active.length > 4 ? `<p class="findings-more">+${active.length-4} more in the detailed list below.</p>` : ''}` : `<div class="findings-empty"><span data-pamet-icon="insights"></span><div><strong>Nothing specific to review yet</strong><p>Keep tracking; Pamet will not manufacture a pattern from weak evidence.</p></div></div>`;
    const fields = info.fields.map(([label,key,value]) => `<div class="quality-field" data-quality-field="${key}"><div class="quality-field-head"><span>${label}</span><strong>${value}%</strong></div><div class="quality-field-meter"><progress max="100" value="${value}" aria-label="${label} coverage ${value}%"></progress></div><span class="quality-field-count">${Math.round(value * entries.length / 100)} of ${entries.length} logged entr${entries.length === 1 ? 'y' : 'ies'}</span></div>`).join('');
    const chart = Charts.render({
      entries,
      days:state.days,
      mode:state.chartMode,
      metric:state.chartMetric,
      symptom:state.chartSymptom,
      chartType:state.chartType,
      advancedEnabled:paidComparisons()
    });

    column.innerHTML = `<div class="insights-page-head" data-insights-controller><div><span class="pamet-eyebrow">Observational history</span><h2 class="screen-title">Insights</h2><p class="pamet-helper">${escapeHtml(helper)}</p><p class="insights-window-summary" aria-live="polite">Showing the last <strong>${state.days} days</strong>.</p></div><div class="insights-window-wrap"><div class="insights-window" role="group" aria-label="Observation window">${WINDOWS.map(renderWindowButton).join('')}</div><p class="insights-window-note">${escapeHtml(historyNote)}</p></div></div>
      ${state.status ? `<div class="insights-action-status" role="status">${escapeHtml(state.status)}</div>` : ''}
      <section class="insights-window-kpis" aria-label="${state.days}-day window snapshot"><div class="insights-kpi"><span>Patterns to review</span><strong data-pattern-count>${active.length}</strong><small>supported in this window</small></div><div class="insights-kpi"><span>Logged days</span><strong>${info.days}<small> / ${state.days}</small></strong><small>${info.consistency}% of calendar days</small></div><div class="insights-kpi"><span>Symptom days</span><strong>${info.symptomDays}</strong><small>days with symptoms</small></div><div class="insights-kpi"><span>Symptom-free days</span><strong>${info.clearDays}</strong><small>comparison baseline days</small></div></section>
      ${chart}
      <section class="insights-findings-card" aria-labelledby="findingsTitle"><div class="findings-card-head"><div><span class="pamet-eyebrow">Pattern summary · ${state.days}-day window</span><h3 id="findingsTitle">${escapeHtml(info.label)}</h3><p>${escapeHtml(info.note)}</p></div><div class="findings-count"><strong>${active.length}</strong><span>${active.length === 1 ? 'pattern' : 'patterns'}</span></div></div>${findings}</section>
      <section class="tracking-quality-card" aria-labelledby="trackingQualityTitle"><div class="tracking-quality-head"><div><span class="pamet-eyebrow">Tracking quality · last ${state.days} days</span><h3 id="trackingQualityTitle">${escapeHtml(info.level)}</h3><p>Based on how often you logged, how complete those entries were, and whether symptom-free baseline days are available.</p></div><div class="quality-next-step" data-quality-next><span>Most useful next step</span><strong>${escapeHtml(info.next)}</strong></div></div><div class="quality-metrics"><div class="quality-metric" data-quality-metric="consistency"><span>Tracking consistency</span><strong>${info.consistency}%</strong><p>${info.days} of ${state.days} calendar days logged</p><progress max="100" value="${info.consistency}"></progress></div><div class="quality-metric" data-quality-metric="detail"><span>Entry detail</span><strong>${Number(info.c.overall || 0)}%</strong><p>recommended-field coverage on logged entries</p><progress max="100" value="${Number(info.c.overall || 0)}"></progress></div><div class="quality-metric" data-quality-metric="baseline"><span>Baseline mix</span><strong>${info.symptomDays} / ${info.clearDays}</strong><p>symptom days / symptom-free days</p><div class="quality-baseline-note">${info.symptomDays && info.clearDays < 2 ? 'Add ordinary days when applicable for a better baseline.' : 'Helps compare symptom and ordinary days without implying cause.'}</div></div></div><div class="quality-fields-wrap"><div class="quality-fields-head"><div><span class="pamet-eyebrow">Tracking detail coverage</span><h4>What your entries consistently include</h4></div><p>Based only on entries logged in this window.</p></div><div class="quality-fields-grid">${fields}</div></div><p class="quality-footnote">Tracking quality describes journal coverage and balance. It does not measure diagnostic certainty or prove causation.</p></section>
      <div class="insights-toolbar" aria-label="Insight filters"><div class="insights-categories">${categories.map(([key,label]) => `<button type="button" class="chip-btn${state.category === key ? ' active' : ''}" data-insights-category="${key}" aria-pressed="${state.category === key}">${label}</button>`).join('')}</div><button type="button" class="link-btn archived-toggle" data-insights-archived>${state.showArchived ? 'Back to active observations' : `Archived (${archived.size})`}</button></div><div class="observation-list">${visible.length ? visible.map((item) => observationCard(item, archived.has(item.id))).join('') : emptyState(info, archived)}</div>`;
    window.PametIcons?.hydrate?.();
  }

  function flashStatus(message) {
    state.status = message;
    renderInsights();
    window.setTimeout(() => {
      if (state.status !== message) return;
      state.status = '';
      $('#screen-patterns .insights-action-status')?.remove();
    }, 4200);
  }

  function handleInsightsClick(event) {
    const screen = event.target?.closest?.('#screen-patterns');
    if (!screen) return;

    const windowButton = event.target.closest('[data-insights-days]');
    if (windowButton) {
      const days = Number(windowButton.dataset.insightsDays);
      if (!WINDOWS.includes(days)) return;
      if (isLongWindow(days) && !longHistory()) {
        E?.requireAccess?.({ feature: 'unlimitedHistory', label: 'Long-term Insights' }, event);
        return;
      }
      event.preventDefault();
      state.days = days;
      state.expanded.clear();
      state.status = '';
      renderInsights();
      return;
    }

    const chartModeButton = event.target.closest('[data-chart-mode]');
    if (chartModeButton) {
      event.preventDefault();
      const mode = chartModeButton.dataset.chartMode;
      if (mode === 'advanced' && !paidComparisons()) {
        E?.requireAccess?.({ feature: 'correlations', label: 'Advanced charting' }, event);
        return;
      }
      state.chartMode = mode === 'advanced' ? 'advanced' : 'basic';
      state.status = '';
      renderInsights();
      return;
    }

    const chartTypeButton = event.target.closest('[data-chart-type]');
    if (chartTypeButton) {
      event.preventDefault();
      state.chartType = chartTypeButton.dataset.chartType === 'bar' ? 'bar' : 'line';
      state.status = '';
      renderInsights();
      return;
    }

    const chartMetricButton = event.target.closest('[data-chart-metric]');
    if (chartMetricButton) {
      event.preventDefault();
      const metric = chartMetricButton.dataset.chartMetric;
      if (!paidComparisons() || state.chartMode !== 'advanced' || !Charts.metrics().includes(metric)) return;
      state.chartMetric = metric;
      state.status = '';
      renderInsights();
      return;
    }

    const categoryButton = event.target.closest('[data-insights-category]');
    if (categoryButton) {
      event.preventDefault();
      state.category = categoryButton.dataset.insightsCategory || 'all';
      state.status = '';
      renderInsights();
      return;
    }

    const archivedButton = event.target.closest('[data-insights-archived]');
    if (archivedButton) {
      event.preventDefault();
      state.showArchived = !state.showArchived;
      state.expanded.clear();
      state.status = '';
      renderInsights();
      return;
    }

    const evidenceButton = event.target.closest('[data-observation-evidence]');
    if (evidenceButton) {
      event.preventDefault();
      const id = evidenceButton.dataset.observationEvidence;
      if (!id) return;
      if (state.expanded.has(id)) state.expanded.delete(id);
      else state.expanded.add(id);
      renderInsights();
      const card = $(`[data-observation-id="${CSS.escape(id)}"]`, screen);
      card?.querySelector('.observation-evidence')?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
      return;
    }

    const archiveButton = event.target.closest('[data-observation-archive]');
    if (archiveButton) {
      event.preventDefault();
      const id = archiveButton.dataset.observationArchive;
      if (!id) return;
      const set = archivedSet();
      const restoring = set.has(id);
      if (restoring) set.delete(id); else set.add(id);
      saveArchived(set);
      state.expanded.delete(id);
      flashStatus(restoring ? 'Observation restored to active Insights.' : 'Observation archived. Your journal entries were not changed.');
    }
  }

  function handleInsightsChange(event) {
    const select = event.target?.closest?.('#screen-patterns [data-chart-symptom]');
    if (!select) return;
    state.chartSymptom = select.value || 'all';
    state.status = '';
    renderInsights();
  }

  function selectedCount(config) {
    return $$(config.selector).filter((element) => {
      const label = element.textContent.trim();
      return label && label !== 'None';
    }).length;
  }

  function updatePlanHint(category, config) {
    const hint = $(`[data-plan-limit="${category}"]`);
    const text = hint?.querySelector('.plan-limit-text');
    if (!hint || !text || typeof S.customFieldPolicy !== 'function') return;
    const policy = S.customFieldPolicy(category);
    const selected = selectedCount(config);
    const selectedCopy = `${selected} selected${category === 'symptoms' ? ' today' : ''}.`;

    if (category === 'meds' && policy.plan === 'free') {
      text.textContent = `Free plan · Standard medication categories are included. Specific medication names are available with Pro and Ultra · ${selectedCopy}`;
    } else if (policy.unlimited) {
      text.textContent = `${policy.planName} plan · Unlimited custom ${config.plural} · ${selectedCopy}`;
    } else {
      text.textContent = `${policy.planName} plan · ${policy.count} of ${policy.limit} custom ${config.plural} used · ${selectedCopy}`;
    }
  }

  function refreshPlanHints() {
    Object.entries(planCategories).forEach(([category, config]) => updatePlanHint(category, config));
  }

  function schedulePlanHintRefresh() {
    queueMicrotask(refreshPlanHints);
    requestAnimationFrame(refreshPlanHints);
    setTimeout(refreshPlanHints, 0);
  }

  function scheduleInsightsRender() {
    requestAnimationFrame(() => {
      const screen = $('#screen-patterns');
      if (screen?.classList.contains('active')) renderInsights();
    });
  }

  function boot() {
    const patternScreen = $('#screen-patterns');
    if (patternScreen) patternScreen.dataset.insightsV15Rendering = 'true';

    document.addEventListener('click', handleInsightsClick, true);
    document.addEventListener('change', handleInsightsChange, true);
    document.addEventListener('click', (event) => {
      if (event.target.closest?.('[data-tab="patterns"], [data-nav="patterns"]')) setTimeout(renderInsights, 0);
      if (event.target.closest?.('#symptomGrid .sym-btn, #moodFlow .chip, #activityFlow .chip, #medFlow .chip, #addSymptomPlus, #addMoodPlus, #addActivityPlus, #addMedPlus')) schedulePlanHintRefresh();
    }, true);
    document.addEventListener('change', (event) => {
      if (event.target?.closest?.('#logBackdrop, #screen-settings')) schedulePlanHintRefresh();
    });

    ['#symptomGrid', '#moodFlow', '#activityFlow', '#medFlow'].forEach((selector) => {
      const target = $(selector);
      if (target) new MutationObserver(schedulePlanHintRefresh).observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    });
    const planLine = $('#planLineText');
    if (planLine) new MutationObserver(schedulePlanHintRefresh).observe(planLine, { childList: true, characterData: true, subtree: true });

    window.addEventListener('pamet:entry-saved', () => { schedulePlanHintRefresh(); scheduleInsightsRender(); });
    window.addEventListener('pamet:entitlements', () => { schedulePlanHintRefresh(); scheduleInsightsRender(); });
    window.addEventListener('pamet:login', () => { schedulePlanHintRefresh(); scheduleInsightsRender(); });
    window.addEventListener('pamet:registered', () => { schedulePlanHintRefresh(); scheduleInsightsRender(); });
    window.addEventListener('pamet:profile-updated', () => {
      state.expanded.clear();
      state.showArchived = false;
      state.chartMode = 'basic';
      state.chartMetric = 'frequency';
      state.chartSymptom = 'all';
      state.chartType = 'line';
      schedulePlanHintRefresh();
      scheduleInsightsRender();
    });
    document.addEventListener('pamet:settings-rendered', schedulePlanHintRefresh);

    schedulePlanHintRefresh();
    scheduleInsightsRender();
  }

  window.PametInsightsController = Object.freeze({
    render: renderInsights,
    getState: () => ({
      days: state.days,
      category: state.category,
      showArchived: state.showArchived,
      chartMode: state.chartMode,
      chartMetric: state.chartMetric,
      chartSymptom: state.chartSymptom,
      chartType: state.chartType
    }),
    windows: () => [...WINDOWS]
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();