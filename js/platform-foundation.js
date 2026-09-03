/* Pamet platform foundation: capability discovery, local export, and notification health. */
(function () {
  'use strict';

  const S = window.PametStore;
  const state = { capabilities: null, notificationHealth: null };

  function emit(name, detail) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }

  async function loadCapabilities() {
    try {
      const response = await fetch('/api/platform/capabilities', { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) return null;
      state.capabilities = await response.json();
      window.PametCapabilities = state.capabilities;
      emit('pamet:capabilities', state.capabilities);
      return state.capabilities;
    } catch {
      return null;
    }
  }

  function exportPayload() {
    if (!S?.exportAllData) throw new Error('Pamet data store is unavailable.');
    const payload = S.exportAllData();
    return { ...payload, appVersion: window.PametVersion || window.PametLoadedVersion || 'unknown' };
  }

  function downloadJson() {
    const payload = exportPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `pamet-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    emit('pamet:data-exported', { format: payload.format, exportedAt: payload.exportedAt });
    return payload;
  }

  async function notificationHealth() {
    const result = {
      supported: 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window,
      permission: 'Notification' in window ? Notification.permission : 'unsupported',
      subscribed: false,
      needsAttention: false
    };
    try {
      if (result.supported) {
        const registration = await navigator.serviceWorker.ready;
        result.subscribed = !!(await registration.pushManager.getSubscription());
      }
    } catch { /* health remains best-effort */ }
    const remindersExpected = !!(S?.settings?.dailyReminder || S?.settings?.patternAlerts);
    result.needsAttention = remindersExpected && (!result.supported || result.permission === 'denied' || (result.permission === 'granted' && !result.subscribed));
    state.notificationHealth = result;
    window.PametNotificationHealth = result;
    emit('pamet:notification-health', result);
    return result;
  }

  function scheduleStartupChecks() {
    const run = () => {
      loadCapabilities();
      notificationHealth();
    };
    if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 2200 });
    else setTimeout(run, 600);
  }

  window.PametPlatform = Object.freeze({
    get capabilities() { return state.capabilities; },
    get notificationHealth() { return state.notificationHealth; },
    loadCapabilities,
    notificationHealth,
    exportPayload,
    downloadJson
  });

  window.addEventListener('load', scheduleStartupChecks, { once: true });
  window.addEventListener('pamet:settings-rendered', () => notificationHealth());
})();
