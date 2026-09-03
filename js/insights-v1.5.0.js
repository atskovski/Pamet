/* Pamet 1.5.0 — observational Insights workspace. Never diagnoses or asserts causation. */
(() => {
  'use strict';
  const S = window.PametStore;
  if (!S) return;
  const $ = (selector, root = document) => root.querySelector(selector);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const state = { category: 'all', days: 30, showArchived: false };
  const PROFILE = () => String(S.activeProfile?.id || 'primary');
  const archiveKey = () => `pamet_archived_observations_v1_${PROFILE()}`;
  const archiveSet = () => { try { return new Set(JSON.parse(localStorage.getItem(archiveKey()) || '[]')); } catch { return new Set(); } };
  const saveArchive = (set) => localStorage.setItem(archiveKey(), JSON.stringify([...set]));
  const dateOnly = (value) => new Date(value);
  const dayKey = (value) => { const d = dateOnly(value); return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`; };
  const fmt = (value) => dateOnly(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const avg = (values) => values.length ? values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length : 0;
  const pct = (n, d) => d ? Math.round(n / d * 100) : 0;
  const within = (entries, days) => { const cutoff = new Date(); cutoff.setHours(23,59,59,999); cutoff.setDate(cutoff.getDate() - days + 1); return entries.filter((entry) => dateOnly(entry.date) >= cutoff); };
  const distinctDays = (entries) => new Set(entries.map((entry) => dayKey(entry.date))).size;
  const categoryLabel = { symptom: 'Symptoms', lifestyle: 'Lifestyle', medication: 'Medications', sleepstress: 'Sleep / Stress' };

  function coverage(entries) {
    if (!entries.length) return { overall: 0, symptom: 0, sleep: 0, stress: 0, hydration: 0, activity: 0, medication: 0, notes: 0 };
    const has = (fn) => pct(entries.filter(fn).length, entries.length);
    const result = {
      symptom: has((e) => Array.isArray(e.symptoms)),
      sleep: has((e) => Number.isFinite(Number(e.sleepHours))),
      stress: has((e) => Number.isFinite(Number(e.stressLevel))),
      hydration: has((e) => Number.isFinite(Number(e.waterGlasses))),
      activity: has((e) => Boolean(e.activity)),
      medication: has((e) => Array.isArray(e.medications)),
      notes: has((e) => Boolean(String(e.notes || '').trim()))
    };
    result.overall = Math.round(Object.values(result).reduce((sum, value) => sum + value, 0) / Object.keys(result).length);
    return result;
  }

  function trendFor(matches, allEntries) {
    if (allEntries.length < 6) return { key: 'developing', label: 'Developing', explanation: 'More logged days are needed before Pamet can compare recent and earlier frequency.' };
    const sorted = [...allEntries].sort((a,b) => dateOnly(a.date) - dateOnly(b.date));
    const midpoint = Math.floor(sorted.length / 2);
    const earlier = sorted.slice(0, midpoint);
    const recent = sorted.slice(midpoint);
    const matchIds = new Set(matches.map((entry) => entry.id || `${entry.date}|${entry.notes || ''}`));
    const rate = (pool) => pct(pool.filter((entry) => matchIds.has(entry.id || `${entry.date}|${entry.notes || ''}`)).length, pool.length);
    const delta = rate(recent) - rate(earlier);
    if (delta >= 15) return { key: 'strengthening', label: 'More frequent recently', explanation: `This observation appeared ${Math.abs(delta)} percentage points more often in the recent half of this window.` };
    if (delta <= -15) return { key: 'weakening', label: 'Less frequent recently', explanation: `This observation appeared ${Math.abs(delta)} percentage points less often in the recent half of this window.` };
    return { key: 'stable', label: 'Similar frequency', explanation: 'Recent and earlier frequency are broadly similar in this window.' };
  }

  function observation({ id, category, title, summary, matches, entries, evidence, confidence = 'supported' }) {
    const sorted = [...matches].sort((a,b) => dateOnly(a.date) - dateOnly(b.date));
    return {
      id, category, title, summary, evidence, confidence,
      matchCount: matches.length,
      firstSeen: sorted[0]?.date || null,
      lastSeen: sorted.at(-1)?.date || null,
      trend: trendFor(matches, entries)
    };
  }

  function buildObservations(entries) {
    if (!entries.length) return [];
    const observations = [];
    const symptomCounts = new Map();
    entries.forEach((entry) => (entry.symptoms || []).forEach((symptom) => symptomCounts.set(symptom, (symptomCounts.get(symptom) || 0) + 1)));
    const topSymptom = [...symptomCounts.entries()].sort((a,b) => b[1] - a[1])[0];
    if (topSymptom) {
      const [name, count] = topSymptom;
      const matches = entries.filter((entry) => (entry.symptoms || []).includes(name));
      observations.push(observation({
        id: `symptom-frequency:${name}`,
        category: 'symptom',
        title: `${name} is your most frequently recorded symptom`,
        summary: `${name} was recorded on ${count} of ${distinctDays(entries)} logged days in this window (${pct(count, distinctDays(entries))}%).`,
        matches, entries,
        evidence: [`${count} logged day${count === 1 ? '' : 's'} included ${name}.`, `Average recorded severity on those entries: ${avg(matches.map((e) => e.severity)).toFixed(1)} / 10.`, 'This describes your recorded history and does not identify a cause.']
      }));
    }

    const symptomDays = entries.filter((entry) => (entry.symptoms || []).length > 0);
    const clearDays = entries.filter((entry) => (entry.symptoms || []).length === 0);
    if (symptomDays.length >= 2 && clearDays.length >= 2) {
      const symptomSleep = avg(symptomDays.map((e) => e.sleepHours).filter((v) => Number.isFinite(Number(v))));
      const clearSleep = avg(clearDays.map((e) => e.sleepHours).filter((v) => Number.isFinite(Number(v))));
      if (symptomSleep && clearSleep && Math.abs(symptomSleep - clearSleep) >= 0.5) {
        const lowerOnSymptomDays = symptomSleep < clearSleep;
        observations.push(observation({
          id: 'sleep:symptom-day-difference', category: 'sleepstress',
          title: `Recorded sleep was ${lowerOnSymptomDays ? 'lower' : 'higher'} on symptom days`,
          summary: `Average recorded sleep was ${symptomSleep.toFixed(1)} hours on symptom days versus ${clearSleep.toFixed(1)} hours on symptom-free logged days.`,
          matches: symptomDays, entries,
          evidence: [`${symptomDays.length} symptom-day entries were compared with ${clearDays.length} symptom-free entries.`, `Difference: ${Math.abs(symptomSleep-clearSleep).toFixed(1)} hours.`, 'This is an association in the journal, not evidence that sleep caused or prevented symptoms.']
        }));
      }
    }

    const highStress = entries.filter((entry) => Number(entry.stressLevel) >= 7);
    const lowerStress = entries.filter((entry) => Number(entry.stressLevel) < 7 && Number.isFinite(Number(entry.stressLevel)));
    if (highStress.length >= 2 && lowerStress.length >= 2) {
      const highSymptom = highStress.filter((entry) => (entry.symptoms || []).length).length;
      const lowSymptom = lowerStress.filter((entry) => (entry.symptoms || []).length).length;
      const highRate = pct(highSymptom, highStress.length); const lowRate = pct(lowSymptom, lowerStress.length);
      if (Math.abs(highRate-lowRate) >= 15) {
        observations.push(observation({
          id: 'stress:symptom-cooccurrence', category: 'sleepstress',
          title: 'Symptoms and higher stress were recorded together at a different rate',
          summary: `Symptoms were recorded on ${highRate}% of high-stress logged days and ${lowRate}% of lower-stress logged days.`,
          matches: highStress.filter((entry) => (entry.symptoms || []).length), entries,
          evidence: [`High stress is defined here as a recorded stress level of 7–10.`, `${highStress.length} high-stress days and ${lowerStress.length} lower-stress days were available.`, 'Pamet is comparing co-occurrence only; it is not determining direction or cause.']
        }));
      }
    }

    const lowWater = entries.filter((entry) => Number(entry.waterGlasses) > 0 && Number(entry.waterGlasses) < 5);
    const moreWater = entries.filter((entry) => Number(entry.waterGlasses) >= 5);
    if (lowWater.length >= 2 && moreWater.length >= 2) {
      const lowRate = pct(lowWater.filter((e) => (e.symptoms || []).length).length, lowWater.length);
      const highRate = pct(moreWater.filter((e) => (e.symptoms || []).length).length, moreWater.length);
      if (Math.abs(lowRate-highRate) >= 15) {
        observations.push(observation({
          id: 'lifestyle:hydration-comparison', category: 'lifestyle',
          title: 'Symptom recording differed across hydration ranges',
          summary: `Symptoms were recorded on ${lowRate}% of days with fewer than 5 glasses and ${highRate}% of days with 5 or more glasses.`,
          matches: lowWater.filter((e) => (e.symptoms || []).length), entries,
          evidence: [`${lowWater.length} lower-hydration days and ${moreWater.length} other logged days were compared.`, 'Hydration values are self-recorded and may not represent total fluid intake.', 'This comparison does not establish that hydration changed symptoms.']
        }));
      }
    }

    const activityCounts = new Map();
    entries.forEach((entry) => { const activity = String(entry.activity || '').trim(); if (activity && activity !== 'None') activityCounts.set(activity, (activityCounts.get(activity)||0)+1); });
    const topActivity = [...activityCounts.entries()].sort((a,b) => b[1]-a[1])[0];
    if (topActivity && topActivity[1] >= 2) {
      const matches = entries.filter((entry) => entry.activity === topActivity[0]);
      const withSymptoms = matches.filter((entry) => (entry.symptoms || []).length);
      observations.push(observation({
        id: `lifestyle:activity:${topActivity[0]}`, category: 'lifestyle',
        title: `${topActivity[0]} is your most frequently recorded activity`,
        summary: `${topActivity[0]} was recorded on ${matches.length} days; ${withSymptoms.length} of those entries also included symptoms.`,
        matches, entries,
        evidence: [`${matches.length} entries included ${topActivity[0]}.`, `${pct(withSymptoms.length, matches.length)}% of those same-day entries included at least one symptom.`, 'Same-day recording does not show whether activity affected the symptom.']
      }));
    }

    const medicationCounts = new Map();
    entries.forEach((entry) => (entry.medications || []).filter((med) => med && med !== 'None').forEach((med) => medicationCounts.set(med, (medicationCounts.get(med)||0)+1)));
    const topMedication = [...medicationCounts.entries()].sort((a,b) => b[1]-a[1])[0];
    if (topMedication && topMedication[1] >= 2) {
      const matches = entries.filter((entry) => (entry.medications || []).includes(topMedication[0]));
      const symptomNames = new Map();
      matches.forEach((entry) => (entry.symptoms || []).forEach((symptom) => symptomNames.set(symptom, (symptomNames.get(symptom)||0)+1)));
      const co = [...symptomNames.entries()].sort((a,b) => b[1]-a[1])[0];
      observations.push(observation({
        id: `medication:${topMedication[0]}`, category: 'medication',
        title: `${topMedication[0]} appears repeatedly in this window`,
        summary: co ? `${topMedication[0]} was recorded on ${matches.length} days; ${co[0]} was the symptom most often recorded on the same entries.` : `${topMedication[0]} was recorded on ${matches.length} days in this window.`,
        matches, entries,
        evidence: [co ? `${co[0]} appeared on ${co[1]} of those ${matches.length} medication entries.` : 'No symptom was consistently recorded on those same entries.', 'Medication timing, dose, indication, and adherence may not be captured in enough detail for clinical interpretation.', 'Pamet does not infer medication effectiveness or adverse effects from this co-occurrence.']
      }));
    }
    return observations;
  }

  function dataReadiness(entries, observations) {
    const days = distinctDays(entries); const c = coverage(entries);
    let label = 'Start your baseline'; let note = 'Log your first day to begin building an observational baseline.';
    if (days > 0 && days < 3) { label = 'Baseline started'; note = `${days} logged day${days === 1 ? '' : 's'} is enough to begin, but not enough for repeat comparisons.`; }
    else if (days < 7) { label = 'Early comparison stage'; note = `${days} logged days can support simple comparisons. Keep including ordinary days, not only symptom days.`; }
    else if (!observations.length) { label = 'Baseline ready'; note = 'Pamet has enough days for comparisons, but no observation currently meets the display threshold.'; }
    else { label = `${observations.length} supported observation${observations.length === 1 ? '' : 's'}`; note = 'These observations summarize what was recorded together. They do not establish medical cause.'; }
    return { days, c, label, note };
  }

  function render() {
    const screen = $('#screen-patterns'); const col = screen?.querySelector('.content-col');
    if (!screen || !col || screen.dataset.insightsV15Rendering === 'true') return;
    screen.dataset.insightsV15Rendering = 'true';
    const entries = within([...S.entries], state.days);
    const allObservations = buildObservations(entries);
    const archived = archiveSet();
    const visible = allObservations.filter((item) => state.showArchived ? archived.has(item.id) : !archived.has(item.id)).filter((item) => state.category === 'all' || item.category === state.category);
    const readiness = dataReadiness(entries, allObservations);
    const completenessItems = [['Symptoms',readiness.c.symptom],['Sleep',readiness.c.sleep],['Stress',readiness.c.stress],['Hydration',readiness.c.hydration],['Activity',readiness.c.activity],['Medications',readiness.c.medication],['Notes',readiness.c.notes]];

    col.innerHTML = `
      <div class="insights-page-head"><div><span class="pamet-eyebrow">Observational history</span><h2 class="screen-title">Insights</h2><p class="pamet-helper">Pamet summarizes repeat relationships in what you record. It does not diagnose conditions or determine what caused a symptom.</p></div><div class="insights-window" role="group" aria-label="Observation window">${[7,30,90].map((days) => `<button type="button" data-insights-days="${days}" class="chip-btn${state.days===days?' active':''}" aria-pressed="${state.days===days}">${days} days</button>`).join('')}</div></div>
      <section class="insights-readiness" aria-labelledby="readinessTitle"><div class="readiness-copy"><span class="pamet-eyebrow">Pattern readiness</span><h3 id="readinessTitle">${esc(readiness.label)}</h3><p>${esc(readiness.note)}</p></div><div class="readiness-score"><strong>${readiness.days}</strong><span>logged days</span></div></section>
      <section class="completeness-card" aria-labelledby="completenessTitle"><div><span class="pamet-eyebrow">Data completeness</span><h3 id="completenessTitle">${readiness.c.overall}% complete</h3><p class="pamet-helper">More complete entries make comparisons easier to interpret. Missing fields are not treated as zero.</p></div><div class="completeness-grid">${completenessItems.map(([label,value]) => `<div class="completeness-item"><div><span>${esc(label)}</span><strong>${value}%</strong></div><div class="mini-meter" aria-hidden="true"><span style="width:${value}%"></span></div></div>`).join('')}</div></section>
      <div class="insights-toolbar" aria-label="Insight filters"><div class="insights-categories">${[['all','All'],['symptom','Symptoms'],['lifestyle','Lifestyle'],['medication','Medications'],['sleepstress','Sleep / Stress']].map(([key,label]) => `<button type="button" class="chip-btn${state.category===key?' active':''}" data-insights-category="${key}" aria-pressed="${state.category===key}">${label}</button>`).join('')}</div><button type="button" class="link-btn archived-toggle" data-insights-archived>${state.showArchived ? 'Back to active observations' : `Archived (${archived.size})`}</button></div>
      <div class="observation-list">${visible.length ? visible.map((item) => observationCard(item, archived.has(item.id))).join('') : emptyState(readiness, archived)}</div>`;

    col.querySelectorAll('[data-insights-days]').forEach((button) => button.addEventListener('click', () => { state.days = Number(button.dataset.insightsDays); render(); }));
    col.querySelectorAll('[data-insights-category]').forEach((button) => button.addEventListener('click', () => { state.category = button.dataset.insightsCategory; render(); }));
    col.querySelector('[data-insights-archived]')?.addEventListener('click', () => { state.showArchived = !state.showArchived; render(); });
    col.querySelectorAll('[data-observation-evidence]').forEach((button) => button.addEventListener('click', () => {
      const details = document.getElementById(button.getAttribute('aria-controls')); const expanded = button.getAttribute('aria-expanded') === 'true';
      button.setAttribute('aria-expanded', String(!expanded)); button.textContent = expanded ? 'Why am I seeing this?' : 'Hide supporting history'; if (details) details.hidden = expanded;
    }));
    col.querySelectorAll('[data-observation-archive]').forEach((button) => button.addEventListener('click', () => {
      const set = archiveSet(); const id = button.dataset.observationArchive; if (set.has(id)) set.delete(id); else set.add(id); saveArchive(set); render();
    }));
    screen.dataset.insightsV15Rendering = 'false';
    window.PametIcons?.hydrate();
  }

  function observationCard(item, isArchived) {
    const id = `evidence-${item.id.replace(/[^a-z0-9]+/gi,'-')}`;
    return `<article class="observation-card" data-category="${item.category}"><div class="observation-top"><div><span class="observation-category">${categoryLabel[item.category]}</span><h3>${esc(item.title)}</h3></div><span class="trend-badge ${item.trend.key}">${esc(item.trend.label)}</span></div><p class="observation-summary">${esc(item.summary)}</p><div class="observation-history"><span><strong>First seen</strong>${item.firstSeen ? esc(fmt(item.firstSeen)) : '—'}</span><span><strong>Last seen</strong>${item.lastSeen ? esc(fmt(item.lastSeen)) : '—'}</span><span><strong>Supporting entries</strong>${item.matchCount}</span></div><div class="observation-actions"><button type="button" class="link-btn" data-observation-evidence aria-expanded="false" aria-controls="${id}">Why am I seeing this?</button><button type="button" class="link-btn archive-action" data-observation-archive="${esc(item.id)}" aria-label="${isArchived?'Restore':'Archive'} ${esc(item.title)}">${window.PametIcons?.svg(isArchived?'restore':'archive') || ''}${isArchived?'Restore':'Archive'}</button></div><div class="observation-evidence" id="${id}" hidden><h4>Supporting history</h4><ul>${item.evidence.map((line) => `<li>${esc(line)}</li>`).join('')}</ul><p class="trend-explanation">${esc(item.trend.explanation)}</p><p class="observation-caution">Use this as a prompt for your own notes or a clinician conversation—not as a diagnosis or treatment recommendation.</p></div></article>`;
  }

  function emptyState(readiness, archived) {
    if (state.showArchived) return `<section class="insights-empty"><span data-pamet-icon="archive"></span><h3>No archived observations</h3><p>Archiving removes an observation from this workspace only. Your underlying journal entries remain unchanged.</p></section>`;
    const category = state.category === 'all' ? '' : ` for ${categoryLabel[state.category]}`;
    return `<section class="insights-empty"><span data-pamet-icon="insights"></span><h3>No supported observations${category}</h3><p>${readiness.days < 3 ? 'Keep logging complete entries so Pamet has enough history to compare.' : 'Pamet is not forcing a conclusion from limited or inconsistent data. Keep tracking and this view will update as your history changes.'}</p>${archived.size ? '<button type="button" class="link-btn" data-insights-archived>Review archived observations</button>' : ''}</section>`;
  }

  function scheduleRender() { requestAnimationFrame(() => { const screen = $('#screen-patterns'); if (screen?.classList.contains('active')) render(); }); }
  document.addEventListener('click', (event) => { if (event.target.closest('[data-tab="patterns"], [data-nav="patterns"]')) setTimeout(render, 0); });
  window.addEventListener('pamet:login', scheduleRender); window.addEventListener('pamet:registered', scheduleRender);
  document.addEventListener('pamet:settings-rendered', scheduleRender);
  const observer = new MutationObserver((mutations) => { if (mutations.some((m) => m.target.closest?.('#screen-patterns') || [...m.addedNodes].some((n) => n.nodeType===1 && (n.matches?.('#screen-patterns *') || n.querySelector?.('#screen-patterns'))))) scheduleRender(); });
  observer.observe(document.body, { childList:true, subtree:true });
  scheduleRender();
  window.PametInsights = Object.freeze({ render, buildObservations, coverage });
})();
