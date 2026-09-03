'use strict';

const express = require('express');

function createPlatformRouter(platform) {
  const router = express.Router();

  router.get('/api/platform/capabilities', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(platform.capabilitySnapshot());
  });

  router.get('/api/ops/runtime', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!platform.authorizeMetrics(req)) return res.status(401).json({ error: 'Unauthorized.' });
    res.json(platform.runtimeSnapshot());
  });

  return router;
}

module.exports = { createPlatformRouter };
