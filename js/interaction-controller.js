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
  const QUALITY_FIELDS = Object.freeze([
    Object.freeze({ key: 'symptom', label: 'Symptoms', test: (entry) => Array.isArray(entry.symptoms), next: 'Record whether symptoms were present or absent on the days you log.' }),
    Object.freeze({ key: 'sleep', label: 'Sleep', test: (entry) => Number.isFinite(Number(entry.sleepHours)), next: 'Add sleep duration more consistently so sleep comparisons use fewer gaps.' }),
    Object.freeze({ key: 'stress', label: 'Stress', test: (entry) => Number.isFinite(Number(entry.stressLevel)), next: 'Add a stress rating more consistently so stress comparisons use fewer gaps.' }),
    Object.freeze({ key: 'hydration', label: 'Hydration', test: (entry) => Number.isFinite(Number(entry.waterGlasses)), next: 'Add hydration more consistently so hydration comparisons use fewer gaps.' }),
    Object.freeze({ key: 'activity', label: 'Activity', test: (entry) => Boolean(String(entry.activity || '').trim()), next: 'Add activity more consistently so activity comparisons use fewer gaps.' }),
    Object.freeze({ key: 'medication', label: 'Medications', test: (entry) => Array.isArray(entry.medications), next: 'Record medication status on the days you log, including when none were taken.' }),
    Object.freeze({ key: 'notes', label: 'Notes', test: (entry) => Boolean(String(entry.notes || '').trim()), next: 'Add a short note when context matters; notes can explain changes that structured fields miss.' })
  ]);

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
    let label = 'No supported patterns yet';
    let note = `Pamet has not found a repeat pattern that meets the display threshold in this ${state.days}-day window.`;

    if (!days) {
      label = 'Start your baseline';
      note = `Log your first day in this ${state.days}-day window to begin building an observational baseline.`;
    } else if (days < 3) {
      label = 'Baseline started';
      note = `${days} logged day${days === 1 ? '' : 's'} can support a simple history summary, but Pamet needs more repeat history before surfacing stronger comparisons.`;
    } else if (!observations.length) {
      label = 'No supported patterns yet';
      note = `Pamet reviewed ${days} logged days in this ${state.days}-day window and did not force a conclusion from limited or inconsistent repeats.`;
    } else {
      label = `${observations.length} pattern${observations.length === 1 ? '' : 's'} worth reviewing`;
      note = `These are the specific observations Pamet can support from ${days} logged days inside this ${state.days}-day window. The details below explain what was compared.`;
    }
    return { days, completeness, label, note };
  }

  function fieldCoverage(entries) {
    return QUALITY_FIELDS.map((field) => {
      const count = entries.filter(field.test).length;
      return {
        key: field.key,
        label: field.label,
        count,
        total: entries.length,
        percent: percent(count, entries.length),
        next: field.next
      };
    });
  }

  function trackingQuality(entries, info) {
    const fields = fieldCoverage(entries);
    const completeness = Number(info.completeness?.overall || 0);
    const symptomDays = distinctDays(entries.filter((entry) => Array.isArray(entry.symptoms) && entry.symptoms.length > 0));
    const symptomFreeDays = distinctDays(entries.filter((entry) => Array.isArray(entry.symptoms) && entry.symptoms.length === 0));
    const consistency = percent(info.days, state.days);

    let level = 'No tracking foundation yet';
    let explanation = `There are no logged days in this ${state.days}-day window, so Pamet cannot evaluate tracking coverage yet.`;
    if (info.days > 0 && info.days < 3) {
      level = 'Limited tracking foundation';
      explanation = 'There is enough history to summarize what you entered, but not enough repeated days for dependable pattern comparisons.';
    } else if (info.days < 7 || completeness < 60) {
      level = 'Building tracking foundation';
      explanation = 'Pamet can begin simple comparisons, but additional logged days or more complete entries would make the pattern view more informative.';
    } else if (info.days >= 14 && completeness >= 80 && (symptomDays === 0 || symptomFreeDays >= 3)) {
      level = 'Strong tracking foundation';
      explanation = 'This window has repeated, detailed history and enough baseline variety for Pamet to make more useful observational comparisons.';
    } else {
      level = 'Good tracking foundation';
      explanation = 'This window has enough repeated history for useful summaries. A little more coverage or baseline variety would strengthen comparisons further.';
    }

    let nextAction = 'Keep logging as usual. This window already has a useful amount of structured detail.';
    if (!info.days) {
      nextAction = 'Log your first entry to begin the baseline.';
    } else if (info.days < 3) {
      const remaining = 3 - info.days;
      nextAction = `Log ${remaining} more day${remaining === 1 ? '' : 's'} to reach the first repeat-comparison baseline.`;
    } else if (symptomDays > 0 && symptomFreeDays < 2) {
      nextAction = 'When applicable, include ordinary or symptom-free days so Pamet has a baseline to compare against symptom days.';
    } else {
      const weakest = [...fields].sort((a, b) => a.percent - b.percent)[0];
      if (weakest && weakest.percent < 70) nextAction = weakest.next;
      else if (info.days < 7) nextAction = `Log ${7 - info.days} more day${7 - info.days === 1 ? '' : 's'} to give trend comparisons more history.`;
    }

    return {
      fields,
      completeness,
      consistency,
      symptomDays,
      symptomFreeDays,
      level,
      explanation,
      nextAction
    };
  }

  function observationPreview(item) {
    const trend = item.trend?.label || 'Developing';
    const supporting = Number(item.matchCount || 0);
    return `<button type="button" class="finding-preview" data-observation-jump="${escapeHtml(item.id)}">
      <span class="finding-preview-category">${escapeHtml(categoryLabel[item.category] || 'Observation')}</span>
      <strong>${escapeHtml(item.title)}</strong>
      <span class="finding-preview-meta">${supporting} supporting entr${supporting === 1 ? 'y' : 'ies'} <span aria-hidden="true">·</span> ${escapeHtml(trend)}</span>
    </button>`;
  }

  function findingsPreview(observations, info) {
    if (!observations.length) {
      const copy = info.days < 3
        ? `Keep logging inside this ${state.days}-day window. Pamet will show the exact observations here as soon as enough repeat history is available.`
        : `No observation currently clears Pamet's display threshold in this ${state.days}-day window. That is a valid result; Pamet will not manufacture a pattern from weak evidence.`;
      return `<div class="findings-empty"><span data-pamet-icon="insights"></span><div><strong>Nothing specific to review yet</strong><p>${escapeHtml(copy)}</p></div></div>`;
    }

    const preview = observations.slice(0, 4);
    const remainder = observations.length - preview.length;
    return `<div class="findings-preview-grid">${preview.map(observationPreview).join('')}</div>${remainder > 0 ? `<p class="findings-more">+${remainder} more supported pattern${remainder === 1 ? '' : 's'} in the detailed list below.</p>` : ''}`;
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

  function renderQualityField(item) {
    return `<div class="quality-field" data-quality-field="${escapeHtml(item.key)}">
      <div class="quality-field-head"><span>${escapeHtml(item.label)}</span><strong>${item.percent}%</strong></div>
      <div class="quality-field-meter"><progress max="100" value="${item.percent}" aria-label="${escapeHtml(item.label)} coverage ${item.percent}%"></progress></div>
      <span class="quality-field-count">${item.count} of ${item.total} logged entr${item.total === 1 ? 'y' : 'ies'}</span>
    </div>`;
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
    const activeObservations = allObservations.filter((item) => !archived.has(item.id));
    if (!paidComparisons() && !['all', 'symptom'].includes(state.category)) state.category = 'all';
    const visible = allObservations
      .filter((item) => state.showArchived ? archived.has(item.id) : !archived.has(item.id))
      .filter((item) => state.category === 'all' || item.category === state.category);
    const info = readiness(entries, activeObservations);
    const quality = trackingQuality(entries, info);
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
      <section class="insights-window-kpis" aria-label="${state.days}-day window snapshot">
        <div class="insights-kpi"><span>Patterns to review</span><strong data-pattern-count>${activeObservations.length}</strong><small>supported in this window</small></div>
        <div class="insights-kpi"><span>Logged days</span><strong>${info.days}<small> / ${state.days}</small></strong><small>${quality.consistency}% of calendar days</small></div>
        <div class="insights-kpi"><span>Symptom days</span><strong>${quality.symptomDays}</strong><small>days with one or more symptoms</small></div>
        <div class="insights-kpi"><span>Symptom-free days</span><strong>${quality.symptomFreeDays}</strong><small>baseline days recorded</small></div>
      </section>
      <section class="insights-findings-card" aria-labelledby="findingsTitle">
        <div class="findings-card-head"><div><span class="pamet-eyebrow">Pattern summary · ${state.days}-day window</span><h3 id="findingsTitle">${escapeHtml(info.label)}</h3><p>${escapeHtml(info.note)}</p></div><div class="findings-count" aria-label="${activeObservations.length} supported patterns"><strong>${activeObservations.length}</strong><span>${activeObservations.length === 1 ? 'pattern' : 'patterns'}</span></div></div>
        ${findingsPreview(activeObservations, info)}
      </section>
      <section class="tracking-quality-card" aria-labelledby="trackingQualityTitle">
        <div class="tracking-quality-head"><div><span class="pamet-eyebrow">Tracking quality · last ${state.days} days</span><h3 id="trackingQualityTitle">${escapeHtml(quality.level)}</h3><p>${escapeHtml(quality.explanation)}</p></div><div class="quality-next-step" data-quality-next><span>Most useful next step</span><strong>${escapeHtml(quality.nextAction)}</strong></div></div>
        <div class="quality-metrics">
          <div class="quality-metric" data-quality-metric="consistency"><span>Tracking consistency</span><strong>${quality.consistency}%</strong><p>${info.days} of ${state.days} calendar days logged</p><progress max="100" value="${quality.consistency}" aria-label="Tracking consistency ${quality.consistency}%"></progress></div>
          <div class="quality-metric" data-quality-metric="detail"><span>Entry detail</span><strong>${quality.completeness}%</strong><p>Average recommended-field coverage on days you logged</p><progress max="100" value="${quality.completeness}" aria-label="Entry detail ${quality.completeness}%"></progress></div>
          <div class="quality-metric" data-quality-metric="baseline"><span>Baseline mix</span><strong>${quality.symptomDays} / ${quality.symptomFreeDays}</strong><p>symptom days / symptom-free days recorded</p><div class="quality-baseline-note">${quality.symptomDays > 0 && quality.symptomFreeDays < 2 ? 'Add ordinary days when applicable for a better comparison baseline.' : 'This mix helps Pamet compare symptom and ordinary days without treating either as a cause.'}</div></div>
        </div>
        <div class="quality-fields-wrap"><div class="quality-fields-head"><div><span class="pamet-eyebrow">Tracking detail coverage</span><h4>What your entries consistently include</h4></div><p>Percentages below are based only on the entries you logged in this window.</p></div><div class="quality-fields-grid">${quality.fields.map(renderQualityField).join('')}</div></div>
        <p class="quality-footnote">Tracking quality describes journal coverage and balance. It does not measure diagnostic certainty or prove that one factor caused another.</p>
      </section>
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

    const jumpButton = event.target.closest('[data-observation-jump]');
    if (jumpButton) {
      event.preventDefault();
      const id = jumpButton.dataset.observationJump;
      if (!id) return;
      state.category = 'all';
      state.showArchived = false;
      state.expanded.add(id);
      renderInsights();
      requestAnimationFrame(() => {
        const card = $(`[data-observation-id="${CSS.escape(id)}"]`, screen);
        card?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      });
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