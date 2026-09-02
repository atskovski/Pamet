'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { totpSecret, totp, verifyTotp, seal, open } = require('../lib/security');

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
