'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { deliverSyntheticAlert } = require('../routes/platform');

const payload = {
  service: 'pamet',
  version: '1.6.9',
  environment: 'test',
  event: 'alert.synthetic_test',
  synthetic: true,
  severity: 'warning',
  requestId: 'test-request-1234',
  at: '2026-09-05T00:00:00.000Z',
  message: 'Pamet synthetic alert-delivery acceptance test. No user health data is included.'
};

test('synthetic alert reports no configured transport', async () => {
  const result = await deliverSyntheticAlert(payload, { env: {}, fetcher: async () => { throw new Error('unexpected fetch'); } });
  assert.deepEqual(result, { attempted: [], delivered: [], failures: [] });
});

test('synthetic alert delivers to the configured webhook without exposing secrets in the body', async () => {
  const calls = [];
  const env = { ALERT_WEBHOOK_URL: 'https://alerts.example.invalid/pamet', ALERT_WEBHOOK_TOKEN: 'secret-token' };
  const result = await deliverSyntheticAlert(payload, {
    env,
    fetcher: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, status: 202 };
    }
  });

  assert.deepEqual(result.delivered, ['alert_webhook']);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, env.ALERT_WEBHOOK_URL);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer secret-token');
  assert.equal(JSON.parse(calls[0].options.body).synthetic, true);
  assert.equal(calls[0].options.body.includes('secret-token'), false);
});

test('synthetic alert falls back to Grafana OTLP when no alert webhook is configured', async () => {
  const calls = [];
  const env = {
    GRAFANA_OTLP_ENDPOINT: 'https://otlp-gateway-prod-us-east-0.grafana.net/otlp',
    GRAFANA_OTLP_USERNAME: '123456',
    GRAFANA_OTLP_TOKEN: 'grafana-token'
  };
  const result = await deliverSyntheticAlert(payload, {
    env,
    fetcher: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, status: 200 };
    }
  });

  assert.deepEqual(result.delivered, ['grafana_otlp']);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${env.GRAFANA_OTLP_ENDPOINT}/v1/logs`);
  assert.match(calls[0].options.headers.Authorization, /^Basic /);
  const body = JSON.parse(calls[0].options.body);
  const logBody = JSON.parse(body.resourceLogs[0].scopeLogs[0].logRecords[0].body.stringValue);
  assert.equal(logBody.event, 'alert.synthetic_test');
  assert.equal(logBody.synthetic, true);
  assert.equal(calls[0].options.body.includes('grafana-token'), false);
});

test('synthetic alert succeeds when at least one configured transport accepts it', async () => {
  const env = {
    ALERT_WEBHOOK_URL: 'https://alerts.example.invalid/pamet',
    GRAFANA_OTLP_ENDPOINT: 'https://grafana.example.invalid/otlp',
    GRAFANA_OTLP_USERNAME: '123456',
    GRAFANA_OTLP_TOKEN: 'grafana-token'
  };
  const result = await deliverSyntheticAlert(payload, {
    env,
    fetcher: async (url) => url === env.ALERT_WEBHOOK_URL ? { ok: false, status: 500 } : { ok: true, status: 200 }
  });

  assert.deepEqual(result.delivered, ['grafana_otlp']);
  assert.deepEqual(result.failures, [{ transport: 'alert_webhook', status: 500 }]);
});
