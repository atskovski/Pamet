/* ============================================================
   Pamet — app logic
   Renders every screen from the store, handles navigation,
   logging, settings, and export. No frameworks required.
   ============================================================ */

(function () {
  "use strict";
  const S = window.PametStore;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ---- HTML escape for any user-generated text ----
  function esc(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ---- Color helpers (map to CSS vars) ----
  const PAT_COLORS = { rose: "var(--rose-pink)", amber: "var(--warm-amber)", sage: "var(--sage-green)", neutral: "var(--ink-tertiary)" };
  function sevColor(sev) { return sev < 3 ? "var(--sage-green)" : sev < 6 ? "var(--warm-amber)" : "var(--rose-pink)"; }
  function sevClass(sev) { return sev < 3 ? "sage" : sev < 6 ? "mild" : "significant"; }

  // ---- State ----
  let currentTab = "home";
  let calCursor = new Date();           // month being shown in calendar
  let selectedDate = new Date();        // day selected in calendar

  // ============================================================
  // NAVIGATION
  // ============================================================
  function setTab(name) {
    currentTab = name;
    $$(".screen").forEach((s) => s.classList.toggle("active", s.id === "screen-" + name));
    $$(".tab[data-tab]").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
    if (name === "calendar") renderCalendar();
    if (name === "patterns") renderPatterns();
    if (name === "report") renderReport();
  }

  // ============================================================
  // DASHBOARD
  // ============================================================
  function greetingText() {
    const h = new Date().getHours();
    if (h >= 5 && h < 12) return "Good morning";
    if (h >= 12 && h < 17) return "Good afternoon";
    return "Good evening";
  }

  function renderDashboard() {
    const m = S.metrics();
    const pats = S.patterns();

    $("#greeting").textContent = `${greetingText()}, ${S.settings.userName || "friend"} 👋`;
    $("#todayDate").textContent = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

    // Streak
    $("#streakDays").textContent = m.streakDays;
    const dots = $("#streakDots");
    dots.innerHTML = "";
    for (let i = 0; i < 7; i++) {
      const d = document.createElement("span");
      if (i >= 6) d.className = "off";
      dots.appendChild(d);
    }

    // Insight banner (top pattern)
    const top = pats[0];
    if (top) {
      $("#insightText").textContent = top.detail;
      $("#insightBanner").style.display = "flex";
    } else {
      $("#insightBanner").style.display = "none";
    }

    // Metric cards
    const metricValues = {
      symptomDays: String(m.symptomDaysThisWeek),
      avgSeverity: m.avgSeverity,
      topSymptom: m.topSymptom,
      patterns: String(pats.filter((p) => !p.isEmerging).length)
    };
    $$(".metric-card").forEach((card) => {
      const key = card.dataset.metric;
      const valEl = card.querySelector("[data-value]");
      if (valEl) valEl.textContent = metricValues[key] ?? "--";
      const badgeEl = card.querySelector("[data-badge]");
      if (badgeEl) {
        if (key === "symptomDays") {
          const diff = m.symptomDaysThisWeek - (m.symptomDaysLastWeek || 0);
          badgeEl.textContent = diff >= 0 ? `+${diff} vs last` : `${diff} vs last`;
        } else {
          badgeEl.textContent = badgeEl.dataset.badge;
        }
      }
    });

    // Recent entries
    renderEntryList($("#recentEntries"), S.entries.slice(0, 5));
  }

  function renderEntryList(container, entries) {
    container.innerHTML = "";
    if (!entries.length) {
      container.innerHTML = `<div class="entry-row"><div class="entry-main"><p style="color:var(--text-tertiary);font-size:13px;margin:0">No entries yet. Tap the + button to log your first day.</p></div></div>`;
      return;
    }
    entries.forEach((e) => container.appendChild(entryRowEl(e)));
  }

  function entryRowEl(e) {
    const d = new Date(e.date);
    const row = document.createElement("div");
    row.className = "entry-row";

    let tags;
    if (!e.symptoms.length) {
      tags = `<span class="pill sage">No symptoms</span>`;
    } else {
      tags = e.symptoms.map((s) => `<span class="pill rose">${esc(s)}</span>`).join("");
    }
    tags += `<span class="pill neutral">Sleep ${e.sleepHours}h</span><span class="pill neutral">Stress ${Math.round(e.stressLevel)}/10</span>`;

    let dots = "";
    const filled = Math.round(e.severity / 2);
    for (let i = 0; i < 5; i++) dots += `<span class="${i < filled ? "on" : ""}"></span>`;

    row.innerHTML = `
      <div class="entry-date"><div class="d">${d.getDate()}</div><div class="m">${d.toLocaleDateString("en-US", { month: "short" })}</div></div>
      <div class="entry-main">
        <div class="entry-tags">${tags}</div>
        ${e.notes ? `<p class="entry-notes">${esc(e.notes)}</p>` : ""}
      </div>
      <div class="severity-dots">${dots}</div>`;
    return row;
  }

  // ============================================================
  // CALENDAR
  // ============================================================
  function renderCalendar() {
    const y = calCursor.getFullYear();
    const mo = calCursor.getMonth();
    $("#calMonth").textContent = calCursor.toLocaleDateString("en-US", { month: "long", year: "numeric" });

    // weekday header
    const wd = $("#calWeekdays");
    wd.innerHTML = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => `<span>${d}</span>`).join("");

    // build grid
    const first = new Date(y, mo, 1);
    const startWeekday = first.getDay(); // 0=Sun
    const daysInMonth = new Date(y, mo + 1, 0).getDate();
    const today = new Date();

    const grid = $("#calGrid");
    grid.innerHTML = "";
    for (let i = 0; i < startWeekday; i++) {
      const empty = document.createElement("div");
      empty.className = "cal-cell empty";
      grid.appendChild(empty);
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(y, mo, day);
      const entry = S.entryForDate(date);
      const cell = document.createElement("button");
      cell.className = "cal-cell";
      if (entry) {
        if (!entry.symptoms.length) cell.classList.add("healthy");
        else cell.classList.add(entry.severity >= 6 ? "significant" : "mild");
      }
      if (sameDay(date, today)) cell.classList.add("today");
      if (sameDay(date, selectedDate)) cell.classList.add("selected");
      cell.innerHTML = `<span class="num">${day}</span><span class="dot ${entry ? "has" : ""}"></span>`;
      cell.addEventListener("click", () => { selectedDate = date; renderCalendar(); });
      grid.appendChild(cell);
    }

    renderCalDetail();
  }

  function renderCalDetail() {
    const box = $("#calDetail");
    const d = selectedDate;
    const entry = S.entryForDate(d);
    let html = `<p class="detail-date">${d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>`;
    if (entry) {
      box.innerHTML = html + entryRowEl(entry).outerHTML;
    } else {
      html += `<div class="no-symptom"><svg class="icon" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg> No symptoms logged for this day.</div>`;
      box.innerHTML = html;
    }
  }

  function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }

  // ============================================================
  // PATTERNS
  // ============================================================
  function renderPatterns() {
    const pats = S.patterns();
    const confirmed = pats.filter((p) => !p.isEmerging).length;
    const daysCount = new Set(S.entries.map((e) => e.date.slice(0, 10))).size;
    $("#patternDaysCount").textContent = daysCount;
    $("#patternSummary").textContent = confirmed > 0
      ? `${confirmed} confirmed pattern${confirmed > 1 ? "s" : ""} detected. Patterns update nightly as you log more.`
      : "Log a few more days and your personal patterns will appear here.";

    const list = $("#patternList");
    list.innerHTML = "";
    pats.forEach((p) => {
      const c = PAT_COLORS[p.colorName] || PAT_COLORS.neutral;
      const card = document.createElement("div");
      card.className = "pattern-card" + (p.isEmerging ? " emerging" : "");
      const icon = p.isEmerging
        ? `<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`
        : `<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>`;
      card.innerHTML = `
        <div class="pattern-head">
          <span class="pattern-icon" style="background:color-mix(in srgb, ${c} 16%, transparent);color:${c}">${icon}</span>
          <div><p class="pattern-title">${esc(p.title)}</p><p class="pattern-occ">${esc(p.occurrences)}</p></div>
        </div>
        <p class="pattern-detail">${esc(p.detail)}</p>
        <div class="conf-row"><span class="lbl">Confidence</span><span style="color:${c};font-weight:800">${Math.round(p.confidence * 100)}%</span></div>
        <div class="conf-bar"><span style="width:${Math.round(p.confidence * 100)}%;background:${c}"></span></div>`;
      list.appendChild(card);
    });
  }

  // ============================================================
  // REPORT
  // ============================================================
  function renderReport() {
    const r = S.report();
    const doc = $("#reportDoc");
    doc.innerHTML = `
      <div class="report-hero">
        <h1>Symptom report</h1>
        <p>${esc(r.rangeLabel)} · Generated by Pamet · For medical use</p>
      </div>
      <div class="report-body">
        ${reportSection("Overview", r.overview.map(rowHtml).join(""))}
        ${r.breakdown.length ? reportSection("Symptom breakdown", r.breakdown.map(rowHtml).join("")) : ""}
        ${r.patterns.length ? reportSection("AI-identified patterns (for physician review)", r.patterns.map((p) => {
          const c = PAT_COLORS[p.colorName] || PAT_COLORS.neutral;
          return `<div class="report-bullet"><span class="bullet" style="color:${c}">•</span><span>${esc(p.title)} (${Math.round(p.confidence*100)}% confidence): ${esc(p.detail)}</span></div>`;
        }).join("")) : ""}
        ${r.medications.length ? reportSection("Medications noted", r.medications.map(rowHtml).join("")) : ""}
        ${r.notes.length ? reportSection("Patient notes (selected)", r.notes.map((n) => `<div class="report-quote">"${esc(n.notes)}" — ${esc(n.date)}</div>`).join("")) : ""}
      </div>`;
  }

  function rowHtml([k, v]) { return `<div class="report-row"><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div>`; }
  function reportSection(title, inner) { return `<div class="report-section"><h3>${esc(title)}</h3>${inner}</div>`; }

  // ---- Export: PDF via print, email via mailto, CSV/JSON download ----
  function download(filename, text, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportCsv() {
    const headers = ["date","symptoms","severity","sleep_hours","stress","water_glasses","energy","mood","activity","medications","notes"];
    const lines = [headers.join(",")];
    S.entries.forEach((e) => {
      const row = [
        e.date.slice(0, 10),
        csv(e.symptoms.join("; ")),
        e.severity, e.sleepHours, e.stressLevel, e.waterGlasses, e.energyLevel,
        csv(e.mood), csv(e.activity), csv(e.medications.join("; ")), csv(e.notes)
      ];
      lines.push(row.join(","));
    });
    download("pamet-export.csv", lines.join("\n"), "text/csv");
    toast("CSV exported");
  }

  function csv(v) { v = String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }

  function exportJson() {
    download("pamet-export.json", JSON.stringify(S.entries, null, 2), "application/json");
    toast("JSON exported");
  }

  function emailReport() {
    const r = S.report();
    let body = `Pamet Symptom Report\n${r.rangeLabel}\n\n`;
    body += "OVERVIEW\n" + r.overview.map(([k, v]) => `• ${k}: ${v}`).join("\n") + "\n\n";
    if (r.breakdown.length) body += "SYMPTOM BREAKDOWN\n" + r.breakdown.map(([k, v]) => `• ${k}: ${v}`).join("\n") + "\n\n";
    if (r.patterns.length) body += "AI PATTERNS\n" + r.patterns.map((p) => `• ${p.title} (${Math.round(p.confidence*100)}%): ${p.detail}`).join("\n") + "\n";
    const subject = encodeURIComponent(`Pamet symptom report — ${r.rangeLabel}`);
    window.location.href = `mailto:?subject=${subject}&body=${encodeURIComponent(body)}`;
  }

  function downloadPdf() {
    const r = S.report();
    const w = window.open("", "_blank", "width=820,height=1000");
    if (!w) { toast("Allow pop-ups to export PDF"); return; }
    const rows = (arr) => arr.map(([k, v]) => `<tr><td>${esc(k)}</td><td style="text-align:right;font-weight:600">${esc(v)}</td></tr>`).join("");
    w.document.write(`<!doctype html><html><head><title>Pamet Report</title>
      <style>
        *{box-sizing:border-box} body{font-family:Georgia,serif;color:#2C2118;margin:0;padding:40px;max-width:760px}
        .hero{background:#C4673A;color:#fff;padding:24px;border-radius:10px;margin-bottom:24px}
        .hero h1{margin:0 0 6px;font-size:26px} .hero p{margin:0;opacity:.85;font-size:13px}
        h2{font-size:13px;letter-spacing:1px;text-transform:uppercase;color:#8C7D6E;border-bottom:1px solid #EDE0D0;padding-bottom:6px;margin:24px 0 12px}
        table{width:100%;border-collapse:collapse;font-size:14px} td{padding:5px 0;vertical-align:top}
        .b{font-size:14px;margin:8px 0;line-height:1.5} .q{font-size:13px;color:#5C4F42;background:#FDF8F3;padding:10px;border-radius:8px;margin:8px 0}
      </style></head><body>
      <div class="hero"><h1>Symptom report</h1><p>${esc(r.rangeLabel)} · Generated by Pamet · For medical use</p></div>
      <h2>Overview</h2><table>${rows(r.overview)}</table>
      ${r.breakdown.length ? `<h2>Symptom breakdown</h2><table>${rows(r.breakdown)}</table>` : ""}
      ${r.patterns.length ? `<h2>AI-identified patterns</h2>` + r.patterns.map((p) => `<div class="b">• <strong>${esc(p.title)} (${Math.round(p.confidence*100)}%)</strong> — ${esc(p.detail)}</div>`).join("") : ""}
      ${r.medications.length ? `<h2>Medications noted</h2><table>${rows(r.medications)}</table>` : ""}
      ${r.notes.length ? `<h2>Patient notes</h2>` + r.notes.map((n) => `<div class="q">"${esc(n.notes)}" — ${esc(n.date)}</div>`).join("") : ""}
      </body></html>`);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 350);
    toast("Print dialog opened — choose 'Save as PDF'");
  }

  // ============================================================
  // LOG SHEET
  // ============================================================
  const logState = { symptoms: new Set(), severity: 4, sleepHours: 7, stressLevel: 5, waterGlasses: 6, energyLevel: 5, mood: "", activity: "", meds: new Set(), notes: "" };

  function openLog() {
    $("#logBackdrop").classList.add("open");
    document.body.style.overflow = "hidden";
  }
  function closeLog() {
    $("#logBackdrop").classList.remove("open");
    document.body.style.overflow = "";
  }

  function buildLogForm() {
    // Symptoms (multi)
    const sg = $("#symptomGrid");
    sg.innerHTML = "";
    S.allSymptoms().forEach((s) => {
      const b = document.createElement("button");
      b.className = "sym-btn" + (logState.symptoms.has(s) ? " selected" : "");
      b.textContent = s;
      b.addEventListener("click", () => { toggleSet(logState.symptoms, s); b.classList.toggle("selected"); });
      sg.appendChild(b);
    });

    // Mood (single)
    buildChipFlow($("#moodFlow"), S.MOODS, (v, el) => { if (logState.mood === v) { logState.mood = ""; el.classList.remove("selected"); } else { $$("#moodFlow .chip").forEach((c) => c.classList.remove("selected")); logState.mood = v; el.classList.add("selected"); } });

    // Activity (single)
    buildChipFlow($("#activityFlow"), S.ACTIVITIES, (v, el) => { if (logState.activity === v) { logState.activity = ""; el.classList.remove("selected"); } else { $$("#activityFlow .chip").forEach((c) => c.classList.remove("selected")); logState.activity = v; el.classList.add("selected"); } });

    // Meds (multi)
    buildChipFlow($("#medFlow"), S.MEDS, (v, el) => { if (v === "None") { logState.meds.clear(); $$("#medFlow .chip").forEach((c) => c.classList.remove("selected")); el.classList.add("selected"); return; } toggleSet(logState.meds, v); el.classList.toggle("selected"); });

    // Sliders
    $("#severityRange").value = logState.severity;
    $("#severityValue").textContent = `${Math.round(logState.severity)}/10`;
    $$(".range[data-field]").forEach((r) => { r.value = logState[r.dataset.field]; updateSliderOut(r); });
    $("#notesInput").value = logState.notes;
  }

  function buildChipFlow(container, items, onPick) {
    container.innerHTML = "";
    items.forEach((v) => {
      const c = document.createElement("button");
      c.className = "chip";
      c.textContent = v;
      c.addEventListener("click", () => onPick(v, c));
      container.appendChild(c);
    });
  }

  function toggleSet(set, v) { set.has(v) ? set.delete(v) : set.add(v); }

  function updateSliderOut(range) {
    const f = range.dataset.field;
    let out = range.value;
    if (f === "sleepHours") out += "h";
    else if (f === "waterGlasses") out += " glasses";
    else out += "/10";
    const label = range.closest(".slider-row").querySelector("[data-out]");
    if (label) label.textContent = out;
  }

  function resetLogForm() {
    logState.symptoms.clear();
    logState.severity = 4; logState.sleepHours = 7; logState.stressLevel = 5; logState.waterGlasses = 6; logState.energyLevel = 5;
    logState.mood = ""; logState.activity = ""; logState.meds.clear(); logState.notes = "";
    buildLogForm();
  }

  function saveEntry() {
    const entry = {
      date: new Date().toISOString(),
      symptoms: [...logState.symptoms],
      severity: logState.severity,
      sleepHours: logState.sleepHours,
      stressLevel: logState.stressLevel,
      waterGlasses: logState.waterGlasses,
      energyLevel: logState.energyLevel,
      mood: logState.mood,
      activity: logState.activity,
      medications: [...logState.meds],
      notes: $("#notesInput").value.trim()
    };
    S.addEntry(entry);
    // success feedback
    const banner = $("#logSuccess");
    banner.hidden = false;
    setTimeout(() => { banner.hidden = true; }, 3000);
    resetLogForm();
    refreshAll();
    setTimeout(closeLog, 900);
    toast("Entry saved");
  }

  // ============================================================
  // SETTINGS
  // ============================================================
  function renderSettings() {
    const s = S.settings;
    $("#userAvatar").textContent = (s.userName || "A").trim().charAt(0).toUpperCase() || "A";
    $("#userNameInput").value = s.userName;
    $("#settingsStreak").textContent = S.metrics().streakDays;

    const map = { setDarkMode: "isDarkMode", setDailyReminder: "dailyReminder", setPatternAlerts: "patternAlerts", setStreakReminders: "streakReminders", setWeeklyDigest: "weeklyDigest", setAiPatterns: "aiPatterns", setE2e: "e2eEncryption", setCaregiver: "caregiverAccess", setShareData: "shareData" };
    Object.entries(map).forEach(([id, key]) => { const el = $("#" + id); if (el) el.checked = !!s[key]; });

    // custom symptoms
    const list = $("#customSymptomList");
    list.innerHTML = "";
    (s.customSymptoms || []).forEach((sym) => {
      const li = document.createElement("li");
      li.innerHTML = `<span>${esc(sym)}</span>`;
      const rm = document.createElement("button");
      rm.className = "remove"; rm.textContent = "✕"; rm.title = "Remove";
      rm.addEventListener("click", () => { S.removeCustomSymptom(sym); renderSettings(); buildLogForm(); });
      li.appendChild(rm);
      list.appendChild(li);
    });
  }

  // ============================================================
  // THEME
  // ============================================================
  function applyTheme() {
    document.body.classList.toggle("dark", !!S.settings.isDarkMode);
  }

  // ============================================================
  // TOAST
  // ============================================================
  let toastTimer;
  function toast(msg) {
    let t = $("#toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; $(".app-shell").appendChild(t); }
    t.textContent = msg;
    requestAnimationFrame(() => t.classList.add("show"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
  }

  // ============================================================
  // REFRESH ALL
  // ============================================================
  function refreshAll() {
    renderDashboard();
    if (currentTab === "calendar") renderCalendar();
    if (currentTab === "patterns") renderPatterns();
    if (currentTab === "report") renderReport();
    if (currentTab === "settings") renderSettings();
  }

  // ============================================================
  // WIRE UP
  // ============================================================
  function init() {
    applyTheme();
    renderDashboard();
    $$(".tab[data-tab]").forEach((t) => t.classList.toggle("active", t.dataset.tab === currentTab));

    // Tab bar
    $$(".tab[data-tab]").forEach((t) => t.addEventListener("click", () => setTab(t.dataset.tab)));
    $("#openLog").addEventListener("click", openLog);

    // in-content nav links (dashboard -> patterns/calendar)
    $$("[data-nav]").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.nav)));

    // theme toggle
    $("#themeToggle").addEventListener("click", () => {
      S.setSetting("isDarkMode", !S.settings.isDarkMode);
      applyTheme();
    });

    // Log sheet
    $("#closeLog").addEventListener("click", closeLog);
    $("#logBackdrop").addEventListener("click", (e) => { if (e.target.id === "logBackdrop") closeLog(); });
    $("#saveEntry").addEventListener("click", saveEntry);

    // Sliders
    $("#severityRange").addEventListener("input", (e) => { logState.severity = +e.target.value; $("#severityValue").textContent = `${Math.round(logState.severity)}/10`; });
    $$(".range[data-field]").forEach((r) => r.addEventListener("input", (e) => { logState[r.dataset.field] = +e.target.value; updateSliderOut(e.target); }));

    // Calendar nav
    $("#calPrev").addEventListener("click", () => { calCursor.setMonth(calCursor.getMonth() - 1); renderCalendar(); });
    $("#calNext").addEventListener("click", () => { calCursor.setMonth(calCursor.getMonth() + 1); renderCalendar(); });

    // Report actions
    $("#emailReport").addEventListener("click", emailReport);
    $("#downloadPdf").addEventListener("click", downloadPdf);

    // Settings toggles
    const toggleMap = { setDarkMode: "isDarkMode", setDailyReminder: "dailyReminder", setPatternAlerts: "patternAlerts", setStreakReminders: "streakReminders", setWeeklyDigest: "weeklyDigest", setAiPatterns: "aiPatterns", setE2e: "e2eEncryption", setCaregiver: "caregiverAccess", setShareData: "shareData" };
    Object.entries(toggleMap).forEach(([id, key]) => {
      const el = $("#" + id);
      if (el) el.addEventListener("change", (e) => { S.setSetting(key, e.target.checked); if (key === "isDarkMode") applyTheme(); });
    });

    // Name
    $("#userNameInput").addEventListener("input", (e) => { S.setSetting("userName", e.target.value); $("#userAvatar").textContent = (e.target.value || "A").trim().charAt(0).toUpperCase() || "A"; });

    // Custom symptoms
    $("#addSymptomBtn").addEventListener("click", () => {
      const v = $("#newSymptomInput").value.trim();
      if (v) { S.addCustomSymptom(v); $("#newSymptomInput").value = ""; renderSettings(); buildLogForm(); toast("Symptom added"); }
    });
    $("#newSymptomInput").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#addSymptomBtn").click(); });

    // Data
    $("#exportCsv").addEventListener("click", exportCsv);
    $("#exportJson").addEventListener("click", exportJson);
    $("#deleteAccount").addEventListener("click", () => { if (confirm("Delete all Pamet data? This resets to sample entries.")) { S.reset(); applyTheme(); renderSettings(); refreshAll(); toast("Data reset"); } });

    // Build the log form once
    buildLogForm();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
