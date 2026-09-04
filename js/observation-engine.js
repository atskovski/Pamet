/* Pamet observation engine — local, privacy-preserving descriptive analytics. */
(() => {
  'use strict';

  const S = window.PametStore;
  if (!S) return;

  const DAY_MS = 86400000;
  const CATEGORY_KEYS = Object.freeze({
    symptoms: 'customSymptoms',
    moods: 'customMoods',
    activities: 'customActivities',
    meds: 'customMeds'
  });

  const CUSTOM_FIELD_LIMITS = Object.freeze({
    free: Object.freeze({ symptoms: 3, moods: 3, activities: 3, meds: 0 }),
    pro: Object.freeze({ symptoms: 10, moods: 10, activities: 10, meds: 10 }),
    ultra: Object.freeze({ symptoms: Infinity, moods: Infinity, activities: Infinity, meds: Infinity })
  });

  const TIERS = Object.freeze([
    Object.freeze({ key: 'bronze', name: 'Bronze', minDays: 1 }),
    Object.freeze({ key: 'silver', name: 'Silver', minDays: 7 }),
    Object.freeze({ key: 'gold', name: 'Gold', minDays: 30 }),
    Object.freeze({ key: 'platinum', name: 'Platinum', minDays: 90 }),
    Object.freeze({ key: 'diamond', name: 'Diamond', minDays: 180 }),
    Object.freeze({ key: 'beast', name: 'Beast', minDays: 365 })
  ]);

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function mean(values) {
    const clean = values.map(number).filter((value) => value !== null);
    return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : null;
  }

  function dayKey(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  }

  function startOfDay(value) {
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function planKey(value = S.settings?.plan) {
    return ['free', 'pro', 'ultra'].includes(value) ? value : 'free';
  }

  function customFieldPolicy(category, plan = planKey()) {
    const normalizedPlan = planKey(plan);
    const key = CATEGORY_KEYS[category];
    const limit = key ? CUSTOM_FIELD_LIMITS[normalizedPlan][category] : 0;
    const count = key ? (S.settings?.[key] || []).length : 0;
    return Object.freeze({
      category,
      plan: normalizedPlan,
      planName: normalizedPlan === 'ultra' ? 'Ultra' : normalizedPlan === 'pro' ? 'Pro' : 'Free',
      count,
      limit,
      unlimited: limit === Infinity,
      remaining: limit === Infinity ? Infinity : Math.max(0, limit - count),
      canAdd: limit === Infinity || count < limit
    });
  }

  function totalDaysLogged(entries = S.entries || []) {
    return new Set((entries || []).map((entry) => dayKey(entry?.date)).filter(Boolean)).size;
  }

  function tierFor(days) {
    const count = Math.max(0, Number(days) || 0);
    for (let index = TIERS.length - 1; index >= 0; index -= 1) {
      if (count >= TIERS[index].minDays) return TIERS[index];
    }
    return null;
  }

  function nextTier(days) {
    const count = Math.max(0, Number(days) || 0);
    return TIERS.find((tier) => count < tier.minDays) || null;
  }

  function mergeDaily(entries) {
    const map = new Map();
    (entries || []).forEach((entry) => {
      const key = dayKey(entry?.date);
      if (!key) return;
      let day = map.get(key);
      if (!day) {
        day = {
          key,
          date: startOfDay(entry.date),
          symptoms: new Set(),
          severityValues: [],
          sleepHours: [],
          stressLevel: [],
          waterGlasses: [],
          energyLevel: [],
          moods: new Set(),
          activities: new Set(),
          medications: new Set(),
          contextTags: new Set(),
          onsetPeriods: new Set(),
          sleepQualities: new Set(),
          entries: 0
        };
        map.set(key, day);
      }
      day.entries += 1;
      (entry.symptoms || []).forEach((value) => value && day.symptoms.add(String(value)));
      if ((entry.symptoms || []).length && number(entry.severity) !== null) day.severityValues.push(Number(entry.severity));
      ['sleepHours', 'stressLevel', 'waterGlasses', 'energyLevel'].forEach((field) => {
        const value = number(entry[field]);
        if (value !== null) day[field].push(value);
      });
      if (entry.mood) day.moods.add(String(entry.mood));
      if (entry.activity) day.activities.add(String(entry.activity));
      (entry.medications || []).forEach((value) => value && value !== 'None' && day.medications.add(String(value)));
      (entry.contextTags || entry.structuredContext?.tags || []).forEach((value) => value && day.contextTags.add(String(value)));
      if (entry.symptomOnset || entry.structuredContext?.symptomOnset) day.onsetPeriods.add(String(entry.symptomOnset || entry.structuredContext.symptomOnset));
      if (entry.sleepQuality || entry.structuredContext?.sleepQuality) day.sleepQualities.add(String(entry.sleepQuality || entry.structuredContext.sleepQuality));
    });

    return [...map.values()].map((day) => ({
      ...day,
      symptoms: [...day.symptoms],
      severity: mean(day.severityValues) ?? 0,
      sleepHours: mean(day.sleepHours),
      stressLevel: mean(day.stressLevel),
      waterGlasses: mean(day.waterGlasses),
      energyLevel: mean(day.energyLevel),
      moods: [...day.moods],
      activities: [...day.activities],
      medications: [...day.medications],
      contextTags: [...day.contextTags],
      onsetPeriods: [...day.onsetPeriods],
      sleepQualities: [...day.sleepQualities]
    })).sort((a, b) => a.date - b.date);
  }

  function symptomCounts(records) {
    const counts = new Map();
    records.forEach((record) => new Set(record.symptoms || []).forEach((symptom) => {
      counts.set(symptom, (counts.get(symptom) || 0) + 1);
    }));
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }

  function windowRecords(records, days, offset = 0) {
    const end = startOfDay(new Date());
    end.setDate(end.getDate() + 1 - offset);
    const start = new Date(end);
    start.setDate(start.getDate() - days);
    return records.filter((record) => record.date >= start && record.date < end);
  }

  function confidenceFor(sampleSize, absoluteDelta, groupFloor) {
    const sampleScore = clamp(sampleSize / 24, 0, 1);
    const effectScore = clamp(absoluteDelta / 0.45, 0, 1);
    const balanceScore = clamp(groupFloor / 8, 0, 1);
    return clamp(0.35 + sampleScore * 0.28 + effectScore * 0.22 + balanceScore * 0.1, 0.35, 0.92);
  }

  function factorAssociation(records, symptom, factor) {
    const exposed = records.filter(factor.test);
    const unexposed = records.filter((record) => !factor.test(record));
    if (exposed.length < 3 || unexposed.length < 3) return null;

    const exposedWith = exposed.filter((record) => record.symptoms.includes(symptom)).length;
    const unexposedWith = unexposed.filter((record) => record.symptoms.includes(symptom)).length;
    const exposedRate = exposedWith / exposed.length;
    const unexposedRate = unexposedWith / unexposed.length;
    const delta = exposedRate - unexposedRate;
    if (Math.abs(delta) < 0.15) return null;

    const confidence = confidenceFor(exposed.length + unexposed.length, Math.abs(delta), Math.min(exposed.length, unexposed.length));
    const direction = delta > 0 ? 'more' : 'less';
    const percentA = Math.round(exposedRate * 100);
    const percentB = Math.round(unexposedRate * 100);
    const emerging = confidence < 0.66 || Math.min(exposed.length, unexposed.length) < 5;

    return {
      kind: 'factor-association',
      title: `${symptom} was recorded ${direction} often on ${factor.shortLabel} days`,
      detail: `${symptom} appeared on ${exposedWith} of ${exposed.length} ${factor.longLabel} days (${percentA}%) versus ${unexposedWith} of ${unexposed.length} comparison days (${percentB}%). This is an observational association, not proof that the factor caused the symptom.`,
      confidence,
      occurrences: `${exposed.length + unexposed.length} logged days compared`,
      colorName: delta > 0 ? 'rose' : 'sage',
      isEmerging: emerging,
      evidence: { exposed: exposed.length, comparison: unexposed.length, exposedRate, comparisonRate: unexposedRate, delta }
    };
  }

  function medicationAssociations(records) {
    const patterns = [];
    const symptomatic = records.filter((record) => record.symptoms.length && Number.isFinite(record.severity));
    const meds = new Map();
    symptomatic.forEach((record) => record.medications.forEach((medication) => {
      meds.set(medication, (meds.get(medication) || 0) + 1);
    }));

    [...meds.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).forEach(([medication, count]) => {
      const withMedication = symptomatic.filter((record) => record.medications.includes(medication));
      const withoutMedication = symptomatic.filter((record) => !record.medications.includes(medication));
      if (withMedication.length < 3 || withoutMedication.length < 3) return;
      const withSeverity = mean(withMedication.map((record) => record.severity));
      const withoutSeverity = mean(withoutMedication.map((record) => record.severity));
      if (withSeverity === null || withoutSeverity === null) return;
      const delta = withSeverity - withoutSeverity;
      if (Math.abs(delta) < 0.75) return;
      const confidence = clamp(confidenceFor(withMedication.length + withoutMedication.length, Math.abs(delta) / 10, Math.min(withMedication.length, withoutMedication.length)) - 0.08, 0.35, 0.78);
      const direction = delta > 0 ? 'higher' : 'lower';
      patterns.push({
        kind: 'medication-context',
        title: `${medication} days had ${direction} recorded symptom intensity`,
        detail: `On symptom days when you recorded ${medication}, average intensity was ${withSeverity.toFixed(1)}/10 versus ${withoutSeverity.toFixed(1)}/10 on other symptom days. This may reflect when you choose to take the medication and should not be interpreted as a treatment effect.`,
        confidence,
        occurrences: `${count} symptom day${count === 1 ? '' : 's'} with ${medication}`,
        colorName: 'neutral',
        isEmerging: confidence < 0.68,
        evidence: { withMedication: withMedication.length, comparison: withoutMedication.length, withSeverity, comparisonSeverity: withoutSeverity, delta }
      });
    });
    return patterns;
  }

  function trendSummary(records) {
    const current = windowRecords(records, 7, 0);
    const previous = windowRecords(records, 7, 7);
    const symptomDays = (list) => list.filter((record) => record.symptoms.length).length;
    const avgSeverity = (list) => {
      const values = list.filter((record) => record.symptoms.length).map((record) => record.severity);
      return mean(values);
    };
    const currentSymptomDays = symptomDays(current);
    const previousSymptomDays = symptomDays(previous);
    const currentSeverity = avgSeverity(current);
    const previousSeverity = avgSeverity(previous);
    return {
      currentLoggedDays: current.length,
      previousLoggedDays: previous.length,
      currentSymptomDays,
      previousSymptomDays,
      symptomDayDelta: currentSymptomDays - previousSymptomDays,
      currentAverageSeverity: currentSeverity,
      previousAverageSeverity: previousSeverity,
      averageSeverityDelta: currentSeverity === null || previousSeverity === null ? null : currentSeverity - previousSeverity
    };
  }

  function completeness(records) {
    if (!records.length) return { overall: 0, fields: {} };
    const fields = {
      symptoms: records.filter((record) => Array.isArray(record.symptoms)).length / records.length,
      severity: records.filter((record) => !record.symptoms.length || Number.isFinite(record.severity)).length / records.length,
      sleep: records.filter((record) => record.sleepHours !== null).length / records.length,
      stress: records.filter((record) => record.stressLevel !== null).length / records.length,
      hydration: records.filter((record) => record.waterGlasses !== null).length / records.length,
      energy: records.filter((record) => record.energyLevel !== null).length / records.length,
      mood: records.filter((record) => record.moods.length).length / records.length,
      activity: records.filter((record) => record.activities.length).length / records.length,
      medications: records.filter((record) => Array.isArray(record.medications)).length / records.length
    };
    return { overall: mean(Object.values(fields)) ?? 0, fields };
  }

  function buildPatterns(records) {
    if (records.length < 6) return [];
    const topSymptoms = symptomCounts(records).filter(([, count]) => count >= 3).slice(0, 5).map(([name]) => name);
    if (!topSymptoms.length) return [];

    const factors = [
      { shortLabel: 'low-sleep', longLabel: 'less-than-6-hours-of-sleep', test: (record) => record.sleepHours !== null && record.sleepHours < 6 },
      { shortLabel: 'high-stress', longLabel: 'stress-7-or-higher', test: (record) => record.stressLevel !== null && record.stressLevel >= 7 },
      { shortLabel: 'lower-hydration', longLabel: 'fewer-than-5-glasses-of-water', test: (record) => record.waterGlasses !== null && record.waterGlasses < 5 },
      { shortLabel: 'low-energy', longLabel: 'energy-4-or-lower', test: (record) => record.energyLevel !== null && record.energyLevel <= 4 },
      { shortLabel: 'poor-sleep-quality', longLabel: 'poor-sleep-quality', test: (record) => record.sleepQualities.some((value) => value.toLowerCase() === 'poor') }
    ];

    const contextCounts = new Map();
    records.forEach((record) => record.contextTags.forEach((tag) => contextCounts.set(tag, (contextCounts.get(tag) || 0) + 1)));
    [...contextCounts.entries()].filter(([, count]) => count >= 3).sort((a, b) => b[1] - a[1]).slice(0, 6).forEach(([tag]) => {
      factors.push({ shortLabel: tag.toLowerCase(), longLabel: `with-${tag.toLowerCase().replace(/\s+/g, '-')}`, test: (record) => record.contextTags.includes(tag) });
    });

    const activityCounts = new Map();
    records.forEach((record) => record.activities.forEach((activity) => {
      if (activity && activity !== 'None') activityCounts.set(activity, (activityCounts.get(activity) || 0) + 1);
    }));
    [...activityCounts.entries()].filter(([, count]) => count >= 3).sort((a, b) => b[1] - a[1]).slice(0, 4).forEach(([activity]) => {
      factors.push({ shortLabel: activity.toLowerCase(), longLabel: `${activity.toLowerCase()}-activity`, test: (record) => record.activities.includes(activity) });
    });

    const patterns = [];
    topSymptoms.forEach((symptom) => factors.forEach((factor) => {
      const pattern = factorAssociation(records, symptom, factor);
      if (pattern) patterns.push(pattern);
    }));
    patterns.push(...medicationAssociations(records));

    return patterns
      .sort((a, b) => b.confidence - a.confidence || Number(a.isEmerging) - Number(b.isEmerging))
      .slice(0, 12);
  }

  function homeObservation(records) {
    if (!records.length) return null;
    const recent = windowRecords(records, 30, 0);
    const source = recent.length ? recent : records;
    const top = symptomCounts(source)[0] || null;
    const trend = trendSummary(records);

    if (trend.currentLoggedDays >= 2 && trend.previousLoggedDays >= 2 && Math.abs(trend.symptomDayDelta) >= 2) {
      const direction = trend.symptomDayDelta > 0 ? 'more' : 'fewer';
      return {
        title: 'Your recent symptom-day count changed',
        text: `You recorded ${Math.abs(trend.symptomDayDelta)} ${direction} symptom day${Math.abs(trend.symptomDayDelta) === 1 ? '' : 's'} in the past 7 days compared with the previous 7 days.`,
        kind: 'trend'
      };
    }

    if (top) {
      const [symptom, count] = top;
      return {
        title: 'Most recorded recently',
        text: `${symptom} was your most frequently recorded symptom across the recent history Pamet reviewed — ${count} logged day${count === 1 ? '' : 's'}.`,
        kind: 'frequency'
      };
    }

    if (source.length >= 2) {
      const symptomFree = source.filter((record) => !record.symptoms.length).length;
      return {
        title: 'Your baseline is growing',
        text: `Pamet reviewed ${source.length} logged day${source.length === 1 ? '' : 's'}, including ${symptomFree} symptom-free day${symptomFree === 1 ? '' : 's'}. Logging ordinary days helps make later comparisons more meaningful.`,
        kind: 'baseline'
      };
    }

    return {
      title: 'Your baseline has started',
      text: 'Keep logging ordinary days as well as symptom days so Pamet has enough context to make useful comparisons over time.',
      kind: 'baseline'
    };
  }

  function analyze(entries = S.entries || []) {
    const records = mergeDaily(entries);
    const patterns = buildPatterns(records);
    const dates = records.map((record) => record.date.getTime());
    const spanDays = dates.length > 1 ? Math.max(1, Math.round((Math.max(...dates) - Math.min(...dates)) / DAY_MS) + 1) : dates.length;
    return Object.freeze({
      generatedAt: new Date().toISOString(),
      loggedDays: records.length,
      spanDays,
      completeness: completeness(records),
      trend: trendSummary(records),
      topSymptoms: symptomCounts(records).slice(0, 10),
      patterns,
      home: homeObservation(records),
      readiness: records.length < 3 ? 'starting' : records.length < 7 ? 'forming' : records.length < 14 ? 'developing' : 'established'
    });
  }

  const originalAddCustomField = typeof S.addCustomField === 'function' ? S.addCustomField.bind(S) : null;
  if (originalAddCustomField) {
    S.addCustomField = function addCustomFieldWithPlanLimit(category, name) {
      const policy = customFieldPolicy(category);
      if (!policy.canAdd) return false;
      return originalAddCustomField(category, name);
    };
  }

  if (typeof S.addCustomSymptom === 'function') {
    S.addCustomSymptom = function addCustomSymptomWithPlanLimit(name) {
      return S.addCustomField('symptoms', name);
    };
  }

  if (S.FREE_LIMITS) S.FREE_LIMITS.customPerCategory = CUSTOM_FIELD_LIMITS.free.symptoms;
  S.customLimit = (category) => customFieldPolicy(category).limit;
  S.customFieldPolicy = (category) => customFieldPolicy(category);
  S.tier = () => tierFor(totalDaysLogged(S._entries || S.entries || []));
  S.nextTier = () => nextTier(totalDaysLogged(S._entries || S.entries || []));
  S.analysis = () => analyze(S.entries || []);

  S.patterns = () => {
    if (S.settings?.aiPatterns === false) return [];
    if (!window.PametEntitlements?.has?.('correlations')) return [];
    return analyze(S.entries || []).patterns;
  };

  window.PametObservationEngine = Object.freeze({
    analyze,
    homeObservation: (entries = S.entries || []) => homeObservation(mergeDaily(entries)),
    mergeDaily,
    customFieldPolicy,
    totalDaysLogged,
    tierFor,
    nextTier,
    tiers: TIERS,
    customFieldLimits: CUSTOM_FIELD_LIMITS
  });
})();
