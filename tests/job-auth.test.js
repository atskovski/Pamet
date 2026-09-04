'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { verifyGitHubActionsToken, JOB_AUDIENCE, GITHUB_OIDC_ISSUER } = require('../lib/job-auth');

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' });
jwk.kid = 'pamet-test-key';
jwk.use = 'sig';
jwk.alg = 'RS256';

const fetcher = async () => ({ ok: true, json: async () => ({ keys: [jwk] }) });
const now = 1_800_000_000;

function token(overrides = {}) {
  const header = { alg: 'RS256', typ: 'JWT', kid: jwk.kid };
  const claims = {
    iss: GITHUB_OIDC_ISSUER,
    aud: JOB_AUDIENCE,
    repository: 'atskovski/pamet',
    ref: 'refs/heads/main',
    event_name: 'schedule',
    workflow_ref: 'atskovski/pamet/.github/workflows/stripe-reconcile.yml@refs/heads/main',
    nbf: now - 10,
    exp: now + 300,
    ...overrides
  };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedClaims = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signingInput = `${encodedHeader}.${encodedClaims}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput), privateKey).toString('base64url');
  return `${signingInput}.${signature}`;
}

const options = { allowedWorkflows: ['stripe-reconcile.yml'], fetcher, now: () => now };

test('accepts a signed GitHub Actions token for the expected main workflow', async () => {
  const result = await verifyGitHubActionsToken(token(), options);
  assert.equal(result.ok, true);
  assert.equal(result.source, 'github-oidc');
});

test('rejects tokens for another repository or branch', async () => {
  assert.equal((await verifyGitHubActionsToken(token({ repository: 'other/repo' }), options)).ok, false);
  assert.equal((await verifyGitHubActionsToken(token({ ref: 'refs/heads/feature' }), options)).ok, false);
});

test('rejects tokens from an unapproved workflow or event', async () => {
  assert.equal((await verifyGitHubActionsToken(token({ workflow_ref: 'atskovski/pamet/.github/workflows/other.yml@refs/heads/main' }), options)).ok, false);
  assert.equal((await verifyGitHubActionsToken(token({ event_name: 'pull_request' }), options)).ok, false);
});

test('rejects expired or incorrectly-audienced tokens', async () => {
  assert.equal((await verifyGitHubActionsToken(token({ exp: now - 120 }), options)).ok, false);
  assert.equal((await verifyGitHubActionsToken(token({ aud: 'wrong-audience' }), options)).ok, false);
});
