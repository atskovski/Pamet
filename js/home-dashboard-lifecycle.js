/* Pamet Home lifecycle guard — keeps enhanced Home state aligned with stored settings and entries. */
(() => {
  'use strict';

  const S = window.PametStore;
  if (!S) return;
  const $ = (selector, root = document) => root.querySelector(selector);
  let streakObserver = null;
  let lateTimer = null;

  function hasEntries() {
    return Array.isArray(S.entries) && S.entries.length > 0;
  }

  function syncStreakVisibility() {
    const card = $('#streakCard');
    if (!card) return;
    const desiredHidden = S.settings.showStreak === false;
    if (card.hidden !== desiredHidden) card.hidden = desiredHidden;
  }

  function installStreakGuard() {
    const card = $('#streakCard');
    if (!card) return;
    if (!streakObserver) {
      streakObserver = new MutationObserver(syncStreakVisibility);
      streakObserver.observe(card, { attributes: true, attributeFilter: ['hidden'] });
    }
    syncStreakVisibility();
  }

  function syncHomeState() {
    const populated = hasEntries();
    const empty = $('#homeEmptyState');
    const recent = $('#recentSection');
    const starter = $('#homeStarterGuide');
    const visitBrief = $('.home-visit-brief');
    const starterGrid = $('#homeStarterGuide .home-starter-grid');
    const starterKicker = $('#homeStarterGuide .home-dashboard-kicker');

    if (empty) empty.hidden = populated;
    if (recent) recent.hidden = !populated;
    if (starter) starter.hidden = populated;
    if (visitBrief) visitBrief.hidden = false;
    if (starterKicker) starterKicker.textContent = 'WHAT PAMET WILL BUILD';
    if (starterGrid?.children.length > 2) starterGrid.children[2].remove();

    installStreakGuard();
  }

  function scheduleSync() {
    queueMicrotask(syncHomeState);
    requestAnimationFrame(syncHomeState);
    clearTimeout(lateTimer);
    lateTimer = setTimeout(syncHomeState, 100);
  }

  window.addEventListener('pamet:entry-saved', scheduleSync);
  window.addEventListener('pamet:login', scheduleSync);
  window.addEventListener('pamet:registered', scheduleSync);
  window.addEventListener('pamet:profile-updated', scheduleSync);
  window.addEventListener('pageshow', scheduleSync);
  window.addEventListener('storage', scheduleSync);
  document.addEventListener('pamet:settings-rendered', scheduleSync);
  document.addEventListener('change', (event) => {
    if (event.target?.matches?.('#setShowStreak,#setShowInsight')) scheduleSync();
  });
  document.addEventListener('click', (event) => {
    if (event.target?.closest?.('[data-tab="home"]')) requestAnimationFrame(syncHomeState);
  }, true);

  syncHomeState();
})();
