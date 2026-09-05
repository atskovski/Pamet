/* Privacy-preserving real-user performance telemetry.
 * Sends only Web Vital timings/ratings and the coarse screen path; never journal,
 * symptom, note, account, or form data. Delivery is bounded and best-effort.
 */
(function (global) {
  'use strict';
  if (!('PerformanceObserver' in global) || global.PametPerformanceRUM) return;

  const values = new Map();
  let cls = 0;
  let sent = false;
  const path = () => {
    const active = document.querySelector('.screen.active')?.id || 'signed-out';
    return active.replace(/^screen-/, '').slice(0, 40);
  };
  const rating = (name, value) => {
    const thresholds = {
      LCP: [2500, 4000], INP: [200, 500], CLS: [0.1, 0.25],
      FCP: [1800, 3000], TTFB: [800, 1800]
    }[name];
    if (!thresholds) return 'unknown';
    return value <= thresholds[0] ? 'good' : value <= thresholds[1] ? 'needs-improvement' : 'poor';
  };
  const set = (name, value) => {
    if (!Number.isFinite(value) || value < 0) return;
    values.set(name, { name, value: Math.round(value * 1000) / 1000, rating: rating(name, value), path: path() });
  };

  try {
    const nav = performance.getEntriesByType('navigation')[0];
    if (nav) set('TTFB', nav.responseStart);
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) if (entry.name === 'first-contentful-paint') set('FCP', entry.startTime);
    }).observe({ type: 'paint', buffered: true });
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (last) set('LCP', last.startTime);
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) if (!entry.hadRecentInput) cls += entry.value;
      set('CLS', cls);
    }).observe({ type: 'layout-shift', buffered: true });
    if (PerformanceObserver.supportedEntryTypes?.includes('event')) {
      const interactions = new Map();
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.interactionId) continue;
          interactions.set(entry.interactionId, Math.max(interactions.get(entry.interactionId) || 0, entry.duration));
        }
        const durations = Array.from(interactions.values()).sort((a, b) => a - b);
        if (durations.length) {
          const index = Math.max(0, Math.ceil(durations.length * 0.98) - 1);
          set('INP', durations[index]);
        }
      }).observe({ type: 'event', buffered: true, durationThreshold: 40 });
    }
  } catch { /* unsupported observer types are non-fatal */ }

  function flush() {
    if (sent || !values.size) return;
    sent = true;
    const body = JSON.stringify({ metrics: Array.from(values.values()).slice(0, 8) });
    if (navigator.sendBeacon) {
      try {
        const blob = new Blob([body], { type: 'application/json' });
        if (navigator.sendBeacon('/api/performance', blob)) return;
      } catch { /* fall through */ }
    }
    fetch('/api/performance', { method: 'POST', credentials: 'same-origin', keepalive: true, headers: { 'Content-Type': 'application/json' }, body }).catch(() => {});
  }

  global.addEventListener('pagehide', flush, { once: true });
  global.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  setTimeout(flush, 15000);
  global.PametPerformanceRUM = { snapshot: () => Array.from(values.values()), flush };
})(window);
