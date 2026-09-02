'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../server');

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
  assert.deepEqual(await response.json(), { ok: true, version: '1.0.5' });
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

test('unknown and malformed requests do not leak internals', async () => {
  const missing = await fetch(`${base}/api/not-a-route`);
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: 'Not found.' });

  const malformed = await fetch(`${base}/api/account/bootstrap`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{'
  });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error, 'Invalid JSON request.');
});
