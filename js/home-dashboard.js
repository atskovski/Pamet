/* Pamet home dashboard — compact, data-backed Home experience. */
(() => {
  'use strict';

  const S = window.PametStore;
  if (!S) return;

  const $ = (selector, root = document) => root.querySelector(selector);
  const DAY_MS = 86400000;

  function startOfDay(value) {
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function dayKey(value) {
    const date = startOfDay(value);
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  }

  function dayOffset(days) {
    const date = startOfDay(new Date());
    date.setDate(date.getDate() + days);
    return date;
  }

  function entriesInRange(entries, from, toExclusive) {
    return entries.filter((entry) => {
      const date = new Date(entry.date);
      return date >= from && date < toExclusive;
    });
  }

  function dailySummary(entries, from, days) {
    const map = new Map();
    for (let index = 0; index < days; index += 1) {
      const date = new Date(from);
      date.setDate(date.getDate() + index);
      map.set(dayKey(date), { date, entries: [], logged: false, symptoms: new Set(), severity: 0 });
    }

    entries.forEach((entry) => {
      const summary = map.get(dayKey(entry.date));
      if (!summary) return;
      summary.logged = true;
      summary.entries.push(entry);
      (entry.symptoms || []).forEach((symptom) => summary.symptoms.add(symptom));
      if ((entry.symptoms || []).length) summary.severity = Math.max(summary.severity, Number(entry.severity || 0));
    });
    return [...map.values()];
  }

  function mostFrequentSymptom(entries) {
    const counts = new Map();
    const daysBySymptom = new Map();
    entries.forEach((entry) => {
      const key = dayKey(entry.date);
      new Set(entry.symptoms || []).forEach((symptom) => {
        if (!symptom) return;
        const set = daysBySymptom.get(symptom) || new Set();
        set.add(key);
        daysBySymptom.set(symptom, set);
      });
    });
    daysBySymptom.forEach((days, symptom) => counts.set(symptom, days.size));
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] || null;
  }

  function ensureEmptyCta() {
    let mark = $('.home-empty-mark');
    if (!mark) return;
    if (mark.tagName !== 'BUTTON') {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = mark.className;
      button.id = 'homeEmptyPlus';
      button.setAttribute('aria-label', 'Log your first entry');
      button.textContent = '＋';
      mark.replaceWith(button);
      mark = button;
    }
    if (mark.dataset.homeCtaWired === 'true') return;
    mark.dataset.homeCtaWired = 'true';
    mark.addEventListener('click', () => $('#emptyLogEntry')?.click());
  }

  function ensureStarterGuide() {
    let guide = $('#homeStarterGuide');
    if (guide) return guide;
    const empty = $('#homeEmptyState');
    if (!empty) return null;
    guide = document.createElement('section');
    guide.id = 'homeStarterGuide';
    guide.className = 'home-starter-guide';
    guide.hidden = true;
    guide.setAttribute('aria-labelledby', 'homeStarterTitle');
    guide.innerHTML = `
      <div class="home-starter-copy">
        <p class="home-dashboard-kicker">WHAT YOU'LL SEE HERE</p>
        <h2 id="homeStarterTitle">A clearer view of your recorded history</h2>
        <p>As you log, Home will organize what you recorded without making medical conclusions.</p>
      </div>
      <div class="home-starter-grid">
        <div class="home-starter-item"><strong>Past 7 days</strong><span>A small trend view of logged days and symptom severity.</span></div>
        <div class="home-starter-item"><strong>Pamet observations</strong><span>Plain-language summaries based only on your entries.</span></div>
        <div class="home-starter-item"><strong>Visit Brief</strong><span>A concise history you can use to prepare for a healthcare conversation.</span></div>
      </div>`;
    empty.insertAdjacentElement('afterend', guide);
    return guide;
  }

  function ensureWeekCard() {
    let card = $('#homeWeekCard');
    if (card) return card;
    const metrics = $('#metricsGrid');
    if (!metrics) return null;
    card = document.createElement('section');
    card.id = 'homeWeekCard';
    card.className = 'home-week-card';
    card.hidden = true;
    card.setAttribute('aria-labelledby', 'homeWeekTitle');
    card.innerHTML = `
      <div class="home-week-head">
        <div>
          <p class="home-dashboard-kicker">YOUR RECENT HISTORY</p>
          <h2 id="homeWeekTitle">Past 7 days</h2>
        </div>
        <button class="link-btn home-week-log" id="homeWeekLog" type="button">Log today</button>
      </div>
      <div class="home-week-stats" aria-label="Past 7 day summary">
        <div class="home-week-stat"><strong id="homeWeekLogged">0/7</strong><span>Days logged</span></div>
        <div class="home-week-stat"><strong id="homeWeekSymptoms">0</strong><span>Symptom days</span></div>
        <div class="home-week-stat"><strong id="homeWeekSeverity">—</strong><span>Avg symptom severity</span></div>
      </div>
      <div class="home-week-trend" id="homeWeekTrend" aria-label="Seven day symptom severity trend"></div>
      <div class="home-week-foot">
        <p id="homeWeekTopSymptom"></p>
        <p id="homeWeekComparison"></p>
      </div>`;
    metrics.insertAdjacentElement('beforebegin', card);
    $('#homeWeekLog', card)?.addEventListener('click', () => $('#openLog')?.click());
    return card;
  }

  function renderStreak(entries) {
    const card = $('#streakCard');
    if (!card) return;
    const enabled = S.settings.showStreak !== false;
    card.hidden = !enabled;
    if (!enabled) return;

    const metrics = S.metrics?.() || { streakDays: 0 };
    const streak = Number(metrics.streakDays || 0);
    const days = $('#streakDays', card);
    const sub = $('.streak-sub', card);
    const dots = $('#streakDots', card);
    if (days) days.textContent = String(streak);
    if (sub) {
      if (!entries.length) sub.textContent = 'Your first entry starts your streak.';
      else if (entries.some((entry) => dayKey(entry.date) === dayKey(new Date()))) sub.textContent = 'Today is logged. Keep building your history.';
      else sub.textContent = 'Log today to keep your recent history current.';
    }
    if (dots) {
      const logged = new Set(entries.map((entry) => dayKey(entry.date)));
      dots.replaceChildren();
      for (let offset = -6; offset <= 0; offset += 1) {
        const dot = document.createElement('span');
        const date = dayOffset(offset);
        if (!logged.has(dayKey(date))) dot.className = 'off';
        dot.setAttribute('aria-hidden', 'true');
        dots.appendChild(dot);
      }
    }
  }

  function renderObservation(entries) {
    const banner = $('#insightBanner');
    const text = $('#insightText');
    if (!banner || !text) return;
    if (!entries.length || S.settings.showInsight === false) {
      banner.hidden = true;
      return;
    }

    const end = dayOffset(1);
    const start = dayOffset(-29);
    const recent = entriesInRange(entries, start, end);
    const loggedDays = new Set(recent.map((entry) => dayKey(entry.date))).size;
    const top = mostFrequentSymptom(recent);
    const symptomFreeDays = new Set(recent.filter((entry) => !(entry.symptoms || []).length).map((entry) => dayKey(entry.date))).size;
    const kicker = $('.insight-kicker', banner);
    if (kicker) kicker.textContent = 'PAMET OBSERVATION — BASED ON YOUR LOGS';

    if (top) {
      const [name, count] = top;
      text.textContent = `${name} was your most frequently recorded symptom in the past 30 days — ${count} of ${loggedDays} logged day${loggedDays === 1 ? '' : 's'}.`;
    } else if (loggedDays >= 2) {
      text.textContent = `You logged ${loggedDays} days in the past 30 days, including ${symptomFreeDays} symptom-free day${symptomFreeDays === 1 ? '' : 's'}. Pamet will keep organizing what changes as your history grows.`;
    } else {
      text.textContent = 'Your baseline has started. Keep logging ordinary days as well as symptom days so your history becomes more useful over time.';
    }
    banner.hidden = false;
  }

  function severityLabel(summary) {
    if (!summary.logged) return 'No entry';
    if (!summary.symptoms.size) return 'Logged, no symptoms';
    return `Severity ${summary.severity} of 10`;
  }

  function renderWeek(entries) {
    const card = ensureWeekCard();
    if (!card) return;
    if (!entries.length) {
      card.hidden = true;
      return;
    }

    const todayEnd = dayOffset(1);
    const currentStart = dayOffset(-6);
    const previousStart = dayOffset(-13);
    const currentEntries = entriesInRange(entries, currentStart, todayEnd);
    const previousEntries = entriesInRange(entries, previousStart, currentStart);
    const currentDays = dailySummary(currentEntries, currentStart, 7);
    const previousDays = dailySummary(previousEntries, previousStart, 7);
    const loggedDays = currentDays.filter((day) => day.logged).length;
    const symptomDays = currentDays.filter((day) => day.symptoms.size).length;
    const symptomSeverities = currentDays.filter((day) => day.symptoms.size).map((day) => day.severity);
    const avgSeverity = symptomSeverities.length ? (symptomSeverities.reduce((sum, value) => sum + value, 0) / symptomSeverities.length).toFixed(1) : '—';
    const previousSymptomDays = previousDays.filter((day) => day.symptoms.size).length;
    const top = mostFrequentSymptom(currentEntries);

    $('#homeWeekLogged', card).textContent = `${loggedDays}/7`;
    $('#homeWeekSymptoms', card).textContent = String(symptomDays);
    $('#homeWeekSeverity', card).textContent = avgSeverity === '—' ? '—' : `${avgSeverity}/10`;

    const trend = $('#homeWeekTrend', card);
    trend.replaceChildren();
    currentDays.forEach((summary) => {
      const item = document.createElement('div');
      item.className = 'home-trend-day';
      const track = document.createElement('span');
      track.className = 'home-trend-track';
      const fill = document.createElement('span');
      const level = Math.max(0, Math.min(10, Math.round(summary.severity || 0)));
      fill.className = `home-trend-fill level-${level}${summary.logged && !summary.symptoms.size ? ' is-clear' : ''}${!summary.logged ? ' is-empty' : ''}`;
      track.appendChild(fill);
      const label = document.createElement('span');
      label.className = 'home-trend-label';
      label.textContent = summary.date.toLocaleDateString('en-US', { weekday: 'narrow' });
      item.setAttribute('aria-label', `${summary.date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}: ${severityLabel(summary)}`);
      item.append(track, label);
      trend.appendChild(item);
    });

    const topText = $('#homeWeekTopSymptom', card);
    if (topText) topText.textContent = top ? `Most recorded this period: ${top[0]} on ${top[1]} day${top[1] === 1 ? '' : 's'}.` : 'No symptoms were recorded in the past 7 days.';

    const comparison = $('#homeWeekComparison', card);
    if (comparison) {
      const delta = symptomDays - previousSymptomDays;
      if (!previousDays.some((day) => day.logged)) comparison.textContent = 'Keep logging to add a previous-period comparison.';
      else if (delta === 0) comparison.textContent = 'Symptom-day count is unchanged from the previous 7 days.';
      else comparison.textContent = `Compared with the previous 7 days: ${Math.abs(delta)} ${delta > 0 ? 'more' : 'fewer'} symptom day${Math.abs(delta) === 1 ? '' : 's'}.`;
    }
    card.hidden = false;
  }

  function renderHome() {
    const home = $('#screen-home');
    if (!home) return;
    home.classList.add('home-dashboard-v166');
    ensureEmptyCta();
    const starter = ensureStarterGuide();
    ensureWeekCard();

    const entries = Array.isArray(S.entries) ? [...S.entries] : [];
    const hasEntries = entries.length > 0;
    if (starter) starter.hidden = hasEntries;
    const visitBrief = $('.home-visit-brief');
    if (visitBrief) visitBrief.hidden = !hasEntries;

    renderStreak(entries);
    renderObservation(entries);
    renderWeek(entries);
  }

  const scheduleRender = () => queueMicrotask(renderHome);

  window.addEventListener('pamet:entry-saved', scheduleRender);
  window.addEventListener('pamet:login', scheduleRender);
  window.addEventListener('pamet:registered', scheduleRender);
  window.addEventListener('pamet:profile-updated', scheduleRender);
  window.addEventListener('pageshow', renderHome);
  window.addEventListener('storage', scheduleRender);
  document.addEventListener('pamet:settings-rendered', scheduleRender);
  document.addEventListener('change', (event) => {
    if (event.target?.matches?.('#setShowStreak,#setShowInsight')) scheduleRender();
  });
  document.addEventListener('click', (event) => {
    if (event.target?.closest?.('[data-tab="home"]')) requestAnimationFrame(renderHome);
  }, true);

  renderHome();
})();
