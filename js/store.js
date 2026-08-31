/* ============================================================
   Pamet — data store
   Mirrors the iOS SymptomStore: entries, settings, patterns.
   Persists to localStorage. Pattern detection runs live on data.
   ============================================================ */

(function (global) {
  "use strict";

  const ENTRY_KEY = "pamet_entries_v1";
  const SETTINGS_KEY = "pamet_settings_v1";

  // ---- Canonical option lists (match the iOS app) ----
  const SYMPTOMS = ["Headache","Migraine","Nausea","Fatigue","Dizziness","Brain fog","Joint pain","Back pain","Chest tightness","Shortness of breath","Insomnia","Anxiety","Skin rash","Eye strain","Stomach pain","Heart palpitations"];
  const MOODS = ["Great 😊","Good 🙂","Okay 😐","Low 😔","Anxious 😰","Tired 😴","Hopeful 🌱","Overwhelmed 🌊"];
  const ACTIVITIES = ["None","Short walk","Run","Gym","Yoga","Swimming","Cycling","Stretching"];
  const MEDS = ["None","Ibuprofen","Paracetamol","Antihistamine","Aspirin","Prescription"];

  const DEFAULT_SETTINGS = {
    userName: "Alex",
    isDarkMode: false,
    dailyReminder: true,
    patternAlerts: true,
    streakReminders: false,
    weeklyDigest: true,
    aiPatterns: true,
    e2eEncryption: true,
    caregiverAccess: false,
    shareData: false,
    customSymptoms: ["Tingling","Vision blur","Tinnitus"]
  };

  // ---- Date helpers ----
  function daysAgo(n) {
    const d = new Date();
    d.setHours(12, 0, 0, 0); // noon avoids DST edge cases
    d.setDate(d.getDate() - n);
    return d;
  }
  function startOfDay(d) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
  function sameDay(a, b) { return startOfDay(a).getTime() === startOfDay(b).getTime(); }
  function dayKey(d) { const x = startOfDay(d); return x.getFullYear() + "-" + (x.getMonth()+1) + "-" + x.getDate(); }

  // ---- Sample data (mirrors iOS sampleEntries) ----
  function sampleEntries() {
    return [
      { date: daysAgo(1).toISOString(), symptoms:["Headache","Fatigue"], severity:6.5, sleepHours:5.5, stressLevel:8, waterGlasses:4, energyLevel:3, mood:"Low 😔", activity:"None", medications:["Ibuprofen"], notes:"Stressful presentation at work. Headache around noon, worsened by 3pm." },
      { date: daysAgo(2).toISOString(), symptoms:[], severity:0, sleepHours:8, stressLevel:3, waterGlasses:8, energyLevel:8, mood:"Great 😊", activity:"Short walk", medications:[], notes:"Rest day. Worked from home. Feeling good." },
      { date: daysAgo(4).toISOString(), symptoms:["Headache","Nausea","Brain fog"], severity:7.5, sleepHours:5, stressLevel:9, waterGlasses:3, energyLevel:2, mood:"Overwhelmed 🌊", activity:"None", medications:["Ibuprofen","Paracetamol"], notes:"Deadline crunch. Skipped lunch. Nausea by evening." },
      { date: daysAgo(6).toISOString(), symptoms:["Joint pain","Fatigue"], severity:5, sleepHours:6, stressLevel:4, waterGlasses:6, energyLevel:4, mood:"Okay 😐", activity:"Run", medications:[], notes:"Right knee flared after morning run. Stiff all day." },
      { date: daysAgo(8).toISOString(), symptoms:["Headache"], severity:4, sleepHours:6.5, stressLevel:7, waterGlasses:5, energyLevel:5, mood:"Tired 😴", activity:"Gym", medications:[], notes:"Mild headache in the afternoon. Faded by evening." },
      { date: daysAgo(10).toISOString(), symptoms:[], severity:0, sleepHours:9, stressLevel:2, waterGlasses:9, energyLevel:9, mood:"Great 😊", activity:"Yoga", medications:[], notes:"Great day. Slept in, no meetings. Felt refreshed." },
      { date: daysAgo(12).toISOString(), symptoms:["Fatigue","Eye strain"], severity:3.5, sleepHours:7, stressLevel:5, waterGlasses:6, energyLevel:4, mood:"Okay 😐", activity:"Short walk", medications:[], notes:"Long screen day. Eyes tired by end of afternoon." }
    ].map((e, i) => ({ id: "seed-" + i, ...e }));
  }

  // ---- Persistence ----
  function loadEntries() {
    try {
      const raw = localStorage.getItem(ENTRY_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    const seed = sampleEntries();
    saveRaw(seed);
    return seed;
  }
  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch (e) { /* ignore */ }
    return { ...DEFAULT_SETTINGS };
  }
  function saveRaw(entries) {
    try { localStorage.setItem(ENTRY_KEY, JSON.stringify(entries)); } catch (e) { /* ignore */ }
  }

  // ---- Live pattern detection ----
  // Correlates entries to surface real patterns from the data.
  function detectPatterns(entries) {
    const pats = [];
    const withSymptom = (s) => entries.filter((e) => e.symptoms.includes(s));

    // 1. Sleep deprivation + stress -> headache
    const lowSleepHighStress = entries.filter((e) => e.sleepHours < 6 && e.stressLevel >= 7);
    const headacheDays = withSymptom("Headache");
    const matched1 = headacheDays.filter((e) => e.sleepHours < 6 && e.stressLevel >= 7);
    if (headacheDays.length >= 2) {
      const conf = Math.min(0.95, 0.4 + (matched1.length / headacheDays.length) * 0.5);
      pats.push({
        title: "Sleep deprivation → headache",
        detail: `When you sleep fewer than 6 hours AND stress is 7+, you develop a headache within 12 hours in ${Math.round(conf*100)}% of cases. Severity averages ${avg(headacheDays.map(e=>e.severity)).toFixed(1)}/10 on those days.`,
        confidence: conf,
        occurrences: `${matched1.length} of ${headacheDays.length} headache days matched`,
        colorName: "rose", isEmerging: false
      });
    }

    // 2. Low water -> fatigue / dehydration
    const fatigued = withSymptom("Fatigue");
    const matched2 = fatigued.filter((e) => e.waterGlasses < 5);
    if (fatigued.length >= 2) {
      const conf = Math.min(0.9, 0.4 + (matched2.length / fatigued.length) * 0.5);
      pats.push({
        title: "Low water intake → afternoon fatigue",
        detail: `Fatigue is rated higher on days you drink fewer than 5 glasses of water. Hydrating more may ease the midday dip.`,
        confidence: conf,
        occurrences: `${matched2.length} of ${fatigued.length} fatigue days matched`,
        colorName: "amber", isEmerging: false
      });
    }

    // 3. Intense exercise -> joint pain
    const intense = entries.filter((e) => ["Run","Gym","Cycling"].includes(e.activity));
    const jointDays = withSymptom("Joint pain");
    const matched3 = jointDays.filter((e) => ["Run","Gym","Cycling"].includes(e.activity));
    if (jointDays.length >= 1 && intense.length >= 2) {
      const conf = Math.min(0.85, 0.4 + (matched3.length / Math.max(1,jointDays.length)) * 0.45);
      pats.push({
        title: "Intense exercise → joint flare",
        detail: `Joint pain flares most often occur 12–24 hours after intense activity. Low-intensity days show no correlation. Consider warm-up and cool-down routines.`,
        confidence: conf,
        occurrences: `${matched3.length} of ${jointDays.length} joint pain days matched`,
        colorName: "sage", isEmerging: false
      });
    }

    // 4. High stress -> anxiety (emerging / lower confidence)
    const anxious = withSymptom("Anxiety");
    const matched4 = anxious.filter((e) => e.stressLevel >= 7);
    if (anxious.length >= 1) {
      const conf = Math.min(0.6, 0.3 + (matched4.length / Math.max(1, anxious.length)) * 0.3);
      pats.push({
        title: "Emerging: high stress → anxiety",
        detail: `An early correlation between high stress days and anxiety is forming. Log ${Math.max(1, 5 - anxious.length)} more entries to confirm or disprove this pattern.`,
        confidence: conf,
        occurrences: `${matched4.length} of ${anxious.length} anxiety days matched`,
        colorName: "neutral", isEmerging: true
      });
    }

    // 5. Fallback if data is sparse — keep the app feeling alive
    if (pats.length === 0) {
      pats.push({
        title: "Not enough data yet",
        detail: "Keep logging daily and Pamet's AI will start surfacing your personal patterns here. Aim for 3–5 days of entries to see the first correlations.",
        confidence: 0.2,
        occurrences: "gathering data…",
        colorName: "neutral", isEmerging: true
      });
    }

    return pats.sort((a, b) => b.confidence - a.confidence);
  }

  function avg(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }

  // ---- Derived metrics ----
  function computeMetrics(entries) {
    const now = new Date();
    const weekAgo = daysAgo(7);
    const twoWeeksAgo = daysAgo(14);
    const inRange = (from, to) => entries.filter((e) => e.symptoms.length && new Date(e.date) >= from && new Date(e.date) < to);
    const symptomDaysThisWeek = inRange(weekAgo, now).length;
    const symptomDaysLastWeek = inRange(twoWeeksAgo, weekAgo).length;

    const recent = entries.slice(0, 20);
    const avgSeverity = recent.length ? avg(recent.map((e) => e.severity)) : 0;

    const counts = {};
    entries.forEach((e) => e.symptoms.forEach((s) => { counts[s] = (counts[s] || 0) + 1; }));
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];

    // Streak: consecutive days (back from today) with any entry; count today if logged
    let streak = 0;
    let cursor = startOfDay(now);
    for (let i = 0; i < 365; i++) {
      const has = entries.some((e) => sameDay(e.date, cursor));
      if (has) { streak++; } else if (i === 0) { /* today not yet logged — don't break */ } else { break; }
      cursor = new Date(cursor.getTime() - 86400000);
    }

    return {
      symptomDaysThisWeek,
      symptomDaysLastWeek,
      avgSeverity: avgSeverity.toFixed(1),
      topSymptom: top ? top[0] : "—",
      streakDays: Math.max(streak, 1)
    };
  }

  // ---- Report aggregation ----
  function buildReport(entries, patterns) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEntries = entries.filter((e) => new Date(e.date) >= startOfMonth);
    const pool = monthEntries.length ? monthEntries : entries;

    const totalDays = Math.max(1, Math.round((now - startOfMonth) / 86400000) + 1);
    const loggedDays = new Set(pool.map((e) => dayKey(e.date))).size;
    const symptomDays = pool.filter((e) => e.symptoms.length).length;

    // Symptom breakdown
    const bySymptom = {};
    pool.forEach((e) => e.symptoms.forEach((s) => {
      bySymptom[s] = bySymptom[s] || { count: 0, sev: 0 };
      bySymptom[s].count++; bySymptom[s].sev += e.severity;
    }));
    const breakdown = Object.entries(bySymptom)
      .map(([name, v]) => ({ name, count: v.count, avgSev: (v.sev / v.count).toFixed(1) }))
      .sort((a, b) => b.count - a.count);

    // Medications
    const byMed = {};
    pool.forEach((e) => e.medications.filter((m) => m !== "None").forEach((m) => { byMed[m] = (byMed[m] || 0) + 1; }));

    const rangeLabel = startOfMonth.toLocaleDateString("en-US", { month: "long" }) + " 1–" + now.getDate() + ", " + now.getFullYear();

    return {
      rangeLabel,
      overview: [
        ["Days logged", `${loggedDays} of ${totalDays} (${Math.round(loggedDays/totalDays*100)}%)`],
        ["Symptom days", `${symptomDays} (${Math.round(symptomDays/Math.max(1,pool.length)*100)}%)`],
        ["Symptom-free days", `${pool.length - symptomDays} (${Math.round((pool.length-symptomDays)/Math.max(1,pool.length)*100)}%)`],
        ["Average severity", `${avg(pool.map(e=>e.severity)).toFixed(1)} / 10`],
        ["Most frequent symptom", breakdown.length ? `${breakdown[0].name} (${breakdown[0].count} days)` : "—"],
        ["Average sleep", `${avg(pool.map(e=>e.sleepHours)).toFixed(1)} hours/night`],
        ["Average stress", `${avg(pool.map(e=>e.stressLevel)).toFixed(1)} / 10`]
      ],
      breakdown: breakdown.map((b) => [b.name, `${b.count} day${b.count>1?"s":""} · avg ${b.avgSev}/10`]),
      patterns: patterns.filter((p) => !p.isEmerging),
      medications: Object.entries(byMed).map(([m, c]) => [m, `${c} instance${c>1?"s":""}`]),
      notes: pool.filter((e) => e.notes).slice(0, 3).map((e) => ({ notes: e.notes, date: new Date(e.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) }))
    };
  }

  // ---- Public API ----
  const Store = {
    SYMPTOMS, MOODS, ACTIVITIES, MEDS,
    _entries: loadEntries(),
    _settings: loadSettings(),

    get entries() { return this._entries; },
    get settings() { return this._settings; },

    persistEntries() { saveRaw(this._entries); },
    persistSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this._settings)); } catch (e) {} },

    addEntry(entry) {
      entry.id = "e-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
      this._entries.unshift(entry);
      this.persistEntries();
    },
    deleteEntry(id) {
      this._entries = this._entries.filter((e) => e.id !== id);
      this.persistEntries();
    },

    setSetting(key, value) { this._settings[key] = value; this.persistSettings(); },

    addCustomSymptom(name) {
      const list = this._settings.customSymptoms || [];
      if (name && !list.includes(name) && !SYMPTOMS.includes(name)) { list.push(name); this._settings.customSymptoms = list; this.persistSettings(); }
    },
    removeCustomSymptom(name) {
      this._settings.customSymptoms = (this._settings.customSymptoms || []).filter((s) => s !== name);
      this.persistSettings();
    },

    allSymptoms() { return [...SYMPTOMS, ...(this._settings.customSymptoms || [])]; },

    patterns() { return detectPatterns(this._entries); },
    metrics() { return computeMetrics(this._entries); },
    report() { return buildReport(this._entries, this.patterns()); },

    entryForDate(date) { return this._entries.find((e) => sameDay(e.date, date)) || null; },

    reset() {
      this._entries = sampleEntries().map((e, i) => ({ id: "seed-" + i, ...e }));
      this._settings = { ...DEFAULT_SETTINGS };
      this.persistEntries(); this.persistSettings();
    }
  };

  global.PametStore = Store;
})(window);
