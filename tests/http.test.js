'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const version = require('../package.json').version;
const app = require('../secure-server');

let server;
let base;

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => new Promise((resolve) => server.close(resolve)));

test('health reports the normalized release and security headers', async () => {
  const response = await fetch(`${base}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, version });
  assert.equal(response.headers.get('x-pamet-version'), version);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
});

test('unconfigured billing fails closed', async () => {
  const response = await fetch(`${base}/api/billing/config`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.proEnabled, false);
  assert.equal(body.ultraEnabled, false);
});

test('operational runtime and synthetic alert endpoints are not public', async () => {
  const runtime = await fetch(`${base}/api/ops/runtime`);
  assert.equal(runtime.status, 401);
  assert.deepEqual(await runtime.json(), { error: 'Unauthorized.' });

  const alert = await fetch(`${base}/api/ops/test-alert`, { method: 'POST' });
  assert.equal(alert.status, 401);
  assert.deepEqual(await alert.json(), { error: 'Unauthorized.' });

  const adminRuntime = await fetch(`${base}/api/admin/ops/runtime`);
  assert.equal(adminRuntime.status, 404);
  assert.deepEqual(await adminRuntime.json(), { error: 'Not found.' });
});

test('unknown and malformed requests do not leak internals', async () => {
  const missing = await fetch(`${base}/api/not-a-route`);
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: 'Not found.' });

  const malformed = await fetch(`${base}/api/account/bootstrap`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{'
  });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error, 'Invalid JSON request.');

  const malformedAuth = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{'
  });
  assert.equal(malformedAuth.status, 400);
  assert.equal((await malformedAuth.json()).error, 'Invalid JSON request.');
  assert.equal(malformedAuth.headers.get('x-content-type-options'), 'nosniff');
});
