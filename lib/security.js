'use strict';

const crypto = require('crypto');

const base32Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Encode(buffer) {
  let bits = ''; for (const byte of buffer) bits += byte.toString(2).padStart(8, '0');
  let out = ''; for (let i = 0; i < bits.length; i += 5) out += base32Alphabet[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  return out;
}
function base32Decode(value) {
  let bits = ''; for (const char of String(value).replace(/=+$/g, '').toUpperCase()) { const index = base32Alphabet.indexOf(char); if (index < 0) throw new Error('Invalid base32.'); bits += index.toString(2).padStart(5, '0'); }
  const bytes = []; for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(bytes);
}
function totpSecret() { return base32Encode(crypto.randomBytes(20)); }
function totp(secret, time = Date.now(), step = 30) {
  const counter = Math.floor(time / 1000 / step); const input = Buffer.alloc(8); input.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac('sha1', base32Decode(secret)).update(input).digest(); const offset = digest[digest.length - 1] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}
function verifyTotp(secret, code) {
  const candidate = String(code || '').replace(/\s/g, ''); if (!/^\d{6}$/.test(candidate)) return false;
  return [-1, 0, 1].some((window) => crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(totp(secret, Date.now() + window * 30000))));
}
function encryptionKey() { const raw = process.env.IDENTITY_ENCRYPTION_KEY || ''; if (!/^[a-f0-9]{64}$/i.test(raw)) throw new Error('IDENTITY_ENCRYPTION_KEY must be a 32-byte hex key.'); return Buffer.from(raw, 'hex'); }
function seal(value) { const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv); const body = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]); return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64'); }
function open(value) { const data = Buffer.from(String(value), 'base64'); const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), data.subarray(0, 12)); decipher.setAuthTag(data.subarray(12, 28)); return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8'); }

module.exports = { totpSecret, totp, verifyTotp, seal, open };
