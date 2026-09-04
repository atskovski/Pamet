'use strict';

const crypto = require('crypto');
const express = require('express');
const mysql = require('mysql2/promise');

const SESSION_COOKIE = 'pamet_session';
const SESSION_TTL_DAYS = 30;
const STATE_TTL_MS = 10 * 60 * 1000;
const JWKS_TTL_MS = 60 * 60 * 1000;
const jwksCache = new Map();
let pool;

const sha = (value) => crypto.createHash('sha256').update(String(value || '')).digest('hex');
const randomToken = () => crypto.randomBytes(32).toString('hex');
const clean = (value, max = 254) => String(value || '').trim().slice(0, max);
const emailOk = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const b64url = (value) => Buffer.from(value).toString('base64url');
const fromB64url = (value) => Buffer.from(String(value || ''), 'base64url');

function databaseOptions() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const ssl = String(process.env.DB_SSL || '').toLowerCase() === 'true'
    ? { rejectUnauthorized: String(process.env.DB_SSL_REJECT_UNAUTHORIZED || 'true').toLowerCase() !== 'false' }
    : undefined;
  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    database: process.env.DB_NAME,
    user: process.env.DB_USER || process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    ssl,
    waitForConnections: true,
    connectionLimit: Math.max(1, Number(process.env.DB_CONNECTION_LIMIT || 5)),
    connectTimeout: 10000,
    enableKeepAlive: true
  };
}

async function db() {
  if (pool) return pool;
  if (!process.env.DATABASE_URL && !process.env.DB_HOST) throw Object.assign(new Error('Database is not configured.'), { status: 503 });
  pool = mysql.createPool(databaseOptions());
  return pool;
}

function providerConfig() {
  const stateSecret = process.env.OAUTH_STATE_SECRET || process.env.IDENTITY_ENCRYPTION_KEY || '';
  return {
    stateSecret,
    google: {
      enabled: !!(stateSecret && process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET),
      clientId: process.env.GOOGLE_OAUTH_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || ''
    },
    apple: {
      enabled: !!(stateSecret && process.env.APPLE_OAUTH_CLIENT_ID && process.env.APPLE_OAUTH_TEAM_ID && process.env.APPLE_OAUTH_KEY_ID && process.env.APPLE_OAUTH_PRIVATE_KEY),
      clientId: process.env.APPLE_OAUTH_CLIENT_ID || '',
      teamId: process.env.APPLE_OAUTH_TEAM_ID || '',
      keyId: process.env.APPLE_OAUTH_KEY_ID || '',
      privateKey: String(process.env.APPLE_OAUTH_PRIVATE_KEY || '').replace(/\\n/g, '\n')
    }
  };
}

function oauthSecurityHeaders(req, res, next) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if ((process.env.NODE_ENV || 'development') === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
}

function signedState(provider, secret) {
  const payload = b64url(JSON.stringify({ provider, nonce: b64url(crypto.randomBytes(24)), issuedAt: Date.now() }));
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function readState(state, expectedProvider, secret) {
  const [payload, signature] = String(state || '').split('.');
  if (!payload || !signature || !secret) throw Object.assign(new Error('Invalid OAuth state.'), { status: 400 });
  const expected = crypto.createHmac('sha256', secret).update(payload).digest();
  const received = fromB64url(signature);
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) throw Object.assign(new Error('Invalid OAuth state.'), { status: 400 });
  let parsed;
  try { parsed = JSON.parse(fromB64url(payload).toString('utf8')); } catch { throw Object.assign(new Error('Invalid OAuth state.'), { status: 400 }); }
  if (parsed.provider !== expectedProvider || !parsed.nonce || !Number.isFinite(parsed.issuedAt) || Date.now() - parsed.issuedAt > STATE_TTL_MS || parsed.issuedAt > Date.now() + 30000) {
    throw Object.assign(new Error('Expired OAuth state.'), { status: 400 });
  }
  return parsed;
}

