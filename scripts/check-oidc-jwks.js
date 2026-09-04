'use strict';

const fs = require('fs');

const body = JSON.parse(fs.readFileSync('config/github-actions-oidc-jwks.json', 'utf8'));
if (body.source !== 'https://token.actions.githubusercontent.com/.well-known/jwks') throw new Error('Bundled OIDC JWKS source is unexpected.');
if (!Array.isArray(body.keys) || body.keys.length < 1) throw new Error('Bundled OIDC JWKS contains no keys.');
const refreshed = Date.parse(body.refreshedAt || '');
if (!Number.isFinite(refreshed)) throw new Error('Bundled OIDC JWKS refreshedAt is invalid.');
const ageDays = (Date.now() - refreshed) / 86400000;
if (ageDays > 14) throw new Error(`Bundled OIDC JWKS is ${ageDays.toFixed(1)} days old. Refresh before release.`);
for (const key of body.keys) {
  if (key.kty !== 'RSA' || key.alg !== 'RS256' || !key.kid || !key.n || !key.e) throw new Error('Bundled OIDC JWKS contains an invalid signing key.');
  const fields = Object.keys(key).sort();
  if (fields.some((field) => ['d','p','q','dp','dq','qi','k'].includes(field))) throw new Error('Bundled OIDC JWKS must contain public material only.');
}
console.log(`Bundled GitHub OIDC public-key gate passed with ${body.keys.length} key(s), age ${Math.max(0, ageDays).toFixed(1)} days.`);
