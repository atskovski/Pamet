'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const GITHUB_OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
const GITHUB_OIDC_JWKS = 'https://token.actions.githubusercontent.com/.well-known/jwks';
const BUNDLED_JWKS_PATH = path.join(__dirname, '..', 'config', 'github-actions-oidc-jwks.json');
const JOB_AUDIENCE = 'pamet-production-jobs';
const REPOSITORY = 'atskovski/pamet';
const MAIN_REF = 'refs/heads/main';
const CLOCK_SKEW_SECONDS = 60;
const JWKS_CACHE_MS = 10 * 60 * 1000;

let jwksCache = { expiresAt: 0, keys: [], source: 'none' };

const sha = (value) => crypto.createHash('sha256').update(String(value || '')).digest('hex');
function secretEqual(left, right) {
  const a = Buffer.from(sha(left));
  const b = Buffer.from(sha(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function bearer(req) {
  const value = String(req.headers.authorization || '');
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}
function jobToken(req) {
  return String(req.headers['x-pamet-job-token'] || '').trim() || bearer(req);
}
function decodeJson(part) {
  try { return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')); }
  catch { return null; }
}
function audienceIncludes(aud, expected) {
  return Array.isArray(aud) ? aud.includes(expected) : aud === expected;
}
function workflowAllowed(value, allowed, expectedRef = MAIN_REF) {
  if (!value || !allowed.length) return false;
  return allowed.some((workflow) => value === `${REPOSITORY}/.github/workflows/${workflow}@${expectedRef}`);
}
function validJwks(keys) {
  return Array.isArray(keys) && keys.filter((key) => key && key.kty === 'RSA' && key.alg === 'RS256' && key.kid && key.n && key.e);
}
function bundledJwks() {
  try {
    const body = JSON.parse(fs.readFileSync(BUNDLED_JWKS_PATH, 'utf8'));
    return validJwks(body.keys);
  } catch {
    return [];
  }
}
async function fetchJwks(fetcher = fetch, { allowBundledFallback = fetcher === fetch } = {}) {
  if (jwksCache.expiresAt > Date.now() && jwksCache.keys.length) return jwksCache.keys;
  try {
    const response = await fetcher(GITHUB_OIDC_JWKS, {
      headers: { Accept: 'application/json', 'User-Agent': 'Pamet-job-auth' },
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) throw new Error(`GitHub OIDC JWKS returned ${response.status}.`);
    const body = await response.json();
    const keys = validJwks(body && body.keys);
    if (!keys.length) throw new Error('GitHub OIDC JWKS did not contain signing keys.');
    jwksCache = { expiresAt: Date.now() + JWKS_CACHE_MS, keys, source: 'network' };
    return keys;
  } catch (error) {
    if (!allowBundledFallback) throw error;
    const keys = bundledJwks();
    if (!keys.length) throw error;
    jwksCache = { expiresAt: Date.now() + JWKS_CACHE_MS, keys, source: 'bundled' };
    return keys;
  }
}
async function githubOidcJwksReady(fetcher = fetch) {
  try {
    const keys = await fetchJwks(fetcher, { allowBundledFallback: fetcher === fetch });
    return keys.length > 0;
  } catch {
    return false;
  }
}
function githubOidcJwksSource() {
  return jwksCache.source || 'none';
}
async function verifyGitHubActionsToken(token, {
  allowedWorkflows = [],
  allowedEvents = ['schedule', 'workflow_dispatch'],
  fetcher = fetch,
  now = () => Math.floor(Date.now() / 1000),
  expectedRef = MAIN_REF
} = {}) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };
  const header = decodeJson(parts[0]);
  const claims = decodeJson(parts[1]);
  if (!header || !claims || header.alg !== 'RS256' || !header.kid) return { ok: false, reason: 'header' };

  let keys;
  try { keys = await fetchJwks(fetcher, { allowBundledFallback: fetcher === fetch }); }
  catch { return { ok: false, reason: 'jwks' }; }
  const jwk = keys.find((key) => key && key.kid === header.kid && key.kty === 'RSA' && key.alg === 'RS256');
  if (!jwk) return { ok: false, reason: 'kid' };

  try {
    const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    const signature = Buffer.from(parts[2], 'base64url');
    const verified = crypto.verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), publicKey, signature);
    if (!verified) return { ok: false, reason: 'signature' };
  } catch { return { ok: false, reason: 'signature' }; }

  const current = now();
  if (claims.iss !== GITHUB_OIDC_ISSUER) return { ok: false, reason: 'issuer' };
  if (!audienceIncludes(claims.aud, JOB_AUDIENCE)) return { ok: false, reason: 'audience' };
  if (!Number.isFinite(Number(claims.exp)) || Number(claims.exp) < current - CLOCK_SKEW_SECONDS) return { ok: false, reason: 'expired' };
  if (claims.nbf != null && Number(claims.nbf) > current + CLOCK_SKEW_SECONDS) return { ok: false, reason: 'not-yet-valid' };
  if (claims.repository !== REPOSITORY || claims.ref !== expectedRef) return { ok: false, reason: 'repository' };
  if (!allowedEvents.includes(claims.event_name)) return { ok: false, reason: 'event' };
  const workflowRefs = [claims.workflow_ref, claims.job_workflow_ref].filter(Boolean);
  const acceptedWorkflowRef = workflowRefs.find((value) => workflowAllowed(value, allowedWorkflows, expectedRef));
  if (!acceptedWorkflowRef) return { ok: false, reason: 'workflow' };

  return { ok: true, source: 'github-oidc', claims: { event_name: claims.event_name, workflow_ref: acceptedWorkflowRef, run_id: claims.run_id || null } };
}

function createJobAuthorizer({ allowedWorkflows, allowedEvents } = {}) {
  return async function authorizeJob(req, res, next) {
    const supplied = jobToken(req);
    if (process.env.CRON_SECRET && supplied && secretEqual(supplied, process.env.CRON_SECRET)) {
      req.jobAuth = { source: 'cron-secret' };
      return next();
    }
    if (supplied && supplied.split('.').length === 3) {
      const result = await verifyGitHubActionsToken(supplied, { allowedWorkflows, allowedEvents });
      if (result.ok) {
        req.jobAuth = result;
        return next();
      }
      console.warn('job_auth_rejected', { path: req.path, reason: result.reason });
    }
    return res.status(401).json({ error: 'Unauthorized.' });
  };
}

module.exports = {
  JOB_AUDIENCE,
  GITHUB_OIDC_ISSUER,
  GITHUB_OIDC_JWKS,
  BUNDLED_JWKS_PATH,
  verifyGitHubActionsToken,
  githubOidcJwksReady,
  githubOidcJwksSource,
  createJobAuthorizer,
  jobToken,
  bearer,
  secretEqual,
  bundledJwks
};
