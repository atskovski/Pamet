/* Pamet interaction controller — resilient Insights controls and live plan-aware logging feedback. */
(() => {
  'use strict';

  const S = window.PametStore;
  const BaseInsights = window.PametInsights;
  const E = window.PametEntitlements;
  if (!S || !BaseInsights?.buildObservations || !BaseInsights?.coverage) return;

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

  const state = { days: 7, category: 'all', showArchived: false, expanded: new Set(), status: '' };
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

  function archivedSet() {
    try { return new Set(JSON.parse(localStorage.getItem(archiveKey()) || '[]')); }
    catch { return new Set(); }
  }

  function saveArchived(set) {
    localStorage.setItem(archiveKey(), JSON.stringify([...set]));
  }

  function normalizeWindowForPlan() {
    if (isLongWindow(state.days) && !longHistory()) state.days = FREE_HISTORY_DAYS;
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

  function readiness(entries, observations) {
    const days = distinctDays(entries);
    const completeness = BaseInsights.coverage(entries);
    let label = 'Start your baseline';
    let note = 'Log your first day to begin building an observational baseline.';
    if (days > 0 && days < 3) {
      label = 'Baseline started';
      note = `${days} logged day${days === 1 ? '' : 's'} is enough to begin, but not enough for repeat comparisons.`;
    } else if (days < 7) {
      label = 'Early comparison stage';
      note = `${days} logged days can support simple summaries. Keep including ordinary days, not only symptom days.`;
    } else if (!observations.length) {
      label = 'Baseline ready';
      note = `Pamet has enough history for a ${state.days}-day summary, but no observation currently meets the display threshold.`;
    } else {
      label = `${observations.length} supported observation${observations.length === 1 ? '' : 's'}`;
      note = paidComparisons()
        ? `These observations summarize what was recorded together during the last ${state.days} days. They do not establish medical cause.`
        : `Free Insights summarizes recorded symptom frequency and direction during the last ${state.days} days without cross-factor comparisons.`;
    }
    return { days, completeness, label, note };
  }

  function completenessMessage(score, loggedDays) {
    if (!loggedDays) return `Log at least one day in this ${state.days}-day window to measure entry completeness.`;
    if (score >= 100) return 'Your logged entries include all recommended tracking details.';
    if (score >= 85) return 'Your logged entries include nearly all recommended tracking details.';
    if (score >= 70) return 'Your logged entries include most recommended tracking details.';
    if (score >= 50) return 'Adding a few more tracking details will make comparisons easier to interpret.';
    return 'Add more tracking details to the days you log to improve the quality of comparisons.';
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
    column.dataset.pametInsightsController = 'true';

    const entries = entriesWithin(state.days);
    const allObservations = BaseInsights.buildObservations(entries);
    const archived = archivedSet();
    if (!paidComparisons() && !['all', 'symptom'].includes(state.category)) state.category = 'all';
    const visible = allObservations
      .filter((item) => state.showArchived ? archived.has(item.id) : !archived.has(item.id))
      .filter((item) => state.category === 'all' || item.category === state.category);
    const info = readiness(entries, allObservations);
    const c = info.completeness;
    const completenessScore = Number(c.overall || 0);
    const completenessTitle = info.days ? `${completenessScore}% of logged entries complete` : 'No logged entries in this window';
    const completenessCopy = completenessMessage(completenessScore, info.days);
    const completenessItems = [['Symptoms', c.symptom], ['Sleep', c.sleep], ['Stress', c.stress], ['Hydration', c.hydration], ['Activity', c.activity], ['Medications', c.medication], ['Notes', c.notes]];
    const categories = paidComparisons()
      ? [['all', 'All'], ['symptom', 'Symptoms'], ['lifestyle', 'Lifestyle'], ['medication', 'Medications'], ['sleepstress', 'Sleep / Stress']]
      : [['all', 'All'], ['symptom', 'Symptoms']];
    const helper = paidComparisons()
      ? 'Pamet summarizes repeat relationships in what you record. It does not diagnose conditions or determine what caused a symptom.'
      : 'Free Insights summarizes symptom frequency and trend. Recorded-factor comparisons, What Changed, and medication observations unlock with Pro.';
    const historyNote = longHistory()
      ? 'Choose a window from one week through one year. Longer windows can make slow changes easier to compare.'
      : 'Free includes up to 90 days of history. Pro and Ultra unlock the 180-day and 365-day views.';

    column.innerHTML = `<div class="insights-page-head" data-insights-controller><div><span class="pamet-eyebrow">Observational history</span><h2 class="screen-title">Insights</h2><p class="pamet-helper">${escapeHtml(helper)}</p><p class="insights-window-summary" aria-live="polite">Showing the last <strong>${state.days} days</strong>.</p></div><div class="insights-window-wrap"><div class="insights-window" role="group" aria-label="Observation window">${WINDOWS.map(renderWindowButton).join('')}</div><p class="insights-window-note">${escapeHtml(historyNote)}</p></div></div>
      ${state.status ? `<div class="insights-action-status" role="status">${escapeHtml(state.status)}</div>` : ''}
      <section class="insights-readiness" aria-labelledby="readinessTitle"><div class="readiness-copy"><span class="pamet-eyebrow">Pattern readiness · ${state.days}-day window</span><h3 id="readinessTitle">${escapeHtml(info.label)}</h3><p>${escapeHtml(info.note)}</p></div><div class="readiness-score"><strong>${info.days}</strong><span>logged days in window</span></div></section>
      <section class="completeness-card" aria-labelledby="completenessTitle"><div class="completeness-summary"><span class="pamet-eyebrow">Data quality · last ${state.days} days</span><h3 id="completenessTitle">${escapeHtml(completenessTitle)}</h3><p class="completeness-context"><strong>${info.days} of ${state.days} days logged</strong><span aria-hidden="true">·</span><span>${escapeHtml(completenessCopy)}</span></p><p class="pamet-helper completeness-definition">Completeness measures how fully you filled out the entries you logged. It does not mean you logged every day in this window.</p></div><div class="completeness-grid">${completenessItems.map(([label, value]) => `<div class="completeness-item"><div><span>${escapeHtml(label)}</span><strong>${Number(value || 0)}%</strong></div><div class="mini-meter" aria-hidden="true"><progress max="100" value="${Number(value || 0)}"></progress></div></div>`).join('')}</div></section>
      <div class="insights-toolbar" aria-label="Insight filters"><div class="insights-categories">${categories.map(([key, label]) => `<button type="button" class="chip-btn${state.category === key ? ' active' : ''}" data-insights-category="${key}" aria-pressed="${state.category === key}">${label}</button>`).join('')}</div><button type="button" class="link-btn archived-toggle" data-insights-archived>${state.showArchived ? 'Back to active observations' : `Archived (${archived.size})`}</button></div>
      <div class="observation-list">${visible.length ? visible.map((item) => observationCard(item, archived.has(item.id))).join('') : emptyState(info, archived)}</div>`;

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
    window.addEventListener('pamet:profile-updated', () => { state.expanded.clear(); state.showArchived = false; schedulePlanHintRefresh(); scheduleInsightsRender(); });
    document.addEventListener('pamet:settings-rendered', schedulePlanHintRefresh);

    schedulePlanHintRefresh();
    scheduleInsightsRender();
  }

  window.PametInsightsController = Object.freeze({
    render: renderInsights,
    getState: () => ({ days: state.days, category: state.category, showArchived: state.showArchived }),
    windows: () => [...WINDOWS]
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
