'use strict';

const crypto = require('crypto');

const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{8,96}$/;
const FEATURE_KEYS = Object.freeze({
  patternConfidence: 'PAMET_FEATURE_PATTERN_CONFIDENCE',
  visitBriefSelection: 'PAMET_FEATURE_VISIT_BRIEF_SELECTION',
  quickLog: 'PAMET_FEATURE_QUICK_LOG',
  careCircles: 'PAMET_FEATURE_CARE_CIRCLES',
  appointmentPrep: 'PAMET_FEATURE_APPOINTMENT_PREP',
  encryptedJournal: 'PAMET_FEATURE_ENCRYPTED_JOURNAL',
  dataExport: 'PAMET_FEATURE_DATA_EXPORT',
  pushHealth: 'PAMET_FEATURE_PUSH_HEALTH',
  opsDashboard: 'PAMET_FEATURE_OPS_DASHBOARD'
});

function enabled(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value));
}

function safePath(req) {
  const raw = String(req.path || req.url || '/').split('?')[0];
  return raw
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/ig, ':id')
    .replace(/\/api\/share\/[^/]+/i, '/api/share/:token')
    .slice(0, 180);
}

function hashActor(req) {
  const authorization = String(req.headers.authorization || '');
  const cookie = String(req.headers.cookie || '');
  const source = authorization || cookie;
  if (!source) return null;
  return crypto.createHash('sha256').update(source).digest('hex').slice(0, 12);
}

function secureEqual(left, right) {
  if (!left || !right) return false;
  const a = Buffer.from(crypto.createHash('sha256').update(String(left)).digest('hex'));
  const b = Buffer.from(crypto.createHash('sha256').update(String(right)).digest('hex'));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requestId(req) {
  const supplied = String(req.headers['x-request-id'] || '').trim();
  return SAFE_REQUEST_ID.test(supplied) ? supplied : crypto.randomUUID();
}

function createPlatformFoundation({ version, nodeEnv = 'development', env = process.env } = {}) {
  const startedAt = Date.now();
  const counters = new Map();
  const recentFailures = [];

  function capabilitySnapshot() {
    const externalReviewRequired = {
      penetrationTest: 'external-required',
      accessibilityReview: 'external-required',
      legalComplianceReview: 'external-required',
      productionBackupRestoreEvidence: 'operator-required',
      stripeLiveModeDryRun: 'operator-required'
    };
    const features = {};
    for (const [key, envName] of Object.entries(FEATURE_KEYS)) {
      const defaultEnabled = key === 'dataExport';
      features[key] = { enabled: enabled(env[envName], defaultEnabled), flag: envName };
    }
    return {
      version,
      environment: nodeEnv,
      operations: {
        grafanaOtlp: !!(env.GRAFANA_OTLP_ENDPOINT && env.GRAFANA_OTLP_USERNAME && env.GRAFANA_OTLP_TOKEN),
        logDrain: !!env.LOG_DRAIN_URL,
        alertWebhook: !!env.ALERT_WEBHOOK_URL,
        metricsProtected: !!env.METRICS_SECRET
      },
      features,
      externalReviewRequired
    };
  }

  function record(method, path, status, durationMs) {
    const key = `${method}|${path}|${status}`;
    const current = counters.get(key) || { method, path, status, count: 0, totalDurationMs: 0, maxDurationMs: 0 };
    current.count += 1;
    current.totalDurationMs += durationMs;
    current.maxDurationMs = Math.max(current.maxDurationMs, durationMs);
    counters.set(key, current);
  }

  function recordFailure(event) {
    const clean = {
      at: new Date().toISOString(),
      requestId: event.requestId || null,
      method: event.method || null,
      path: event.path || null,
      status: Number(event.status || 500),
      message: String(event.message || 'Request failed').slice(0, 240)
    };
    recentFailures.unshift(clean);
    if (recentFailures.length > 25) recentFailures.length = 25;
    return clean;
  }

  function middleware(req, res, next) {
    if (!String(req.path || '').startsWith('/api/')) return next();
    const id = requestId(req);
    const path = safePath(req);
    const actorHash = hashActor(req);
    const started = process.hrtime.bigint();
    req.pametRequestId = id;
    res.setHeader('X-Request-ID', id);
    res.once('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
      record(req.method, path, res.statusCode, durationMs);
      if (res.statusCode >= 500) {
        const failure = recordFailure({ requestId: id, method: req.method, path, status: res.statusCode });
        console.error(JSON.stringify({ service: 'pamet', version, event: 'request.failed', actorHash, durationMs: Math.round(durationMs), ...failure }));
      } else if (durationMs >= 1500) {
        console.warn(JSON.stringify({ service: 'pamet', version, event: 'request.slow', requestId: id, actorHash, method: req.method, path, status: res.statusCode, durationMs: Math.round(durationMs), at: new Date().toISOString() }));
      }
    });
    next();
  }

  function runtimeSnapshot() {
    const routes = Array.from(counters.values())
      .map((item) => ({ ...item, averageDurationMs: item.count ? Math.round(item.totalDurationMs / item.count) : 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 50);
    return {
      ok: true,
      service: 'pamet',
      version,
      environment: nodeEnv,
      startedAt: new Date(startedAt).toISOString(),
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      memory: {
        rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
      },
      routes,
      recentFailures: recentFailures.slice(),
      capabilities: capabilitySnapshot()
    };
  }

  function authorizeMetrics(req) {
    const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    const header = String(req.headers['x-metrics-key'] || '').trim();
    return secureEqual(bearer || header, env.METRICS_SECRET || '');
  }

  return { middleware, runtimeSnapshot, capabilitySnapshot, authorizeMetrics, recordFailure, safePath };
}

module.exports = { createPlatformFoundation, FEATURE_KEYS, enabled, safePath };
