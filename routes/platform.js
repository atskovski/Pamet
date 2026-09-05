'use strict';

const express = require('express');
const { createOAuthRouter } = require('./oauth-auth');

const trimSlash = (value) => String(value || '').replace(/\/$/, '');
const grafanaConfigured = (env) => /^https:\/\//i.test(String(env.GRAFANA_OTLP_ENDPOINT || '')) && !!env.GRAFANA_OTLP_USERNAME && !!env.GRAFANA_OTLP_TOKEN;
const otlpTime = () => String(BigInt(Date.now()) * 1000000n);

function grafanaLogPayload(payload) {
  return {
    resourceLogs: [{
      resource: {
        attributes: [
          { key: 'service.name', value: { stringValue: 'pamet' } },
          { key: 'service.version', value: { stringValue: String(payload.version || 'unknown') } },
          { key: 'deployment.environment', value: { stringValue: String(payload.environment || 'production') } }
        ]
      },
      scopeLogs: [{
        scope: { name: 'pamet.ops', version: String(payload.version || 'unknown') },
        logRecords: [{
          timeUnixNano: otlpTime(),
          observedTimeUnixNano: otlpTime(),
          severityText: 'WARN',
          body: { stringValue: JSON.stringify(payload) }
        }]
      }]
    }]
  };
}

async function deliverSyntheticAlert(payload, { env = process.env, fetcher = globalThis.fetch } = {}) {
  const attempts = [];

  if (env.ALERT_WEBHOOK_URL) {
    attempts.push({
      transport: 'alert_webhook',
      send: () => fetcher(env.ALERT_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(env.ALERT_WEBHOOK_TOKEN ? { Authorization: `Bearer ${env.ALERT_WEBHOOK_TOKEN}` } : {})
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000)
      })
    });
  }

  if (grafanaConfigured(env)) {
    const endpoint = trimSlash(env.GRAFANA_OTLP_ENDPOINT);
    const authorization = Buffer.from(`${env.GRAFANA_OTLP_USERNAME}:${env.GRAFANA_OTLP_TOKEN}`).toString('base64');
    attempts.push({
      transport: 'grafana_otlp',
      send: () => fetcher(`${endpoint}/v1/logs`, {
        method: 'POST',
        headers: { Authorization: `Basic ${authorization}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(grafanaLogPayload(payload)),
        signal: AbortSignal.timeout(5000)
      })
    });
  }

  if (!attempts.length) return { attempted: [], delivered: [], failures: [] };

  const results = await Promise.all(attempts.map(async ({ transport, send }) => {
    try {
      const response = await send();
      if (!response.ok) return { transport, ok: false, status: response.status };
      return { transport, ok: true, status: response.status };
    } catch {
      return { transport, ok: false, status: 0 };
    }
  }));

  return {
    attempted: results.map((item) => item.transport),
    delivered: results.filter((item) => item.ok).map((item) => item.transport),
    failures: results.filter((item) => !item.ok).map((item) => ({ transport: item.transport, status: item.status }))
  };
}

function createPlatformRouter(platform) {
  const router = express.Router();

  router.use(createOAuthRouter({ appBaseUrl: process.env.APP_BASE_URL || '' }));

  router.get('/api/platform/capabilities', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(platform.capabilitySnapshot());
  });

  router.get('/api/ops/runtime', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!platform.authorizeMetrics(req)) return res.status(401).json({ error: 'Unauthorized.' });
    res.json(platform.runtimeSnapshot());
  });

  router.post('/api/ops/test-alert', async (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!platform.authorizeMetrics(req)) return res.status(401).json({ error: 'Unauthorized.' });
    try {
      const payload = {
        service: 'pamet',
        version: platform.capabilitySnapshot().version,
        environment: process.env.NODE_ENV || 'development',
        event: 'alert.synthetic_test',
        synthetic: true,
        severity: 'warning',
        requestId: req.pametRequestId || null,
        at: new Date().toISOString(),
        message: 'Pamet synthetic alert-delivery acceptance test. No user health data is included.'
      };
      const result = await deliverSyntheticAlert(payload);
      if (!result.attempted.length) return res.status(503).json({ error: 'No alert transport is configured.' });
      if (!result.delivered.length) return res.status(502).json({ error: 'Configured alert transports rejected the synthetic alert.', transports: result.failures });
      res.json({
        sent: true,
        synthetic: true,
        requestId: req.pametRequestId || null,
        transports: result.delivered,
        partial: result.failures.length > 0,
        failedTransports: result.failures
      });
    } catch (error) { next(error); }
  });

  return router;
}

module.exports = { createPlatformRouter, deliverSyntheticAlert, grafanaConfigured, grafanaLogPayload };
