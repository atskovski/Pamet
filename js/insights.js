/* Pamet observational Insights analytics. Never diagnoses or asserts causation. */
(() => {
  'use strict';
  const S = window.PametStore;
  const E = window.PametEntitlements;
  if (!S) return;
  const dateOnly = (value) => new Date(value);
  const dayKey = (value) => { const d = dateOnly(value); return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`; };
  const avg = (values) => values.length ? values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length : 0;
  const pct = (n, d) => d ? Math.round(n / d * 100) : 0;
  const distinctDays = (entries) => new Set(entries.map((entry) => dayKey(entry.date))).size;
  const paidComparisons = () => E?.has?.('correlations') === true;

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
    const ids = new Set(matches.map((entry) => entry.id || `${entry.date}|${entry.notes || ''}`));
    const rate = (pool) => pct(pool.filter((entry) => ids.has(entry.id || `${entry.date}|${entry.notes || ''}`)).length, pool.length);
    const delta = rate(recent) - rate(earlier);
    if (delta >= 15) return { key: 'strengthening', label: 'More frequent recently', explanation: `This observation appeared ${Math.abs(delta)} percentage points more often in the recent half of this window.` };
    if (delta <= -15) return { key: 'weakening', label: 'Less frequent recently', explanation: `This observation appeared ${Math.abs(delta)} percentage points less often in the recent half of this window.` };
    return { key: 'stable', label: 'Similar frequency', explanation: 'Recent and earlier frequency are broadly similar in this window.' };
  }

  function observation({ id, category, title, summary, matches, entries, evidence }) {
    const sorted = [...matches].sort((a,b) => dateOnly(a.date) - dateOnly(b.date));
    return { id, category, title, summary, evidence, confidence: 'supported', matchCount: matches.length, firstSeen: sorted[0]?.date || null, lastSeen: sorted.at(-1)?.date || null, trend: trendFor(matches, entries) };
  }

  function buildObservations(entries) {
    if (!entries.length) return [];
    const observations = [];
    const symptomCounts = new Map();
    entries.forEach((entry) => (entry.symptoms || []).forEach((symptom) => symptomCounts.set(symptom, (symptomCounts.get(symptom) || 0) + 1)));
    const topSymptom = [...symptomCounts.entries()].sort((a,b) => b[1] - a[1])[0];
    if (topSymptom?.[1] >= 2) {
      const [name, count] = topSymptom;
      const matches = entries.filter((entry) => (entry.symptoms || []).includes(name));
      observations.push(observation({
        id: `symptom-frequency:${name}`, category: 'symptom', title: `${name} is your most frequently recorded symptom`,
        summary: `${name} was recorded on ${count} of ${distinctDays(entries)} logged days in this window (${pct(count, distinctDays(entries))}%).`, matches, entries,
        evidence: [`${count} logged days included ${name}.`, `Average recorded severity on those entries: ${avg(matches.map((e) => e.severity)).toFixed(1)} / 10.`, 'This describes your recorded history and does not identify a cause.']
      }));
    }

    if (!paidComparisons()) return observations;
    const symptomDays = entries.filter((entry) => (entry.symptoms || []).length > 0);
    const clearDays = entries.filter((entry) => (entry.symptoms || []).length === 0);
    if (symptomDays.length >= 2 && clearDays.length >= 2) {
      const symptomSleep = avg(symptomDays.map((e) => e.sleepHours).filter((v) => Number.isFinite(Number(v))));
      const clearSleep = avg(clearDays.map((e) => e.sleepHours).filter((v) => Number.isFinite(Number(v))));
      if (symptomSleep && clearSleep && Math.abs(symptomSleep - clearSleep) >= 0.5) {
        const lower = symptomSleep < clearSleep;
        observations.push(observation({
          id: 'sleep:symptom-day-difference', category: 'sleepstress', title: `Recorded sleep was ${lower ? 'lower' : 'higher'} on symptom days`,
          summary: `Average recorded sleep was ${symptomSleep.toFixed(1)} hours on symptom days versus ${clearSleep.toFixed(1)} hours on symptom-free logged days.`, matches: symptomDays, entries,
          evidence: [`${symptomDays.length} symptom-day entries were compared with ${clearDays.length} symptom-free entries.`, `Difference: ${Math.abs(symptomSleep-clearSleep).toFixed(1)} hours.`, 'This is an association in the journal, not evidence that sleep caused or prevented symptoms.']
        }));
      }
    }

    const highStress = entries.filter((entry) => Number(entry.stressLevel) >= 7);
    const lowerStress = entries.filter((entry) => Number(entry.stressLevel) < 7 && Number.isFinite(Number(entry.stressLevel)));
    if (highStress.length >= 2 && lowerStress.length >= 2) {
      const highRate = pct(highStress.filter((entry) => (entry.symptoms || []).length).length, highStress.length);
      const lowRate = pct(lowerStress.filter((entry) => (entry.symptoms || []).length).length, lowerStress.length);
      if (Math.abs(highRate-lowRate) >= 15) observations.push(observation({
        id: 'stress:symptom-cooccurrence', category: 'sleepstress', title: 'Symptoms and higher stress were recorded together at a different rate',
        summary: `Symptoms were recorded on ${highRate}% of high-stress logged days and ${lowRate}% of lower-stress logged days.`, matches: highStress.filter((entry) => (entry.symptoms || []).length), entries,
        evidence: ['High stress is defined here as a recorded stress level of 7–10.', `${highStress.length} high-stress days and ${lowerStress.length} lower-stress days were available.`, 'Pamet is comparing co-occurrence only; it is not determining direction or cause.']
      }));
    }

    const lowWater = entries.filter((entry) => Number(entry.waterGlasses) > 0 && Number(entry.waterGlasses) < 5);
    const moreWater = entries.filter((entry) => Number(entry.waterGlasses) >= 5);
    if (lowWater.length >= 2 && moreWater.length >= 2) {
      const lowRate = pct(lowWater.filter((e) => (e.symptoms || []).length).length, lowWater.length);
      const highRate = pct(moreWater.filter((e) => (e.symptoms || []).length).length, moreWater.length);
      if (Math.abs(lowRate-highRate) >= 15) observations.push(observation({
        id: 'lifestyle:hydration-comparison', category: 'lifestyle', title: 'Symptom recording differed across hydration ranges',
        summary: `Symptoms were recorded on ${lowRate}% of days with fewer than 5 glasses and ${highRate}% of days with 5 or more glasses.`, matches: lowWater.filter((e) => (e.symptoms || []).length), entries,
        evidence: [`${lowWater.length} lower-hydration days and ${moreWater.length} other logged days were compared.`, 'Hydration values are self-recorded and may not represent total fluid intake.', 'This comparison does not establish that hydration changed symptoms.']
      }));
    }

    const activities = new Map();
    entries.forEach((entry) => { const value = String(entry.activity || '').trim(); if (value && value !== 'None') activities.set(value, (activities.get(value)||0)+1); });
    const topActivity = [...activities.entries()].sort((a,b) => b[1]-a[1])[0];
    if (topActivity?.[1] >= 2) {
      const matches = entries.filter((entry) => entry.activity === topActivity[0]);
      const withSymptoms = matches.filter((entry) => (entry.symptoms || []).length);
      observations.push(observation({
        id: `lifestyle:activity:${topActivity[0]}`, category: 'lifestyle', title: `${topActivity[0]} is your most frequently recorded activity`,
        summary: `${topActivity[0]} was recorded on ${matches.length} days; ${withSymptoms.length} of those entries also included symptoms.`, matches, entries,
        evidence: [`${matches.length} entries included ${topActivity[0]}.`, `${pct(withSymptoms.length, matches.length)}% of those same-day entries included at least one symptom.`, 'Same-day recording does not show whether activity affected the symptom.']
      }));
    }

    const medications = new Map();
    entries.forEach((entry) => (entry.medications || []).filter((med) => med && med !== 'None').forEach((med) => medications.set(med, (medications.get(med)||0)+1)));
    const topMedication = [...medications.entries()].sort((a,b) => b[1]-a[1])[0];
    if (E?.has?.('medicationTiming') === true && topMedication?.[1] >= 2) {
      const matches = entries.filter((entry) => (entry.medications || []).includes(topMedication[0]));
      const symptoms = new Map();
      matches.forEach((entry) => (entry.symptoms || []).forEach((symptom) => symptoms.set(symptom, (symptoms.get(symptom)||0)+1)));
      const co = [...symptoms.entries()].sort((a,b) => b[1]-a[1])[0];
      observations.push(observation({
        id: `medication:${topMedication[0]}`, category: 'medication', title: `${topMedication[0]} appears repeatedly in this window`,
        summary: co ? `${topMedication[0]} was recorded on ${matches.length} days; ${co[0]} was the symptom most often recorded on the same entries.` : `${topMedication[0]} was recorded on ${matches.length} days in this window.`, matches, entries,
        evidence: [co ? `${co[0]} appeared on ${co[1]} of those ${matches.length} medication entries.` : 'No symptom was consistently recorded on those same entries.', 'Medication timing, dose, indication, and adherence may not be captured in enough detail for clinical interpretation.', 'Pamet does not infer medication effectiveness or adverse effects from this co-occurrence.']
      }));
    }
    return observations;
  }

  window.PametInsights = Object.freeze({ buildObservations, coverage });
})();