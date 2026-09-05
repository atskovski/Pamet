'use strict';

/* Network-level telemetry batching for the legacy server transport.
 * OTLP payloads are merged into bounded batches before they leave the process.
 * Successful request log-drain events are coalesced because the metrics stream
 * already preserves exact request counts; alerts/errors always pass through.
 */
function installTelemetryTransport({ flushMs = 750, maxBatch = 32, logCoalesceMs = 1000 } = {}) {
  if (globalThis.__pametTelemetryTransportInstalled || typeof globalThis.fetch !== 'function') return;
  globalThis.__pametTelemetryTransportInstalled = true;
  const originalFetch = globalThis.fetch.bind(globalThis);
  const endpoint = String(process.env.GRAFANA_OTLP_ENDPOINT || '').replace(/\/$/, '');
  const logDrain = String(process.env.LOG_DRAIN_URL || '');
  const queues = { logs: [], metrics: [] };
  const timers = { logs: null, metrics: null };
  const recentDrain = new Map();

  const synthetic = () => Promise.resolve({ ok: true, status: 202, statusText: 'Accepted' });
  function merge(signal, items) {
    if (signal === 'logs') return { resourceLogs: items.flatMap((item) => item.payload.resourceLogs || []) };
    return { resourceMetrics: items.flatMap((item) => item.payload.resourceMetrics || []) };
  }
  function flush(signal) {
    if (timers[signal]) { clearTimeout(timers[signal]); timers[signal] = null; }
    const items = queues[signal].splice(0, maxBatch);
    if (!items.length) return Promise.resolve();
    const first = items[0];
    const options = { ...first.options, body: JSON.stringify(merge(signal, items)), signal: AbortSignal.timeout(4000) };
    return originalFetch(first.url, options)
      .then((response) => { if (!response.ok) console.warn('otlp_batch_rejected', { signal, status: response.status, size: items.length }); })
      .catch((error) => console.warn('otlp_batch_failed', { signal, message: error.message, size: items.length }))
      .finally(() => { if (queues[signal].length) schedule(signal, 0); });
  }
  function schedule(signal, delay = flushMs) {
    if (timers[signal]) return;
    timers[signal] = setTimeout(() => flush(signal), delay);
    timers[signal].unref?.();
  }
  function enqueue(signal, url, options) {
    try {
      queues[signal].push({ url, options: { ...options }, payload: JSON.parse(String(options?.body || '{}')) });
      if (queues[signal].length >= maxBatch) flush(signal); else schedule(signal);
      return synthetic();
    } catch { return originalFetch(url, options); }
  }
  function shouldCoalesceDrain(options) {
    try {
      const event = JSON.parse(String(options?.body || '{}'));
      if (event.event !== 'http.request' || Number(event.status || 0) >= 500) return false;
      const key = `${event.method || ''}|${event.route || ''}|${event.status || ''}`;
      const now = Date.now();
      const previous = recentDrain.get(key) || 0;
      recentDrain.set(key, now);
      if (recentDrain.size > 1000) {
        const cutoff = now - logCoalesceMs * 2;
        for (const [entry, at] of recentDrain) if (at < cutoff) recentDrain.delete(entry);
      }
      return now - previous < logCoalesceMs;
    } catch { return false; }
  }

  globalThis.fetch = function pametBatchedFetch(input, options = {}) {
    const url = typeof input === 'string' ? input : String(input?.url || input || '');
    if (endpoint && url === `${endpoint}/v1/logs`) return enqueue('logs', url, options);
    if (endpoint && url === `${endpoint}/v1/metrics`) return enqueue('metrics', url, options);
    if (logDrain && url === logDrain && shouldCoalesceDrain(options)) return synthetic();
    return originalFetch(input, options);
  };

  const flushAll = () => { flush('logs'); flush('metrics'); };
  process.once('beforeExit', flushAll);
}

module.exports = { installTelemetryTransport };
