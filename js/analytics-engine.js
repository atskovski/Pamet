/* Pamet 1.6.6 — privacy-first observational analytics engine.
 *
 * This module deliberately describes associations in user-recorded history. It does
 * not diagnose, predict disease, determine causation, or evaluate medication safety.
 */
(function (global) {
  'use strict';

  const S = global.PametStore;
  const DAY_MS = 86400000;
  const PLAN_MAX = Object.freeze({ free: 3, pro: 8, ultra: 12 });

  const num = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
  const mean = (values) => {
    const clean = values.map(num).filter((value) => value !== null);
    return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : null;
  };
  const pct = (n, d) => d ? Math.round((n / d) * 100) : 0;
  const startDay = (value) => { const d = new Date(value); d.setHours(0, 0, 0, 0); return d; };
  const dayKey = (value) => { const d = startDay(value); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  const distinctDays = (entries) => new Set(entries.map((entry) => dayKey(entry.date))).size;
  const entryId = (entry) => entry.id || `${entry.date}|${(entry.symptoms || []).join(',')}|${entry.notes || ''}`;
  const dateRange = (entries) => {
    const sorted = [...entries].sort((a, b) => new Date(a.date) - new Date(b.date));
    return { firstSeen: sorted[0]?.date || null, lastSeen: sorted.at(-1)?.date || null };
  };
  const symptomRate = (entries) => pct(entries.filter((entry) => (entry.symptoms || []).length > 0).length, entries.length);
  const symptomNameRate = (entries, symptom) => pct(entries.filter((entry) => (entry.symptoms || []).includes(symptom)).length, entries.length);
  const avgSeverity = (entries) => mean(entries.filter((entry) => (entry.symptoms || []).length).map((entry) => entry.severity));

  function within(entries, days) {
    if (!days || days === Infinity) return [...entries];
    const cutoff = startDay(new Date());
    cutoff.setDate(cutoff.getDate() - Math.max(0, days - 1));
    return entries.filter((entry) => new Date(entry.date) >= cutoff);
  }

  function completeness(entries) {
    if (!entries.length) return { overall: 0, symptoms: 0, severity: 0, sleep: 0, stress: 0, hydration: 0, energy: 0, mood: 0, activity: 0, medications: 0, notes: 0, extraContext: 0 };
    const has = (fn) => pct(entries.filter(fn).length, entries.length);
    const result = {
      symptoms: has((e) => Array.isArray(e.symptoms)),
      severity: has((e) => num(e.severity) !== null),
      sleep: has((e) => num(e.sleepHours) !== null),
      stress: has((e) => num(e.stressLevel) !== null),
      hydration: has((e) => num(e.waterGlasses) !== null),
      energy: has((e) => num(e.energyLevel) !== null),
      mood: has((e) => Boolean(e.mood)),
      activity: has((e) => Boolean(e.activity)),
      medications: has((e) => Array.isArray(e.medications)),
      notes: has((e) => Boolean(String(e.notes || '').trim())),
      extraContext: has((e) => {
        const c = e.context || {};
        return num(c.sleepQuality) !== null || num(c.caffeineServings) !== null || num(c.mealsSkipped) !== null || (Array.isArray(c.tags) && c.tags.length > 0);
      })
    };
    const values = Object.values(result);
    result.overall = Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
    return result;
  }

  function trendFor(matches, entries) {
    if (entries.length < 6) return { key: 'developing', label: 'Developing', explanation: 'More logged days are needed before Pamet can compare recent and earlier frequency.' };
    const sorted = [...entries].sort((a, b) => new Date(a.date) - new Date(b.date));
    const midpoint = Math.floor(sorted.length / 2);
    const earlier = sorted.slice(0, midpoint);
    const recent = sorted.slice(midpoint);
    const ids = new Set(matches.map(entryId));
    const rate = (pool) => pct(pool.filter((entry) => ids.has(entryId(entry))).length, pool.length);
    const delta = rate(recent) - rate(earlier);
    if (delta >= 15) return { key: 'strengthening', label: 'More frequent recently', explanation: `This appeared ${Math.abs(delta)} percentage points more often in the recent half of the selected history.` };
    if (delta <= -15) return { key: 'weakening', label: 'Less frequent recently', explanation: `This appeared ${Math.abs(delta)} percentage points less often in the recent half of the selected history.` };
    return { key: 'stable', label: 'Similar frequency', explanation: 'Recent and earlier frequency are broadly similar in the selected history.' };
  }

  function confidenceFor(sample, effect) {
    if (sample >= 20 && effect >= 30) return 'stronger support';
    if (sample >= 10 && effect >= 20) return 'supported';
    return 'developing';
  }

  function observation({ id, category, title, summary, matches, entries, evidence, score = 0, confidence = 'supported', freeSafe = false }) {
    const range = dateRange(matches);
    return {
      id,
      category,
      title,
      summary,
      evidence,
      confidence,
      freeSafe,
      score,
      matchCount: matches.length,
      firstSeen: range.firstSeen,
      lastSeen: range.lastSeen,
      trend: trendFor(matches, entries)
    };
  }

  function topSymptoms(entries, limit = 3) {
    const counts = new Map();
    entries.forEach((entry) => new Set(entry.symptoms || []).forEach((name) => counts.set(name, (counts.get(name) || 0) + 1)));
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit);
  }

  function frequencyObservations(entries) {
    const days = distinctDays(entries);
    return topSymptoms(entries, 3).map(([name, count], index) => {
      const matches = entries.filter((entry) => (entry.symptoms || []).includes(name));
      const sev = avgSeverity(matches);
      return observation({
        id: `frequency:${name}`,
        category: 'symptom',
        title: `${name} is ${index === 0 ? 'your most frequently' : 'a repeatedly'} recorded symptom`,
        summary: `${name} was recorded on ${count} of ${days} logged day${days === 1 ? '' : 's'} in this window (${pct(count, days)}%).`,
        matches,
        entries,
        freeSafe: true,
        score: 45 - (index * 4) + Math.min(20, count * 2),
        confidence: count >= 5 ? 'supported' : 'developing',
        evidence: [
          `${count} distinct logged day${count === 1 ? '' : 's'} included ${name}.`,
          sev === null ? 'Not enough severity values were recorded for an average.' : `Average recorded symptom intensity on those entries was ${sev.toFixed(1)} / 10.`,
          'This summarizes what was recorded and does not identify a medical cause.'
        ]
      });
    });
  }

  function recentChangeObservation(entries) {
    const today = startDay(new Date());
    const currentStart = new Date(today.getTime() - (6 * DAY_MS));
    const previousStart = new Date(today.getTime() - (13 * DAY_MS));
    const current = entries.filter((entry) => new Date(entry.date) >= currentStart);
    const previous = entries.filter((entry) => new Date(entry.date) >= previousStart && new Date(entry.date) < currentStart);
    if (distinctDays(current) < 3 || distinctDays(previous) < 3) return null;
    const top = topSymptoms(entries, 1)[0];
    if (!top) return null;
    const [name] = top;
    const currentRate = symptomNameRate(current, name);
    const previousRate = symptomNameRate(previous, name);
    const delta = currentRate - previousRate;
    if (Math.abs(delta) < 20) return null;
    const matches = current.filter((entry) => (entry.symptoms || []).includes(name));
    return observation({
      id: `change:${name}`,
      category: 'symptom',
      title: `${name} was recorded ${delta > 0 ? 'more' : 'less'} often in the past 7 days`,
      summary: `${name} appeared on ${currentRate}% of recent logged days versus ${previousRate}% in the previous 7-day period.`,
      matches,
      entries,
      freeSafe: true,
      score: 62 + Math.min(18, Math.abs(delta) / 2),
      confidence: 'supported',
      evidence: [
        `${distinctDays(current)} recent logged days were compared with ${distinctDays(previous)} earlier logged days.`,
        `Difference in recorded frequency: ${Math.abs(delta)} percentage points.`,
        'A change in recorded frequency is not the same as a change in medical condition.'
      ]
    });
  }

  function compareFactor(entries, factor) {
    const left = entries.filter(factor.left);
    const right = entries.filter(factor.right);
    if (left.length < 3 || right.length < 3) return null;
    const leftRate = symptomRate(left);
    const rightRate = symptomRate(right);
    const rateDelta = leftRate - rightRate;
    const leftSev = avgSeverity(left);
    const rightSev = avgSeverity(right);
    const sevDelta = leftSev !== null && rightSev !== null ? leftSev - rightSev : 0;
    if (Math.abs(rateDelta) < 20 && Math.abs(sevDelta) < 1) return null;
    const direction = rateDelta >= 0 ? factor.leftLabel : factor.rightLabel;
    const higher = rateDelta >= 0 ? left : right;
    const lower = rateDelta >= 0 ? right : left;
    const higherRate = Math.max(leftRate, rightRate);
    const lowerRate = Math.min(leftRate, rightRate);
    const matches = higher.filter((entry) => (entry.symptoms || []).length > 0);
    const sample = left.length + right.length;
    const effect = Math.abs(rateDelta);
    return observation({
      id: `factor:${factor.key}`,
      category: factor.category || 'lifestyle',
      title: `Symptoms were recorded differently across ${factor.title.toLowerCase()}`,
      summary: `${factor.leftLabel}: symptoms on ${leftRate}% of logged entries. ${factor.rightLabel}: ${rightRate}%.`,
      matches,
      entries,
      score: 52 + Math.min(28, effect / 2) + Math.min(10, sample / 4),
      confidence: confidenceFor(sample, effect),
      evidence: [
        `${left.length} entries matched “${factor.leftLabel}” and ${right.length} matched “${factor.rightLabel}.”`,
        `Difference in same-entry symptom frequency: ${effect} percentage points (${higherRate}% vs ${lowerRate}%).`,
        leftSev !== null && rightSev !== null ? `Average symptom intensity in those groups was ${leftSev.toFixed(1)} / 10 vs ${rightSev.toFixed(1)} / 10.` : 'Not enough symptom-intensity values were available for a reliable group average.',
        factor.caveat || 'This is a recorded association only; Pamet does not determine cause or direction.'
      ]
    });
  }

  function factorObservations(entries) {
    const factors = [
      { key: 'sleep', title: 'sleep duration', category: 'sleepstress', leftLabel: 'Under 6 hours sleep', rightLabel: '7+ hours sleep', left: (e) => num(e.sleepHours) !== null && num(e.sleepHours) < 6, right: (e) => num(e.sleepHours) !== null && num(e.sleepHours) >= 7 },
      { key: 'stress', title: 'stress levels', category: 'sleepstress', leftLabel: 'Higher stress (7–10)', rightLabel: 'Lower stress (0–4)', left: (e) => num(e.stressLevel) !== null && num(e.stressLevel) >= 7, right: (e) => num(e.stressLevel) !== null && num(e.stressLevel) <= 4 },
      { key: 'hydration', title: 'recorded water intake', category: 'lifestyle', leftLabel: 'Under 5 glasses', rightLabel: '7+ glasses', left: (e) => num(e.waterGlasses) !== null && num(e.waterGlasses) < 5, right: (e) => num(e.waterGlasses) !== null && num(e.waterGlasses) >= 7, caveat: 'Water values are self-recorded and may not represent total fluid intake; this does not establish that hydration changed symptoms.' },
      { key: 'energy', title: 'energy levels', category: 'lifestyle', leftLabel: 'Lower energy (0–3)', rightLabel: 'Higher energy (7–10)', left: (e) => num(e.energyLevel) !== null && num(e.energyLevel) <= 3, right: (e) => num(e.energyLevel) !== null && num(e.energyLevel) >= 7 },
      { key: 'sleep-quality', title: 'sleep quality', category: 'sleepstress', leftLabel: 'Lower sleep quality', rightLabel: 'Higher sleep quality', left: (e) => num(e.context?.sleepQuality) !== null && num(e.context.sleepQuality) <= 4, right: (e) => num(e.context?.sleepQuality) !== null && num(e.context.sleepQuality) >= 7 },
      { key: 'caffeine', title: 'caffeine intake', category: 'lifestyle', leftLabel: '3+ caffeine servings', rightLabel: '0–1 caffeine servings', left: (e) => num(e.context?.caffeineServings) !== null && num(e.context.caffeineServings) >= 3, right: (e) => num(e.context?.caffeineServings) !== null && num(e.context.caffeineServings) <= 1, caveat: 'Caffeine amount and timing are approximate self-reports; the comparison does not establish a causal effect.' },
      { key: 'meals', title: 'meal regularity', category: 'lifestyle', leftLabel: 'One or more meals skipped', rightLabel: 'No meals skipped', left: (e) => num(e.context?.mealsSkipped) !== null && num(e.context.mealsSkipped) >= 1, right: (e) => num(e.context?.mealsSkipped) === 0 }
    ];
    return factors.map((factor) => compareFactor(entries, factor)).filter(Boolean);
  }

  function contextTagObservations(entries) {
    const counts = new Map();
    entries.forEach((entry) => new Set(entry.context?.tags || []).forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1)));
    const results = [];
    [...counts.entries()].filter(([, count]) => count >= 3).forEach(([tag]) => {
      const withTag = entries.filter((entry) => (entry.context?.tags || []).includes(tag));
      const withoutTag = entries.filter((entry) => !(entry.context?.tags || []).includes(tag));
      if (withoutTag.length < 3) return;
      const taggedRate = symptomRate(withTag);
      const otherRate = symptomRate(withoutTag);
      const delta = taggedRate - otherRate;
      if (Math.abs(delta) < 20) return;
      const matches = withTag.filter((entry) => (entry.symptoms || []).length > 0);
      results.push(observation({
        id: `context:${tag}`,
        category: 'lifestyle',
        title: `“${tag}” days had a different symptom-recording rate`,
        summary: `Symptoms were recorded on ${taggedRate}% of entries tagged “${tag}” versus ${otherRate}% of other entries in this window.`,
        matches,
        entries,
        score: 48 + Math.min(25, Math.abs(delta) / 2),
        confidence: confidenceFor(withTag.length + withoutTag.length, Math.abs(delta)),
        evidence: [
          `${withTag.length} entries included the context tag “${tag}.”`,
          `Difference in same-entry symptom frequency: ${Math.abs(delta)} percentage points.`,
          'Context tags are self-described and may overlap with other factors. This does not establish cause.'
        ]
      }));
    });
    return results;
  }

  function activityObservation(entries) {
    const counts = new Map();
    entries.forEach((entry) => { const value = String(entry.activity || '').trim(); if (value && value !== 'None') counts.set(value, (counts.get(value) || 0) + 1); });
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (!top || top[1] < 3) return null;
    const [name] = top;
    const activityEntries = entries.filter((entry) => entry.activity === name);
    const others = entries.filter((entry) => entry.activity && entry.activity !== name);
    const rate = symptomRate(activityEntries);
    const otherRate = symptomRate(others);
    return observation({
      id: `activity:${name}`,
      category: 'lifestyle',
      title: `${name} is your most frequently recorded activity`,
      summary: `${name} was recorded on ${activityEntries.length} entries; ${rate}% of those same entries also included symptoms.`,
      matches: activityEntries,
      entries,
      score: 36 + Math.min(20, activityEntries.length * 2) + (Math.abs(rate - otherRate) >= 20 ? 12 : 0),
      confidence: activityEntries.length >= 6 ? 'supported' : 'developing',
      evidence: [
        `${activityEntries.length} entries included ${name}.`,
        `${rate}% of those entries included at least one symptom; other recorded-activity entries were ${otherRate}%.`,
        'Same-day activity and symptom recording does not show whether one affected the other.'
      ]
    });
  }

  function medicationObservations(entries) {
    const counts = new Map();
    entries.forEach((entry) => new Set(entry.medications || []).filter((name) => name && name !== 'None').forEach((name) => counts.set(name, (counts.get(name) || 0) + 1)));
    const results = [];
    [...counts.entries()].filter(([, count]) => count >= 3).slice(0, 3).forEach(([name, count]) => {
      const medEntries = entries.filter((entry) => (entry.medications || []).includes(name));
      const symptomCounts = new Map();
      medEntries.forEach((entry) => new Set(entry.symptoms || []).forEach((symptom) => symptomCounts.set(symptom, (symptomCounts.get(symptom) || 0) + 1)));
      const co = [...symptomCounts.entries()].sort((a, b) => b[1] - a[1])[0];
      results.push(observation({
        id: `medication:${name}`,
        category: 'medication',
        title: `${name} appears repeatedly in this history window`,
        summary: co ? `${name} was recorded on ${count} entries; ${co[0]} was the symptom most often recorded on those same entries.` : `${name} was recorded on ${count} entries in this window.`,
        matches: medEntries,
        entries,
        score: 44 + Math.min(20, count * 2),
        confidence: count >= 6 ? 'supported' : 'developing',
        evidence: [
          co ? `${co[0]} appeared on ${co[1]} of the ${count} entries that also included ${name}.` : 'No symptom was repeatedly recorded on those same entries.',
          `Average recorded symptom intensity on medication entries: ${(avgSeverity(medEntries) ?? 0).toFixed(1)} / 10.`,
          'Dose, indication, timing, adherence, and clinical context may be incomplete. Pamet does not infer effectiveness, side effects, or medication safety.'
        ]
      }));
    });
    return results;
  }

  function moodObservation(entries) {
    const counts = new Map();
    entries.forEach((entry) => { const mood = String(entry.mood || '').trim(); if (mood) counts.set(mood, (counts.get(mood) || 0) + 1); });
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (!top || top[1] < 3) return null;
    const [name, count] = top;
    const matches = entries.filter((entry) => entry.mood === name);
    return observation({
      id: `mood:${name}`,
      category: 'lifestyle',
      title: `${name} is your most frequently recorded emotional state`,
      summary: `${name} was selected on ${count} entries; symptoms were recorded on ${symptomRate(matches)}% of those same entries.`,
      matches,
      entries,
      score: 34 + Math.min(18, count * 2),
      confidence: count >= 6 ? 'supported' : 'developing',
      evidence: [
        `${count} entries included ${name}.`,
        `${symptomRate(matches)}% of those same entries also included at least one symptom.`,
        'Emotional state and symptoms can influence what is recorded in many ways; this summary does not establish a medical relationship.'
      ]
    });
  }

  function multiFactorObservation(entries) {
    const cluster = entries.filter((entry) => num(entry.sleepHours) !== null && num(entry.sleepHours) < 6 && num(entry.stressLevel) !== null && num(entry.stressLevel) >= 7);
    const comparison = entries.filter((entry) => num(entry.sleepHours) !== null && num(entry.sleepHours) >= 7 && num(entry.stressLevel) !== null && num(entry.stressLevel) <= 4);
    if (cluster.length < 3 || comparison.length < 3) return null;
    const clusterRate = symptomRate(cluster);
    const comparisonRate = symptomRate(comparison);
    const delta = clusterRate - comparisonRate;
    if (Math.abs(delta) < 20) return null;
    return observation({
      id: 'cluster:low-sleep-high-stress',
      category: 'sleepstress',
      title: 'A combined sleep-and-stress context shows a different symptom rate',
      summary: `Symptoms were recorded on ${clusterRate}% of entries with under 6 hours of sleep plus stress 7–10, versus ${comparisonRate}% with 7+ hours plus stress 0–4.`,
      matches: cluster.filter((entry) => (entry.symptoms || []).length > 0),
      entries,
      score: 78 + Math.min(15, Math.abs(delta) / 2),
      confidence: confidenceFor(cluster.length + comparison.length, Math.abs(delta)),
      evidence: [
        `${cluster.length} entries matched the lower-sleep / higher-stress combination and ${comparison.length} matched the comparison combination.`,
        `Difference in symptom-recording rate: ${Math.abs(delta)} percentage points.`,
        'Multiple recorded factors can move together. This comparison does not show which factor, if any, influenced symptoms.'
      ]
    });
  }

  function dedupe(observations) {
    const seen = new Set();
    return observations.filter((item) => {
      if (!item || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }

  function analyze(rawEntries, options = {}) {
    const plan = ['free', 'pro', 'ultra'].includes(options.plan) ? options.plan : String(S?.settings?.plan || 'free');
    const days = options.days || 90;
    const entries = within(Array.isArray(rawEntries) ? rawEntries : [], days).filter((entry) => entry && entry.date);
    const loggedDays = distinctDays(entries);
    const quality = completeness(entries);
    let observations = [...frequencyObservations(entries)];
    const change = recentChangeObservation(entries);
    if (change) observations.push(change);

    if (plan !== 'free' && loggedDays >= 7) {
      observations.push(...factorObservations(entries));
      observations.push(...contextTagObservations(entries));
      const activity = activityObservation(entries); if (activity) observations.push(activity);
      const mood = moodObservation(entries); if (mood) observations.push(mood);
      observations.push(...medicationObservations(entries));
    }
    if (plan === 'ultra' && loggedDays >= 10) {
      const cluster = multiFactorObservation(entries); if (cluster) observations.push(cluster);
    }

    observations = dedupe(observations)
      .filter((item) => plan !== 'free' || item.freeSafe)
      .sort((a, b) => b.score - a.score || b.matchCount - a.matchCount)
      .slice(0, PLAN_MAX[plan] || PLAN_MAX.free);

    let readiness = 'Start your baseline';
    let readinessDetail = 'Log your first day to begin building an observational baseline.';
    if (loggedDays >= 1 && loggedDays < 3) { readiness = 'Baseline started'; readinessDetail = 'Pamet can summarize what you recorded, but repeat comparisons need more logged days.'; }
    else if (loggedDays >= 3 && loggedDays < 7) { readiness = 'Early comparison stage'; readinessDetail = 'Simple frequency and recent-change summaries are becoming available.'; }
    else if (loggedDays >= 7 && observations.length === 0) { readiness = 'Baseline ready'; readinessDetail = 'There is enough history for comparisons, but no result currently clears Pamet’s minimum display thresholds.'; }
    else if (observations.length) { readiness = `${observations.length} supported observation${observations.length === 1 ? '' : 's'}`; readinessDetail = 'Pamet shows only observations that clear minimum sample and effect thresholds; these are not medical conclusions.'; }

    return {
      plan,
      days,
      entries: entries.length,
      loggedDays,
      completeness: quality,
      readiness,
      readinessDetail,
      observations,
      topObservation: observations[0] || null,
      generatedAt: new Date().toISOString()
    };
  }

  const API = Object.freeze({ analyze, completeness, within, distinctDays });
  global.PametAnalytics = API;

  if (S) {
    S.analytics = function (days = 90) {
      return analyze([...S.entries], { days, plan: S.settings?.plan || 'free' });
    };
  }
})(window);