function splitJwt(jwt) {
  const parts = String(jwt || '').split('.');
  if (parts.length !== 3) throw Object.assign(new Error('Invalid identity token.'), { status: 401 });
  let header; let claims;
  try {
    header = JSON.parse(fromB64url(parts[0]).toString('utf8'));
    claims = JSON.parse(fromB64url(parts[1]).toString('utf8'));
  } catch { throw Object.assign(new Error('Invalid identity token.'), { status: 401 }); }
  return { parts, header, claims };
}

async function jwks(url) {
  const cached = jwksCache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.keys;
  const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(7000) });
  if (!response.ok) throw Object.assign(new Error('Identity provider keys are unavailable.'), { status: 502 });
  const body = await response.json();
  if (!Array.isArray(body.keys)) throw Object.assign(new Error('Identity provider keys are invalid.'), { status: 502 });
  jwksCache.set(url, { keys: body.keys, expiresAt: Date.now() + JWKS_TTL_MS });
  return body.keys;
}

async function verifyIdToken(jwt, { issuer, audience, nonce, jwksUrl }) {
  const { parts, header, claims } = splitJwt(jwt);
  if (header.alg !== 'RS256' || !header.kid) throw Object.assign(new Error('Unsupported identity token.'), { status: 401 });
  const keys = await jwks(jwksUrl);
  const jwk = keys.find((key) => key.kid === header.kid && key.kty === 'RSA');
  if (!jwk) throw Object.assign(new Error('Identity provider key was not found.'), { status: 401 });
  const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const valid = crypto.verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), key, fromB64url(parts[2]));
  if (!valid) throw Object.assign(new Error('Identity token signature is invalid.'), { status: 401 });
  const now = Math.floor(Date.now() / 1000);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== issuer || !audiences.includes(audience) || !claims.sub || Number(claims.exp || 0) <= now || Number(claims.iat || now + 1) > now + 60) {
    throw Object.assign(new Error('Identity token claims are invalid.'), { status: 401 });
  }
  if (nonce && claims.nonce !== nonce) throw Object.assign(new Error('Identity token nonce is invalid.'), { status: 401 });
  return claims;
}

function appleClientSecret(config) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: config.keyId, typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ iss: config.teamId, iat: now, exp: now + 5 * 60, aud: 'https://appleid.apple.com', sub: config.clientId }));
  const signingInput = `${header}.${payload}`;
  const signature = crypto.sign('sha256', Buffer.from(signingInput), { key: config.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `${signingInput}.${signature}`;
}

async function tokenExchange(url, values) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(values),
    signal: AbortSignal.timeout(10000)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.id_token) throw Object.assign(new Error('Identity provider token exchange failed.'), { status: 401 });
  return body;
}

