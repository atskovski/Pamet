'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

if (!global.crypto) global.crypto = crypto.webcrypto;
if (!global.window) global.window = global;

require('../js/qr-v1.2.0.js');
require('../js/local-encryption-v1.2.0.js');

test('authenticator QR renders locally as a complete version 10 matrix', () => {
  const uri = 'otpauth://totp/Pamet%3Atest%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Pamet&digits=6&period=30';
  const matrix = global.PametQr.matrix(uri);
  assert.equal(matrix.length, 57);
  assert.ok(matrix.every((row) => row.length === 57));
  assert.equal(matrix[0][0], true);
  assert.equal(matrix[6][6], true);
  const svg = global.PametQr.svg(uri);
  assert.match(svg, /Authenticator setup QR code/);
  assert.match(svg, /<svg/);
  assert.match(svg, /<path/);
});

test('local encryption framework stages and verifies a recoverable migration without enabling it', async () => {
  const framework = global.PametLocalEncryption;
  assert.equal(framework.enabled, false);
  assert.equal(framework.reviewRequired, true);
  const journal = { entries: [{ id: 'e1', symptom: 'Headache', severity: 4 }], settings: { showStreak: true } };
  const staged = await framework.stageMigration('primary', journal);
  assert.equal(staged.status, 'staged-not-committed');
  assert.equal(staged.verified, true);
  assert.ok(staged.recoveryKey.length > 30);
  assert.notEqual(staged.journal.ciphertext, JSON.stringify(journal));
  const recoveredDek = await framework.unwrapDek(staged.wrappedDek, Uint8Array.from(Buffer.from(staged.recoveryKey.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - staged.recoveryKey.length % 4) % 4), 'base64')));
  const restored = await framework.decryptWithDek(staged.journal, recoveredDek);
  assert.deepEqual(restored, journal);
});
