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
    userName: "",
    isDarkMode: false,
    dailyReminder: true,
    patternAlerts: true,
    streakReminders: false,
    weeklyDigest: true,
    aiPatterns: true,
    e2eEncryption: true,
    caregiverAccess: false,
    primaryCareAccess: false,
    showStreak: true,
    showInsight: true,
    plan: "free",
    customSymptoms: [],
    customMoods: [],
    customActivities: [],
    customMeds: []
  };

  // ---- Honor-system tiers (based on total unique days logged) ----
  // Clean, simple medical-medal badges. Ranges chosen so a regular
  // logger reaches Silver quickly and the top tiers reward real commitment.
  const TIERS = [
    { key: "beast",    name: "Beast",    minDays: 180, color: "#7C5CBF" },
    { key: "platinum", name: "Platinum", minDays: 91,  color: "#A7B8C8" },
    { key: "gold",     name: "Gold",     minDays: 31,  color: "#D9A441" },
    { key: "silver",   name: "Silver",   minDays: 8,   color: "#B4AFA6" },
    { key: "bronze",   name: "Bronze",   minDays: 1,   color: "#C08A5A" }
  ];

  // ---- Free vs Pro plans ----
  const PLANS = {
    free: {
      key: "free", name: "Free", price: "$0",
      features: [
        "Daily logging & calendar",
        "Up to 10 Pamet patterns",
        "5 custom fields per category",
        "Doctor report (PDF)",
        "Dark mode"
      ]
    },
    pro: {
      key: "pro", name: "Pro", price: "$6/mo",
      features: [
        "Unlimited Pamet patterns",
        "Unlimited custom fields",
        "CSV & JSON export",
        "Primary-care doctor sync",
        "Caregiver access",
        "No limits, no ads"
      ]
    }
  };

  // ---- Free-plan limits ----
  const FREE_LIMITS = {
    patterns: 10,
    customPerCategory: 5
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

  // ---- Persistence ----
  function loadEntries() {
    try {
      const raw = localStorage.getItem(ENTRY_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (Array.isArray(saved)) {
          // v1.0.3 migration: sample records from earlier builds were never user data.
          const entries = saved.filter((entry) => !String(entry && entry.id || "").startsWith("seed-"));
          if (entries.length !== saved.length) saveRaw(entries);
          return entries;
        }
      }
    } catch (e) { /* ignore */ }
    saveRaw([]);
    return [];
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
      streakDays: streak
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

  // ---- Tier + plan helpers ----
  function totalDaysLogged(entries) {
    return new Set(entries.map((e) => dayKey(e.date))).size;
  }
  function tierFor(days) {
    for (const t of TIERS) if (days >= t.minDays) return t;
    return null; // 0 days logged, no badge yet
  }
  // Next tier up (for the "X days to go" nudge), or null if already Beast.
  function nextTier(days) {
    for (const t of TIERS) if (days < t.minDays) return t;
    return null; // already at the top tier
  }
  function planOf() { return PLANS[Store._settings.plan] || PLANS.free; }
  function isPro() { return Store._settings.plan === "pro"; }
  function patternLimit() { return isPro() ? Infinity : FREE_LIMITS.patterns; }
  function customLimit(cat) { return isPro() ? Infinity : FREE_LIMITS.customPerCategory; }

  // ---- Public API ----
  const Store = {
    SYMPTOMS, MOODS, ACTIVITIES, MEDS, TIERS, PLANS, FREE_LIMITS,
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
    allMoods() { return [...MOODS, ...(this._settings.customMoods || [])]; },
    allActivities() { return [...ACTIVITIES, ...(this._settings.customActivities || [])]; },
    allMeds() { return [...MEDS, ...(this._settings.customMeds || [])]; },

    // Generic custom-field add/remove for the four log categories.
    addCustomField(category, name) {
      const key = { symptoms: "customSymptoms", moods: "customMoods", activities: "customActivities", meds: "customMeds" }[category];
      const canonical = { symptoms: SYMPTOMS, moods: MOODS, activities: ACTIVITIES, meds: MEDS }[category];
      if (!key || !name) return false;
      const list = this._settings[key] || [];
      if (list.includes(name) || canonical.includes(name)) return false;
      if (!isPro() && list.length >= FREE_LIMITS.customPerCategory) return false;
      list.push(name); this._settings[key] = list; this.persistSettings();
      return true;
    },
    removeCustomField(category, name) {
      const key = { symptoms: "customSymptoms", moods: "customMoods", activities: "customActivities", meds: "customMeds" }[category];
      if (!key) return;
      this._settings[key] = (this._settings[key] || []).filter((x) => x !== name);
      this.persistSettings();
    },
    customCount(category) {
      const key = { symptoms: "customSymptoms", moods: "customMoods", activities: "customActivities", meds: "customMeds" }[category];
      return (this._settings[key] || []).length;
    },

    // Honor-system + plan accessors
    totalDaysLogged() { return totalDaysLogged(this._entries); },
    tier() { return tierFor(totalDaysLogged(this._entries)); },
    nextTier() { return nextTier(totalDaysLogged(this._entries)); },
    plan() { return planOf(); },
    isPro() { return isPro(); },
    setPlan(key) { this._settings.plan = (key === "pro") ? "pro" : "free"; this.persistSettings(); },
    patternLimit() { return patternLimit(); },
    customLimit(category) { return customLimit(category); },

    patterns() { return this._settings.aiPatterns ? detectPatterns(this._entries) : []; },
    metrics() { return computeMetrics(this._entries); },
    report() { return buildReport(this._entries, this.patterns()); },

    entryForDate(date) { return this._entries.find((e) => sameDay(e.date, date)) || null; },

    reset() {
      this._entries = [];
      this._settings = { ...DEFAULT_SETTINGS };
      this.persistEntries(); this.persistSettings();
    },

    // Full wipe (used by "delete account"): entries + settings + account.
    wipeAll() {
      this._entries = [];
      this._settings = { ...DEFAULT_SETTINGS };
      this.persistEntries(); this.persistSettings();
    }
  };

  global.PametStore = Store;
})(window);
