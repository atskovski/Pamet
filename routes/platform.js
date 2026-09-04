'use strict';

const express = require('express');
const { createOAuthRouter } = require('./oauth-auth');

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
    if (!process.env.ALERT_WEBHOOK_URL) return res.status(503).json({ error: 'Alert webhook is not configured.' });
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
      const response = await fetch(process.env.ALERT_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.ALERT_WEBHOOK_TOKEN ? { Authorization: `Bearer ${process.env.ALERT_WEBHOOK_TOKEN}` } : {})
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000)
      });
      if (!response.ok) return res.status(502).json({ error: 'Alert destination rejected the synthetic alert.', destinationStatus: response.status });
      res.json({ sent: true, synthetic: true, requestId: req.pametRequestId || null });
    } catch (error) { next(error); }
  });

  return router;
}

module.exports = { createPlatformRouter };