async function requireExternalIdentitySchema(connection) {
  try {
    await connection.query('SELECT 1 FROM pamet_external_identities LIMIT 0');
  } catch (error) {
    const migrate = process.env.AUTO_MIGRATE === 'true' || (process.env.NODE_ENV || 'development') !== 'production';
    if (!migrate) throw Object.assign(new Error('OAuth database migration has not been applied.'), { status: 503 });
    await connection.query(`CREATE TABLE IF NOT EXISTS pamet_external_identities (
      provider VARCHAR(16) NOT NULL,
      subject VARCHAR(255) NOT NULL,
      user_id BIGINT UNSIGNED NOT NULL,
      email VARCHAR(254) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY(provider,subject),
      UNIQUE KEY uniq_user_provider(user_id,provider),
      CONSTRAINT fk_pamet_external_identity_user FOREIGN KEY(user_id) REFERENCES pamet_users(id) ON DELETE CASCADE,
      INDEX idx_external_identity_email(email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  }
}

function providerEmailIsAuthoritative(provider, claims) {
  const verified = claims.email_verified === true || claims.email_verified === 'true';
  if (!verified) return false;
  if (provider === 'apple') return true;
  const email = String(claims.email || '').toLowerCase();
  return email.endsWith('@gmail.com') || !!claims.hd;
}

async function resolveUser(provider, claims, profile = {}) {
  const email = clean(claims.email, 254).toLowerCase();
  if (!emailOk(email) || !(claims.email_verified === true || claims.email_verified === 'true')) throw Object.assign(new Error('The provider did not return a verified email address.'), { status: 401 });
  const connection = await db();
  await requireExternalIdentitySchema(connection);

  const [linked] = await connection.execute(`SELECT u.* FROM pamet_external_identities i JOIN pamet_users u ON u.id=i.user_id WHERE i.provider=? AND i.subject=? LIMIT 1`, [provider, String(claims.sub)]);
  if (linked.length) {
    await connection.execute('UPDATE pamet_external_identities SET email=? WHERE provider=? AND subject=?', [email, provider, String(claims.sub)]);
    return { connection, user: linked[0], created: false, linked: true };
  }

  const [existing] = await connection.execute('SELECT * FROM pamet_users WHERE email=? LIMIT 1', [email]);
  if (existing.length) {
    if (!providerEmailIsAuthoritative(provider, claims)) throw Object.assign(new Error('This email already has a Pamet account. Log in with your password before linking this provider.'), { status: 409, code: 'account_link_required' });
    await connection.execute('INSERT INTO pamet_external_identities(provider,subject,user_id,email) VALUES(?,?,?,?)', [provider, String(claims.sub), existing[0].id, email]);
    return { connection, user: existing[0], created: false, linked: true };
  }

  const first = clean(profile.firstName || claims.given_name || '', 100) || 'Pamet';
  const last = clean(profile.lastName || claims.family_name || '', 100);
  const [created] = await connection.execute(
    'INSERT INTO pamet_users(local_user_id,device_key_hash,password_hash,password_salt,email,first_name,last_name,timezone) VALUES(?,?,?,?,?,?,?,?)',
    [crypto.randomUUID(), sha(randomToken()), null, null, email, first, last, 'UTC']
  );
  await connection.execute('INSERT INTO pamet_external_identities(provider,subject,user_id,email) VALUES(?,?,?,?)', [provider, String(claims.sub), created.insertId, email]);
  const [rows] = await connection.execute('SELECT * FROM pamet_users WHERE id=? LIMIT 1', [created.insertId]);
  return { connection, user: rows[0], created: true, linked: true };
}

async function createSession(connection, userId, res) {
  const raw = randomToken();
  await connection.execute('INSERT INTO pamet_sessions(id,user_id,token_hash,expires_at) VALUES(?,?,?,DATE_ADD(NOW(),INTERVAL ? DAY))', [crypto.randomUUID(), userId, sha(raw), SESSION_TTL_DAYS]);
  const secure = (process.env.NODE_ENV || 'development') === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${raw}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_DAYS * 86400}${secure}`);
}

async function audit(connection, userId, type, data) {
  try { await connection.execute('INSERT INTO pamet_audit_log(user_id,event_type,event_json) VALUES(?,?,?)', [userId, type, JSON.stringify(data || {})]); } catch {}
}

function safeErrorRedirect(res, provider, error) {
  const code = error && error.code === 'account_link_required' ? 'account_link_required' : 'provider_error';
  res.redirect(303, `/?oauth_error=${encodeURIComponent(code)}&provider=${encodeURIComponent(provider)}`);
}

function parseAppleUser(value) {
  if (!value) return {};
  try {
    const user = typeof value === 'string' ? JSON.parse(value) : value;
    return { firstName: clean(user?.name?.firstName, 100), lastName: clean(user?.name?.lastName, 100) };
  } catch { return {}; }
}

function createOAuthRouter({ appBaseUrl } = {}) {
  const router = express.Router();
  const APP = String(appBaseUrl || process.env.APP_BASE_URL || '').replace(/\/$/, '');
  const appleForm = express.urlencoded({ extended: false, limit: '32kb' });

  router.use('/api/auth/oauth', oauthSecurityHeaders);

  router.get('/api/auth/oauth/providers', (req, res) => {
    const config = providerConfig();
    res.json({ google: config.google.enabled, apple: config.apple.enabled });
  });

  router.get('/api/auth/oauth/:provider/start', (req, res) => {
    const provider = String(req.params.provider || '').toLowerCase();
    const config = providerConfig();
    if (!APP || !['google', 'apple'].includes(provider) || !config[provider]?.enabled) return res.status(503).json({ error: 'This sign-in provider is not configured.' });
    const state = signedState(provider, config.stateSecret);
    const stateData = readState(state, provider, config.stateSecret);
    const callback = `${APP}/api/auth/oauth/${provider}/callback`;
    let url;
    if (provider === 'google') {
      url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.search = new URLSearchParams({ client_id: config.google.clientId, redirect_uri: callback, response_type: 'code', scope: 'openid email profile', state, nonce: stateData.nonce, prompt: 'select_account' }).toString();
    } else {
      url = new URL('https://appleid.apple.com/auth/authorize');
      url.search = new URLSearchParams({ client_id: config.apple.clientId, redirect_uri: callback, response_type: 'code id_token', response_mode: 'form_post', scope: 'name email', state, nonce: stateData.nonce }).toString();
    }
    res.redirect(302, url.toString());
  });

  router.get('/api/auth/oauth/google/callback', async (req, res) => {
    const config = providerConfig();
    try {
      if (!config.google.enabled || req.query.error || !req.query.code) throw Object.assign(new Error('Google sign-in was not completed.'), { status: 401 });
      const state = readState(req.query.state, 'google', config.stateSecret);
      const callback = `${APP}/api/auth/oauth/google/callback`;
      const tokens = await tokenExchange('https://oauth2.googleapis.com/token', { code: String(req.query.code), client_id: config.google.clientId, client_secret: config.google.clientSecret, redirect_uri: callback, grant_type: 'authorization_code' });
      const claims = await verifyIdToken(tokens.id_token, { issuer: 'https://accounts.google.com', audience: config.google.clientId, nonce: state.nonce, jwksUrl: 'https://www.googleapis.com/oauth2/v3/certs' });
      const resolved = await resolveUser('google', claims);
      await createSession(resolved.connection, resolved.user.id, res);
      await audit(resolved.connection, resolved.user.id, resolved.created ? 'identity.account_registered' : 'identity.login', { method: 'google' });
      res.redirect(303, '/?oauth=google');
    } catch (error) { safeErrorRedirect(res, 'google', error); }
  });

  router.post('/api/auth/oauth/apple/callback', appleForm, async (req, res) => {
    const config = providerConfig();
    try {
      if (!config.apple.enabled || req.body.error || !req.body.code) throw Object.assign(new Error('Apple sign-in was not completed.'), { status: 401 });
      const state = readState(req.body.state, 'apple', config.stateSecret);
      const callback = `${APP}/api/auth/oauth/apple/callback`;
      const tokens = await tokenExchange('https://appleid.apple.com/auth/token', { code: String(req.body.code), client_id: config.apple.clientId, client_secret: appleClientSecret(config.apple), redirect_uri: callback, grant_type: 'authorization_code' });
      const claims = await verifyIdToken(tokens.id_token, { issuer: 'https://appleid.apple.com', audience: config.apple.clientId, nonce: state.nonce, jwksUrl: 'https://appleid.apple.com/auth/keys' });
      const resolved = await resolveUser('apple', claims, parseAppleUser(req.body.user));
      await createSession(resolved.connection, resolved.user.id, res);
      await audit(resolved.connection, resolved.user.id, resolved.created ? 'identity.account_registered' : 'identity.login', { method: 'apple' });
      res.redirect(303, '/?oauth=apple');
    } catch (error) { safeErrorRedirect(res, 'apple', error); }
  });

  return router;
}

module.exports = { createOAuthRouter, signedState, readState, verifyIdToken, providerEmailIsAuthoritative };
