'use strict';

const crypto = require('crypto');
const test = require('node:test');
const assert = require('node:assert/strict');
const { totpSecret, totp, verifyTotp, seal, open, breachedPassword } = require('../lib/security');
const { distributedRateLimit } = require('../lib/rate-limit');

test('TOTP secrets generate valid current codes and reject malformed codes', () => {
  const secret = totpSecret();
  assert.match(secret, /^[A-Z2-7]+$/);
  assert.equal(verifyTotp(secret, totp(secret)), true);
  assert.equal(verifyTotp(secret, '123'), false);
});

test('MFA secret encryption is authenticated and reversible only with the deployment key', () => {
  const before = process.env.IDENTITY_ENCRYPTION_KEY;
  process.env.IDENTITY_ENCRYPTION_KEY = '11'.repeat(32);
  try {
    const encrypted = seal('sensitive-seed');
    assert.notEqual(encrypted, 'sensitive-seed');
    assert.equal(open(encrypted), 'sensitive-seed');
    const tampered = `${encrypted.slice(0, -2)}AA`;
    assert.throws(() => open(tampered));
  } finally {
    if (before === undefined) delete process.env.IDENTITY_ENCRYPTION_KEY; else process.env.IDENTITY_ENCRYPTION_KEY = before;
  }
});

test('breached-password lookup uses a k-anonymity prefix and matches only the returned suffix', async () => {
  const password = 'correct horse battery staple';
  const digest = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
  let requestedUrl = '';
  const fakeFetch = async (url, options) => {
    requestedUrl = String(url);
    assert.equal(options.headers['Add-Padding'], 'true');
    return { ok: true, text: async () => `${digest.slice(5)}:42\n${'A'.repeat(35)}:1\n` };
  };
  assert.equal(await breachedPassword(password, fakeFetch), true);
  assert.match(requestedUrl, new RegExp(`/range/${digest.slice(0, 5)}$`));
  assert.equal(requestedUrl.includes(digest.slice(5)), false);
});

test('account-keyed limiter follows the account key across changing source IPs', async () => {
  const before = process.env.DISABLE_RATE_LIMITS;
  delete process.env.DISABLE_RATE_LIMITS;
  const limiter = distributedRateLimit({ windowMs: 60 * 60 * 1000, max: 1, name: `account-test-${Date.now()}`, keyGenerator: (req) => req.body.email });
  const response = () => ({
    headers: {}, statusCode: 200, payload: null,
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = String(value); },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.payload = value; return this; }
  });
  try {
    let firstNext = false;
    await limiter({ ip: '192.0.2.1', socket: {}, body: { email: 'same@example.com' } }, response(), () => { firstNext = true; });
    assert.equal(firstNext, true);
    const second = response(); let secondNext = false;
    await limiter({ ip: '198.51.100.2', socket: {}, body: { email: 'same@example.com' } }, second, () => { secondNext = true; });
    assert.equal(secondNext, false);
    assert.equal(second.statusCode, 429);
  } finally {
    if (before === undefined) delete process.env.DISABLE_RATE_LIMITS; else process.env.DISABLE_RATE_LIMITS = before;
  }
});
