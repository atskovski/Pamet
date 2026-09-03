'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const { createPlatformFoundation, safePath } = require('../lib/platform-foundation');
const { clampBatchSize } = require('../lib/batch');

test('platform capabilities keep external gates explicit and implemented device features available', () => {
  const platform = createPlatformFoundation({ version: '1.6.1', nodeEnv: 'test', env: { METRICS_SECRET: 'secret' } });
  const snapshot = platform.capabilitySnapshot();
  assert.equal(snapshot.version, '1.6.1');
  assert.equal(snapshot.features.dataExport.enabled, true);
  assert.equal(snapshot.features.pushHealth.enabled, true);
  assert.equal(snapshot.features.encryptedJournal.enabled, false);
  assert.equal(snapshot.externalReviewRequired.penetrationTest, 'external-required');
  assert.equal(snapshot.externalReviewRequired.cryptographicReview, 'external-required');
  assert.equal(snapshot.externalReviewRequired.alertDeliveryAcceptance, 'operator-required');
});

test('ops runtime authorization requires the metrics secret', () => {
  const platform = createPlatformFoundation({ version: '1.6.1', nodeEnv: 'test', env: { METRICS_SECRET: 'secret-value' } });
  assert.equal(platform.authorizeMetrics({ headers: { authorization: 'Bearer secret-value' } }), true);
  assert.equal(platform.authorizeMetrics({ headers: { 'x-metrics-key': 'wrong' } }), false);
});

test('request middleware emits request id and captures bounded runtime metrics', () => {
  const platform = createPlatformFoundation({ version: '1.6.1', nodeEnv: 'test', env: { METRICS_SECRET: 'secret' } });
  const req = { path: '/api/example/123e4567-e89b-12d3-a456-426614174000', url: '/api/example', method: 'GET', headers: {} };
  const res = new EventEmitter();
  res.statusCode = 200;
  res.headers = {};
  res.setHeader = (name, value) => { res.headers[name] = value; };
  let nextCalled = false;
  platform.middleware(req, res, () => { nextCalled = true; });
  res.emit('finish');
  assert.equal(nextCalled, true);
  assert.match(res.headers['X-Request-ID'], /^[0-9a-f-]{36}$/i);
  const runtime = platform.runtimeSnapshot();
  assert.equal(runtime.routes.length, 1);
  assert.equal(runtime.routes[0].path, '/api/example/:id');
});

test('safe paths remove share tokens and UUIDs from telemetry', () => {
  assert.equal(safePath({ path: '/api/share/private-token-value', url: '' }), '/api/share/:token');
  assert.equal(safePath({ path: '/api/items/123e4567-e89b-12d3-a456-426614174000', url: '' }), '/api/items/:id');
});

test('batch size is bounded before a database query is constructed', () => {
  assert.equal(clampBatchSize(0), 250);
  assert.equal(clampBatchSize(5000), 1000);
  assert.equal(clampBatchSize(25), 25);
});
