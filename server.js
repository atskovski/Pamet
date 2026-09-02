'use strict';

const path = require('path');
const crypto = require('crypto');
const { promisify } = require('util');
const express = require('express');
const mysql = require('mysql2/promise');
const Stripe = require('stripe');
const { distributedRateLimit, rateLimitReady, configureDistributedFallback } = require('./lib/rate-limit');
const { totpSecret, verifyTotp, seal, open } = require('./lib/security');
const push = require('./lib/push');

const VERSION = '1.2.0';
const PORT = Number(process.env.PORT || 8080);
const NODE_ENV = process.env.NODE_ENV || 'development';
const APP = (process.env.APP_BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const app = express();
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const prices = {
  pro: { monthly: process.env.STRIPE_PRICE_PRO_MONTHLY || '', annual: process.env.STRIPE_PRICE_PRO_ANNUAL || '' },
  ultra: { monthly: process.env.STRIPE_PRICE_ULTRA_MONTHLY || '', annual: process.env.STRIPE_PRICE_ULTRA_ANNUAL || '' }
};
const expectedPrices = {
  pro: { monthly: { amount: 699, interval: 'month' }, annual: { amount: 5999, interval: 'year' } },
  ultra: { monthly: { amount: 1299, interval: 'month' }, annual: { amount: 9999, interval: 'year' } }
};
const priceValidationCache = new Map();
let pool;
let poolInitialization;
const metrics = new Map();
const scryptAsync = promisify(crypto.scrypt);
const SESSION_COOKIE = 'pamet_session';
const SESSION_TTL_DAYS = 30;

app.disable('x-powered-by');
app.set('trust proxy', 1);

const sha = (value) => crypto.createHash('sha256').update(Buffer.isBuffer(value) ? value : String(value)).digest('hex');
const token = () => crypto.randomBytes(32).toString('hex');
const clean = (value, max) => String(value || '').trim().slice(0, max);
const emailOk = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const plainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const parse = (value, fallback = {}) => { if (plainObject(value) || Array.isArray(value)) return value; try { return JSON.parse(value); } catch { return fallback; } };
const html = (value) => String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const readBearer = (req) => { const value = String(req.headers.authorization || ''); return value.startsWith('Bearer ') ? value.slice(7).trim() : ''; };
const readCookie = (req, name) => String(req.headers.cookie || '').split(';').map((item) => item.trim().split('=')).find(([key]) => key === name)?.[1] || '';
const installationKeyOk = (value) => /^[a-f0-9]{64}$/i.test(value);
const localUserIdOk = (value) => /^[a-z0-9][a-z0-9-]{15,127}$/i.test(value);
const attemptIdOk = (value) => /^[a-z0-9][a-z0-9-]{15,63}$/i.test(value);
const uuidOk = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const timezoneOk = (value) => { try { new Intl.DateTimeFormat('en-US', { timeZone: value }).format(); return true; } catch { return false; } };
const secretEqual = (left, right) => { const a = Buffer.from(sha(left)); const b = Buffer.from(sha(right)); return a.length === b.length && crypto.timingSafeEqual(a, b); };
const serializedObject = (value, maxBytes = 200 * 1024) => { if (!plainObject(value)) return null; const json = JSON.stringify(value); return Buffer.byteLength(json, 'utf8') <= maxBytes ? json : null; };
const metricRoute = (req) => req.route && req.route.path ? String(req.route.path) : (req.path.startsWith('/api/') ? req.path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/ig, ':id').replace(/\/api\/share\/[^/]+/, '/api/share/:token') : 'static');
function recordMetric(method, route, status, durationMs) {
  const key = `${method}|${route}|${status}`;
  const value = metrics.get(key) || { count: 0, durationMs: 0 };
  value.count += 1; value.durationMs += durationMs; metrics.set(key, value);
}
function operationalEvent(event) {
  const line = JSON.stringify({ service: 'pamet', version: VERSION, at: new Date().toISOString(), ...event });
  console.log(line);
  if (process.env.LOG_DRAIN_URL) fetch(process.env.LOG_DRAIN_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(process.env.LOG_DRAIN_TOKEN ? { Authorization: `Bearer ${process.env.LOG_DRAIN_TOKEN}` } : {}) },
    body: line, signal: AbortSignal.timeout(3000)
  }).catch(() => {});
}
function operationalAlert(event) {
  operationalEvent({ event: 'alert.raised', ...event });
  if (!process.env.ALERT_WEBHOOK_URL) return;
  fetch(process.env.ALERT_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(process.env.ALERT_WEBHOOK_TOKEN ? { Authorization: `Bearer ${process.env.ALERT_WEBHOOK_TOKEN}` } : {}) }, body: JSON.stringify({ service: 'pamet', version: VERSION, at: new Date().toISOString(), ...event }), signal: AbortSignal.timeout(5000) }).catch(() => {});
}

function databaseOptions() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const ssl = String(process.env.DB_SSL || '').toLowerCase() === 'true'
    ? { rejectUnauthorized: String(process.env.DB_SSL_REJECT_UNAUTHORIZED || 'true').toLowerCase() !== 'false' }
    : undefined;
  return { host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), database: process.env.DB_NAME, user: process.env.DB_USER || process.env.DB_USERNAME, password: process.env.DB_PASSWORD, ssl, waitForConnections: true, connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 5), connectTimeout: 10000, enableKeepAlive: true };
}

async function db() {
  if (pool) return pool;
  if (poolInitialization) return poolInitialization;
  if (!process.env.DATABASE_URL && !process.env.DB_HOST) throw new Error('Database is not configured.');
  poolInitialization = (async () => {
    const candidate = mysql.createPool(databaseOptions());
    const migrate = process.env.AUTO_MIGRATE === 'true' || NODE_ENV !== 'production';
    try {
      let lastError;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try { if (migrate) await schema(candidate); else await candidate.query('SELECT 1'); pool = candidate; return pool; }
        catch (error) { lastError = error; if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 250)); }
      }
      throw lastError;
    } catch (error) {
      await candidate.end().catch(() => {});
      throw error;
    } finally {
      poolInitialization = null;
    }
  })();
  return poolInitialization;
}

async function addColumnIfMissing(connection, table, column, definition) {
  const [rows] = await connection.execute(
    `SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=? LIMIT 1`,
    [table, column]
  );
  if (!rows.length) await connection.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
}

async function schema(connection) {
  await connection.query(`CREATE TABLE IF NOT EXISTS pamet_users (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,local_user_id VARCHAR(128) NOT NULL UNIQUE,device_key_hash CHAR(64) NOT NULL UNIQUE,email VARCHAR(254) NOT NULL UNIQUE,first_name VARCHAR(100) NOT NULL DEFAULT '',last_name VARCHAR(100) NOT NULL DEFAULT '',timezone VARCHAR(100) NOT NULL DEFAULT 'UTC',plan VARCHAR(16) NOT NULL DEFAULT 'free',subscription_status VARCHAR(32) NOT NULL DEFAULT 'none',stripe_customer_id VARCHAR(128) NULL UNIQUE,stripe_subscription_id VARCHAR(128) NULL UNIQUE,weekly_digest_enabled BOOLEAN NOT NULL DEFAULT FALSE,latest_digest_json JSON NULL,confirmation_email_sent_at DATETIME NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,INDEX idx_digest(weekly_digest_enabled)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await addColumnIfMissing(connection, 'pamet_users', 'password_hash', 'CHAR(128) NULL AFTER `device_key_hash`');
  await addColumnIfMissing(connection, 'pamet_users', 'password_salt', 'CHAR(32) NULL AFTER `password_hash`');
  await connection.query(`CREATE TABLE IF NOT EXISTS pamet_sessions (id CHAR(36) PRIMARY KEY,user_id BIGINT UNSIGNED NOT NULL,token_hash CHAR(64) NOT NULL UNIQUE,expires_at DATETIME NOT NULL,last_used_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,revoked_at DATETIME NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES pamet_users(id) ON DELETE CASCADE,INDEX idx_session(token_hash,expires_at),INDEX idx_session_user(user_id,revoked_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await connection.query(`CREATE TABLE IF NOT EXISTS pamet_sharing_invites (id CHAR(36) PRIMARY KEY,user_id BIGINT UNSIGNED NOT NULL,kind VARCHAR(20) NOT NULL,name VARCHAR(100) NOT NULL,email VARCHAR(254) NOT NULL,organization VARCHAR(120) NOT NULL DEFAULT '',permission_level VARCHAR(24) NOT NULL DEFAULT 'view',profile_name VARCHAR(80) NOT NULL DEFAULT '',status VARCHAR(20) NOT NULL DEFAULT 'active',share_token_hash CHAR(64) NOT NULL UNIQUE,snapshot_json JSON NOT NULL,expires_at DATETIME NOT NULL,revoked_at DATETIME NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES pamet_users(id) ON DELETE CASCADE,INDEX idx_share(user_id,kind,status)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await addColumnIfMissing(connection, 'pamet_sharing_invites', 'permission_level', "VARCHAR(24) NOT NULL DEFAULT 'view' AFTER `organization`");
  await addColumnIfMissing(connection, 'pamet_sharing_invites', 'profile_name', "VARCHAR(80) NOT NULL DEFAULT '' AFTER `permission_level`");
  await connection.query(`CREATE TABLE IF NOT EXISTS pamet_audit_log (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,user_id BIGINT UNSIGNED NULL,event_type VARCHAR(80) NOT NULL,event_json JSON NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,INDEX idx_audit(user_id,created_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await connection.query(`CREATE TABLE IF NOT EXISTS pamet_feedback (id CHAR(36) PRIMARY KEY,category VARCHAR(24) NOT NULL,rating TINYINT UNSIGNED NULL,message VARCHAR(1000) NOT NULL,app_version VARCHAR(16) NOT NULL,screen VARCHAR(40) NOT NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,INDEX idx_feedback_created(created_at),INDEX idx_feedback_category(category)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await connection.query(`CREATE TABLE IF NOT EXISTS pamet_stripe_events (event_id VARCHAR(255) PRIMARY KEY,event_type VARCHAR(100) NOT NULL,processed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,INDEX idx_stripe_event_time(processed_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await connection.query(`CREATE TABLE IF NOT EXISTS pamet_devices (id CHAR(36) PRIMARY KEY,user_id BIGINT UNSIGNED NOT NULL,credential_hash CHAR(64) NOT NULL UNIQUE,label VARCHAR(80) NOT NULL DEFAULT 'Pamet device',status VARCHAR(16) NOT NULL DEFAULT 'active',last_used_at DATETIME NULL,revoked_at DATETIME NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES pamet_users(id) ON DELETE CASCADE,INDEX idx_device_user(user_id,status)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await connection.query(`CREATE TABLE IF NOT EXISTS pamet_recovery_tokens (id CHAR(36) PRIMARY KEY,user_id BIGINT UNSIGNED NOT NULL,token_hash CHAR(64) NOT NULL UNIQUE,expires_at DATETIME NOT NULL,used_at DATETIME NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES pamet_users(id) ON DELETE CASCADE,INDEX idx_recovery(token_hash,expires_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await connection.query(`CREATE TABLE IF NOT EXISTS pamet_mfa (user_id BIGINT UNSIGNED PRIMARY KEY,secret_encrypted TEXT NOT NULL,enabled BOOLEAN NOT NULL DEFAULT FALSE,verified_at DATETIME NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES pamet_users(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await connection.query(`CREATE TABLE IF NOT EXISTS pamet_push_subscriptions (id CHAR(36) PRIMARY KEY,user_id BIGINT UNSIGNED NOT NULL,device_id CHAR(36) NULL,endpoint_hash CHAR(64) NOT NULL UNIQUE,subscription_json JSON NOT NULL,timezone VARCHAR(100) NOT NULL DEFAULT 'UTC',reminder_hour TINYINT UNSIGNED NOT NULL DEFAULT 20,enabled BOOLEAN NOT NULL DEFAULT TRUE,last_sent_local_date DATE NULL,last_success_at DATETIME NULL,failure_count INT UNSIGNED NOT NULL DEFAULT 0,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES pamet_users(id) ON DELETE CASCADE,FOREIGN KEY(device_id) REFERENCES pamet_devices(id) ON DELETE SET NULL,INDEX idx_push_due(enabled,reminder_hour)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await connection.query(`CREATE TABLE IF NOT EXISTS pamet_sync_blobs (user_id BIGINT UNSIGNED NOT NULL,profile_id VARCHAR(128) NOT NULL,ciphertext LONGBLOB NOT NULL,nonce VARBINARY(32) NOT NULL,key_version INT UNSIGNED NOT NULL,revision BIGINT UNSIGNED NOT NULL DEFAULT 1,content_hash CHAR(64) NOT NULL,updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,PRIMARY KEY(user_id,profile_id),FOREIGN KEY(user_id) REFERENCES pamet_users(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await connection.query(`CREATE TABLE IF NOT EXISTS pamet_appointments (id CHAR(36) PRIMARY KEY,user_id BIGINT UNSIGNED NOT NULL,profile_id VARCHAR(128) NOT NULL,clinician VARCHAR(120) NOT NULL DEFAULT '',starts_at DATETIME NOT NULL,reason VARCHAR(500) NOT NULL DEFAULT '',concerns_json JSON NOT NULL,questions_json JSON NOT NULL,reminder_minutes INT UNSIGNED NOT NULL DEFAULT 1440,status VARCHAR(20) NOT NULL DEFAULT 'scheduled',created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES pamet_users(id) ON DELETE CASCADE,INDEX idx_appointment(user_id,starts_at,status)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await connection.query(`CREATE TABLE IF NOT EXISTS pamet_rate_limits (bucket_key VARCHAR(255) PRIMARY KEY,count INT UNSIGNED NOT NULL,expires_at DATETIME(3) NOT NULL,INDEX idx_rate_limit_expiry(expires_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}

configureDistributedFallback({
  async hit(key, windowMs) { const connection = await db(); const expires = new Date(Date.now() + windowMs); await connection.execute(`INSERT INTO pamet_rate_limits(bucket_key,count,expires_at) VALUES(?,1,?) ON DUPLICATE KEY UPDATE count=IF(expires_at<=NOW(3),1,count+1),expires_at=IF(expires_at<=NOW(3),VALUES(expires_at),expires_at)`, [key, expires]); const [rows] = await connection.execute('SELECT count,expires_at FROM pamet_rate_limits WHERE bucket_key=?', [key]); if (rows[0].count % 100 === 0) connection.execute('DELETE FROM pamet_rate_limits WHERE expires_at<NOW(3) LIMIT 500').catch(() => {}); return { count: rows[0].count, resetAt: +new Date(rows[0].expires_at) }; },
  async ready() { const connection = await db(); await connection.query('SELECT 1 FROM pamet_rate_limits LIMIT 0'); }
});

async function passwordHash(password, salt) {
  const value = await scryptAsync(String(password), Buffer.from(salt, 'hex'), 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return Buffer.from(value).toString('hex');
}
async function passwordMatches(password, salt, expected) {
  if (!salt || !expected) return false;
  const actual = Buffer.from(await passwordHash(password, salt)); const wanted = Buffer.from(String(expected));
  return actual.length === wanted.length && crypto.timingSafeEqual(actual, wanted);
}
async function createSession(connection, userId, res) {
  const raw = token();
  await connection.execute('INSERT INTO pamet_sessions(id,user_id,token_hash,expires_at) VALUES(?,?,?,DATE_ADD(NOW(),INTERVAL ? DAY))', [crypto.randomUUID(), userId, sha(raw), SESSION_TTL_DAYS]);
  const secure = NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${raw}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_DAYS * 86400}${secure}`);
}
function clearSessionCookie(res) { const secure = NODE_ENV === 'production' ? '; Secure' : ''; res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`); }

async function audit(userId, type, data = {}) {
  try { const connection = await db(); await connection.execute('INSERT INTO pamet_audit_log(user_id,event_type,event_json) VALUES(?,?,?)', [userId || null, type, JSON.stringify(data)]); }
  catch (error) { console.warn('audit_write_failed', { type, message: error.message }); }
}

async function mail(to, subject, body) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return false;
  const shell = `<!doctype html><html><body style="margin:0;background:#F4F5F2;font-family:Arial,sans-serif;color:#263638"><div style="max-width:600px;margin:auto;padding:32px 18px"><div style="background:#fff;border:1px solid #DDE3DF;border-radius:16px;padding:28px"><div style="font-size:24px;font-weight:700;color:#0F3D3E;margin-bottom:20px">Pamet</div>${body}</div><p style="font-size:12px;color:#5B6B73">Your health history, finally useful.</p></div></body></html>`;
  const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, html: shell }), signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Email delivery failed.');
  return true;
}

function publicUser(user) {
  return { id: String(user.id), email: user.email, firstName: user.first_name, lastName: user.last_name, plan: user.plan || 'free', subscriptionStatus: user.subscription_status || 'none', weeklyDigest: !!user.weekly_digest_enabled };
}

const limits = {
  bootstrap: distributedRateLimit({ windowMs: 15 * 60 * 1000, max: 20, name: 'bootstrap' }),
  billing: distributedRateLimit({ windowMs: 15 * 60 * 1000, max: 20, name: 'billing' }),
  feedback: distributedRateLimit({ windowMs: 60 * 60 * 1000, max: 10, name: 'feedback' }),
  sharing: distributedRateLimit({ windowMs: 60 * 60 * 1000, max: 30, name: 'sharing' }),
  publicShare: distributedRateLimit({ windowMs: 60 * 1000, max: 60, name: 'public-share' }),
  identity: distributedRateLimit({ windowMs: 15 * 60 * 1000, max: 10, name: 'identity' }),
  sync: distributedRateLimit({ windowMs: 60 * 1000, max: 60, name: 'sync' }),
  cron: distributedRateLimit({ windowMs: 15 * 60 * 1000, max: 10, name: 'cron' })
};

async function auth(req, res, next) {
  try {
    const session = readCookie(req, SESSION_COOKIE);
    if (installationKeyOk(session)) {
      const connection = await db();
      const [sessions] = await connection.execute(`SELECT u.*,s.id session_id FROM pamet_sessions s JOIN pamet_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>NOW() LIMIT 1`, [sha(session)]);
      if (sessions.length) { req.user = sessions[0]; await connection.execute('UPDATE pamet_sessions SET last_used_at=NOW() WHERE id=?', [sessions[0].session_id]); return next(); }
    }
    const key = readBearer(req);
    if (!installationKeyOk(key)) return res.status(401).json({ error: 'Authentication required.' });
    const connection = await db();
    let rows = []; let deviceSchemaAvailable = true;
    try { [rows] = await connection.execute(`SELECT u.*,d.id device_id FROM pamet_devices d JOIN pamet_users u ON u.id=d.user_id WHERE d.credential_hash=? AND d.status='active' LIMIT 1`, [sha(key)]); }
    catch (error) { if (error.code !== 'ER_NO_SUCH_TABLE') throw error; deviceSchemaAvailable = false; }
    if (!rows.length) {
      const [legacy] = await connection.execute('SELECT * FROM pamet_users WHERE device_key_hash=? LIMIT 1', [sha(key)]);
      if (legacy.length) {
        if (!deviceSchemaAvailable) rows.push(legacy[0]);
        else { const [knownDevices] = await connection.execute('SELECT id FROM pamet_devices WHERE user_id=? LIMIT 1', [legacy[0].id]); if (!knownDevices.length) { const id = crypto.randomUUID(); await connection.execute('INSERT IGNORE INTO pamet_devices(id,user_id,credential_hash,label,last_used_at) VALUES(?,?,?,?,NOW())', [id, legacy[0].id, sha(key), 'Original device']); legacy[0].device_id = id; rows.push(legacy[0]); } }
      }
    }
    if (!rows.length) return res.status(401).json({ error: 'Authentication required.' });
    if (rows[0].device_id) await connection.execute('UPDATE pamet_devices SET last_used_at=NOW() WHERE id=?', [rows[0].device_id]).catch(() => {});
    req.user = rows[0]; next();
  } catch (error) { next(error); }
}

function planForPrice(id) { if ([prices.pro.monthly, prices.pro.annual].includes(id)) return 'pro'; if ([prices.ultra.monthly, prices.ultra.annual].includes(id)) return 'ultra'; return 'free'; }
function subscriptionEntitled(subscription) { if (subscription.status === 'active') return true; if (subscription.status !== 'trialing') return false; if (subscription.default_payment_method) return true; return plainObject(subscription.pending_setup_intent) && subscription.pending_setup_intent.status === 'succeeded'; }

async function syncSubscription(subscription) {
  const connection = await db();
  const userId = subscription.metadata && subscription.metadata.pamet_user_id;
  let rows;
  if (userId) [rows] = await connection.execute('SELECT * FROM pamet_users WHERE id=? LIMIT 1', [userId]);
  else [rows] = await connection.execute('SELECT * FROM pamet_users WHERE stripe_customer_id=? LIMIT 1', [String(subscription.customer)]);
  if (!rows.length) return null;
  const item = subscription.items && subscription.items.data && subscription.items.data[0];
  const plan = subscriptionEntitled(subscription) ? planForPrice(item && item.price && item.price.id) : 'free';
  await connection.execute('UPDATE pamet_users SET plan=?,subscription_status=?,stripe_customer_id=?,stripe_subscription_id=? WHERE id=?', [plan, subscription.status, String(subscription.customer), subscription.id, rows[0].id]);
  await audit(rows[0].id, 'billing.entitlement_synced', { plan, status: subscription.status });
  return plan;
}

async function expandedSubscription(subscription) {
  if (!stripe || subscription.status !== 'trialing' || (subscription.default_payment_method && plainObject(subscription.pending_setup_intent))) return subscription;
  return stripe.subscriptions.retrieve(subscription.id, { expand: ['pending_setup_intent', 'default_payment_method'] });
}

async function priceIsValid(plan, interval) {
  const priceId = prices[plan][interval];
  const cached = priceValidationCache.get(priceId);
  if (cached && cached.expiresAt > Date.now()) return cached.valid;
  const expected = expectedPrices[plan][interval];
  const price = await stripe.prices.retrieve(priceId);
  const liveModeOk = NODE_ENV !== 'production' || price.livemode === true;
  const valid = !!(liveModeOk && price.active && price.currency === 'usd' && price.unit_amount === expected.amount && price.recurring && price.recurring.interval === expected.interval);
  priceValidationCache.set(priceId, { valid, expiresAt: Date.now() + 5 * 60 * 1000 });
  return valid;
}

async function customer(user) {
  if (user.stripe_customer_id) return user.stripe_customer_id;
  const created = await stripe.customers.create({ email: user.email, name: [user.first_name, user.last_name].filter(Boolean).join(' '), metadata: { pamet_user_id: String(user.id) } }, { idempotencyKey: `pamet-customer-${user.id}` });
  const connection = await db();
  await connection.execute('UPDATE pamet_users SET stripe_customer_id=? WHERE id=?', [created.id, user.id]);
  return created.id;
}

app.use((req, res, next) => {
  const started = process.hrtime.bigint();
  req.requestId = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(self "https://js.stripe.com")');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'unsafe-inline' https://js.stripe.com https://*.js.stripe.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://*.stripe.com; connect-src 'self' https://api.stripe.com https://*.stripe.com https://link.com https://*.link.com; frame-src https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com https://link.com https://*.link.com");
  if (NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (req.path.startsWith('/api/') || req.path === '/share.html') res.setHeader('Cache-Control', 'no-store');
  res.once('finish', () => {
    if (!req.path.startsWith('/api/')) return;
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    const route = metricRoute(req);
    recordMetric(req.method, route, res.statusCode, durationMs);
    operationalEvent({ event: 'http.request', requestId: req.requestId, method: req.method, route, status: res.statusCode, durationMs: Number(durationMs.toFixed(1)) });
  });
  next();
});

// Stripe webhooks must be registered before express.json so the raw body is preserved.
app.post('/api/stripe/webhook', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) return res.status(503).json({ error: 'Stripe webhook not configured.' });
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    console.warn('stripe_webhook_rejected', { message: error.message });
    return res.status(400).json({ error: 'Invalid Stripe webhook.' });
  }
  try {
    const connection = await db();
    const [claim] = await connection.execute('INSERT IGNORE INTO pamet_stripe_events(event_id,event_type) VALUES(?,?)', [event.id, event.type]);
    if (!claim.affectedRows) return res.json({ received: true, duplicate: true });
    try {
      if (event.type.startsWith('customer.subscription.')) await syncSubscription(await expandedSubscription(event.data.object));
      await audit(null, `stripe.${event.type}`, { id: event.id });
      res.json({ received: true });
    } catch (error) {
      await connection.execute('DELETE FROM pamet_stripe_events WHERE event_id=?', [event.id]);
      throw error;
    }
  } catch (error) { console.error('stripe_webhook_processing_failed', { eventId: event.id, message: error.message }); res.status(500).json({ error: 'Webhook processing failed.' }); }
});

app.use(express.json({ limit: '256kb', strict: true }));

app.use('/api', (req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) || !readCookie(req, SESSION_COOKIE)) return next();
  const origin = String(req.headers.origin || '');
  if (origin && origin !== new URL(APP).origin) return res.status(403).json({ error: 'Request origin is not allowed.' });
  next();
});

app.get('/api/health', (req, res) => res.json({ ok: true, version: VERSION }));
app.get('/api/ready', async (req, res) => {
  const checks = { database: false, distributedRateLimit: false, push: push.configured(), email: !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM), logDrain: !!process.env.LOG_DRAIN_URL, metrics: !!process.env.METRICS_SECRET, alerts: !!process.env.ALERT_WEBHOOK_URL, identityEncryption: /^[a-f0-9]{64}$/i.test(process.env.IDENTITY_ENCRYPTION_KEY || '') };
  try { const connection = await db(); await connection.query('SELECT 1'); await connection.query('SELECT 1 FROM pamet_devices LIMIT 0'); await connection.query('SELECT 1 FROM pamet_push_subscriptions LIMIT 0'); await connection.query('SELECT 1 FROM pamet_sync_blobs LIMIT 0'); checks.database = true; } catch {}
  const limiter = await rateLimitReady(); checks.distributedRateLimit = limiter.ready;
  const coreRequired = ['database', 'distributedRateLimit'];
  const launchRequired = [...coreRequired, 'push', 'email', 'logDrain', 'metrics', 'alerts', 'identityEncryption'];
  const ok = coreRequired.every((name) => checks[name]); const launchReady = launchRequired.every((name) => checks[name]);
  res.status(ok ? 200 : 503).json({ ok, launchReady, version: VERSION, checks });
});
app.get('/api/metrics', (req, res) => {
  const secret = readBearer(req);
  if (!process.env.METRICS_SECRET || !secret || !secretEqual(secret, process.env.METRICS_SECRET)) return res.status(401).type('text/plain').send('Unauthorized\n');
  const lines = ['# HELP pamet_http_requests_total Completed API requests.', '# TYPE pamet_http_requests_total counter', '# HELP pamet_http_request_duration_ms_sum Total API request duration in milliseconds.', '# TYPE pamet_http_request_duration_ms_sum counter'];
  for (const [key, value] of metrics) {
    const [method, route, status] = key.split('|');
    const labels = `method="${method}",route="${route.replace(/["\\]/g, '')}",status="${status}"`;
    lines.push(`pamet_http_requests_total{${labels}} ${value.count}`, `pamet_http_request_duration_ms_sum{${labels}} ${value.durationMs.toFixed(3)}`);
  }
  res.type('text/plain; version=0.0.4').send(`${lines.join('\n')}\n`);
});

app.post('/api/auth/register', limits.identity, async (req, res, next) => {
  try {
    const email = clean(req.body.email, 254).toLowerCase(); const first = clean(req.body.firstName, 100); const last = clean(req.body.lastName, 100); const password = String(req.body.password || '');
    if (!emailOk(email) || !first || password.length < 12 || password.length > 128) return res.status(400).json({ error: 'Enter a valid name, email, and password of at least 12 characters.' });
    const connection = await db(); const [existing] = await connection.execute('SELECT id FROM pamet_users WHERE email=? LIMIT 1', [email]);
    if (existing.length) return res.status(409).json({ error: 'An account already exists for this email.' });
    const salt = crypto.randomBytes(16).toString('hex'); const hash = await passwordHash(password, salt); const legacy = token();
    const timezone = timezoneOk(req.body.timezone) ? req.body.timezone : 'UTC';
    const [result] = await connection.execute('INSERT INTO pamet_users(local_user_id,device_key_hash,password_hash,password_salt,email,first_name,last_name,timezone) VALUES(?,?,?,?,?,?,?,?)', [crypto.randomUUID(), sha(legacy), hash, salt, email, first, last, timezone]);
    const [rows] = await connection.execute('SELECT * FROM pamet_users WHERE id=?', [result.insertId]);
    await createSession(connection, result.insertId, res); await audit(result.insertId, 'identity.account_registered', { method: 'password' });
    res.status(201).json({ user: publicUser(rows[0]) });
  } catch (error) { next(error); }
});

app.post('/api/auth/login', limits.identity, async (req, res, next) => {
  try {
    const email = clean(req.body.email, 254).toLowerCase(); const password = String(req.body.password || ''); const connection = await db();
    const [rows] = await connection.execute('SELECT * FROM pamet_users WHERE email=? LIMIT 1', [email]);
    if (!rows.length || !(await passwordMatches(password, rows[0].password_salt, rows[0].password_hash))) return res.status(401).json({ error: 'Email or password is incorrect.' });
    await createSession(connection, rows[0].id, res); await audit(rows[0].id, 'identity.login', { method: 'password' }); res.json({ user: publicUser(rows[0]) });
  } catch (error) { next(error); }
});

app.post('/api/auth/logout', auth, async (req, res, next) => {
  try { const raw = readCookie(req, SESSION_COOKIE); if (raw) { const connection = await db(); await connection.execute('UPDATE pamet_sessions SET revoked_at=NOW() WHERE token_hash=?', [sha(raw)]); } clearSessionCookie(res); res.json({ loggedOut: true }); }
  catch (error) { next(error); }
});

app.post('/api/auth/password', limits.identity, auth, async (req, res, next) => {
  try {
    const current = String(req.body.currentPassword || ''); const nextPassword = String(req.body.newPassword || '');
    if (nextPassword.length < 12 || nextPassword.length > 128) return res.status(400).json({ error: 'New password must be at least 12 characters.' });
    if (!(await passwordMatches(current, req.user.password_salt, req.user.password_hash))) return res.status(401).json({ error: 'Current password is incorrect.' });
    const salt = crypto.randomBytes(16).toString('hex'); const hash = await passwordHash(nextPassword, salt); const connection = await db();
    await connection.execute('UPDATE pamet_users SET password_hash=?,password_salt=? WHERE id=?', [hash, salt, req.user.id]);
    await connection.execute('UPDATE pamet_sessions SET revoked_at=NOW() WHERE user_id=? AND id<>?', [req.user.id, req.user.session_id || '']);
    await audit(req.user.id, 'identity.password_changed'); res.json({ changed: true });
  } catch (error) { next(error); }
});

app.get('/api/auth/session', auth, (req, res) => res.json({ user: publicUser(req.user) }));
app.get('/api/entitlements', auth, (req, res) => res.json({ plan: req.user.plan || 'free', capabilities: { correlations: ['pro','ultra'].includes(req.user.plan), unlimitedHistory: ['pro','ultra'].includes(req.user.plan), sharing: ['pro','ultra'].includes(req.user.plan), appointmentWorkspace: req.user.plan === 'ultra', multipleProfiles: req.user.plan === 'ultra', advancedVisitBrief: req.user.plan === 'ultra', encryptedSync: req.user.plan === 'ultra' } }));

app.get('/api/appointments', auth, async (req, res, next) => {
  try { if (req.user.plan !== 'ultra') return res.status(403).json({ error: 'Appointment workspace requires Pamet Ultra.' }); const connection = await db(); const [rows] = await connection.execute('SELECT id,profile_id,clinician,starts_at,reason,concerns_json,questions_json,reminder_minutes,status FROM pamet_appointments WHERE user_id=? ORDER BY starts_at DESC LIMIT 50', [req.user.id]); res.json({ appointments: rows.map((row) => ({ id: row.id, profileId: row.profile_id, clinician: row.clinician, startsAt: row.starts_at, reason: row.reason, concerns: parse(row.concerns_json, []), questions: parse(row.questions_json, []), reminderMinutes: row.reminder_minutes, status: row.status })) }); }
  catch (error) { next(error); }
});

app.post('/api/appointments', limits.identity, auth, async (req, res, next) => {
  try {
    if (req.user.plan !== 'ultra') return res.status(403).json({ error: 'Appointment workspace requires Pamet Ultra.' });
    const starts = new Date(req.body.startsAt); const clinician = clean(req.body.clinician, 120); const reason = clean(req.body.reason, 500); const profileId = clean(req.body.profileId || 'primary', 128);
    const concerns = Array.isArray(req.body.concerns) ? req.body.concerns.map((item) => clean(item, 200)).filter(Boolean).slice(0, 10) : []; const questions = Array.isArray(req.body.questions) ? req.body.questions.map((item) => clean(item, 200)).filter(Boolean).slice(0, 10) : []; const reminder = Math.min(10080, Math.max(0, Number(req.body.reminderMinutes || 1440)));
    if (!clinician || Number.isNaN(+starts)) return res.status(400).json({ error: 'Clinician and appointment date are required.' });
    const id = crypto.randomUUID(); const connection = await db(); await connection.execute('INSERT INTO pamet_appointments(id,user_id,profile_id,clinician,starts_at,reason,concerns_json,questions_json,reminder_minutes) VALUES(?,?,?,?,?,?,?,?,?)', [id, req.user.id, profileId, clinician, starts, reason, JSON.stringify(concerns), JSON.stringify(questions), reminder]); await audit(req.user.id, 'appointment.created', { appointmentId: id }); res.status(201).json({ id, saved: true });
  } catch (error) { next(error); }
});

app.delete('/api/appointments/:id', limits.identity, auth, async (req, res, next) => {
  try { if (req.user.plan !== 'ultra') return res.status(403).json({ error: 'Appointment workspace requires Pamet Ultra.' }); if (!uuidOk(req.params.id)) return res.status(404).json({ error: 'Appointment not found.' }); const connection = await db(); const [result] = await connection.execute('DELETE FROM pamet_appointments WHERE id=? AND user_id=?', [req.params.id, req.user.id]); if (!result.affectedRows) return res.status(404).json({ error: 'Appointment not found.' }); res.json({ deleted: true }); }
  catch (error) { next(error); }
});

app.post('/api/account/bootstrap', limits.bootstrap, async (req, res, next) => {
  try {
    const local = clean(req.body.localUserId, 128);
    const key = readBearer(req);
    const email = clean(req.body.email, 254).toLowerCase();
    const first = clean(req.body.firstName, 100);
    const last = clean(req.body.lastName, 100);
    const timezoneCandidate = clean(req.body.timezone || 'UTC', 100);
    const timezone = timezoneOk(timezoneCandidate) ? timezoneCandidate : 'UTC';
    if (!localUserIdOk(local) || !installationKeyOk(key) || !emailOk(email) || !first) return res.status(400).json({ error: 'A valid local Pamet account is required.' });
    const connection = await db();
    const keyHash = sha(key);
    const [rows] = await connection.execute('SELECT * FROM pamet_users WHERE local_user_id=? OR email=?', [local, email]);
    let user = rows.find((row) => row.local_user_id === local);
    if (!user) {
      const emailUser = rows.find((row) => row.email === email);
      if (emailUser) { const [authorized] = await connection.execute(`SELECT id FROM pamet_devices WHERE user_id=? AND credential_hash=? AND status='active'`, [emailUser.id, keyHash]); if (authorized.length) user = emailUser; }
    }
    let created = false;
    if (user) {
      let devices = [];
      try { [devices] = await connection.execute(`SELECT id FROM pamet_devices WHERE user_id=? AND credential_hash=? AND status='active'`, [user.id, keyHash]); }
      catch (error) { if (error.code !== 'ER_NO_SUCH_TABLE') throw error; }
      if (user.device_key_hash !== keyHash && !devices.length) return res.status(403).json({ error: 'This device is not authorized for the account. Use account recovery to add it.' });
      await connection.execute('UPDATE pamet_users SET email=?,first_name=?,last_name=?,timezone=? WHERE id=?', [email, first, last, timezone, user.id]);
    } else {
      if (rows.some((row) => row.email === email)) return res.status(409).json({ error: 'This email is already linked to another Pamet installation.' });
      const [result] = await connection.execute('INSERT INTO pamet_users(local_user_id,device_key_hash,email,first_name,last_name,timezone) VALUES(?,?,?,?,?,?)', [local, keyHash, email, first, last, timezone]);
      const [fresh] = await connection.execute('SELECT * FROM pamet_users WHERE id=?', [result.insertId]);
      user = fresh[0]; created = true;
    }
    await connection.execute('INSERT IGNORE INTO pamet_devices(id,user_id,credential_hash,label,last_used_at) VALUES(?,?,?,?,NOW())', [crypto.randomUUID(), user.id, keyHash, clean(req.body.deviceLabel || 'Pamet device', 80)]).catch((error) => { if (error.code !== 'ER_NO_SUCH_TABLE') throw error; });
    const [fresh] = await connection.execute('SELECT * FROM pamet_users WHERE id=?', [user.id]);
    user = fresh[0];
    let emailSent = false;
    if ((created || !user.confirmation_email_sent_at) && process.env.RESEND_API_KEY) {
      try {
        emailSent = await mail(user.email, 'Welcome to Pamet', `<h1 style="font-size:22px">Thanks for registering with Pamet.</h1><p>Welcome${user.first_name ? ` ${html(user.first_name)}` : ''}. Your account is ready.</p><p>Start with small entries and build a health history you can understand and bring to your next appointment.</p><p><a href="${html(APP)}" style="display:inline-block;background:#4CAF7A;color:#0B2D24;text-decoration:none;font-weight:700;padding:11px 18px;border-radius:10px">Open Pamet</a></p>`);
        if (emailSent) await connection.execute('UPDATE pamet_users SET confirmation_email_sent_at=NOW() WHERE id=?', [user.id]);
      } catch (error) { console.warn('welcome_email_failed', { userId: user.id, message: error.message }); }
    }
    await audit(user.id, created ? 'account.created' : 'account.bootstrap', { emailSent });
    res.json({ user: publicUser(user), emailSent });
  } catch (error) { next(error); }
});

app.delete('/api/account', auth, async (req, res, next) => {
  try {
    if (stripe && req.user.stripe_subscription_id) { try { await stripe.subscriptions.cancel(req.user.stripe_subscription_id); } catch (error) { if (error.code !== 'resource_missing') throw error; } }
    if (stripe && req.user.stripe_customer_id) { try { await stripe.customers.del(req.user.stripe_customer_id); } catch (error) { if (error.code !== 'resource_missing') throw error; } }
    const connectionPool = await db();
    const connection = await connectionPool.getConnection();
    try { await connection.beginTransaction(); await connection.execute('DELETE FROM pamet_sharing_invites WHERE user_id=?', [req.user.id]); await connection.execute('DELETE FROM pamet_sessions WHERE user_id=?', [req.user.id]); await connection.execute('DELETE FROM pamet_audit_log WHERE user_id=?', [req.user.id]); await connection.execute('DELETE FROM pamet_users WHERE id=?', [req.user.id]); await connection.commit(); }
    catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
    clearSessionCookie(res); res.json({ deleted: true });
  } catch (error) { next(error); }
});

app.get('/api/security/devices', auth, async (req, res, next) => {
  try {
    const connection = await db();
    const [rows] = await connection.execute('SELECT id,label,status,last_used_at,created_at FROM pamet_devices WHERE user_id=? ORDER BY created_at DESC', [req.user.id]);
    const [mfa] = await connection.execute('SELECT enabled FROM pamet_mfa WHERE user_id=?', [req.user.id]);
    res.json({ currentDeviceId: req.user.device_id, mfaEnabled: !!(mfa[0] && mfa[0].enabled), devices: rows.map((row) => ({ id: row.id, label: row.label, status: row.status, lastUsedAt: row.last_used_at, createdAt: row.created_at })) });
  } catch (error) { next(error); }
});

app.delete('/api/security/devices/:id', limits.identity, auth, async (req, res, next) => {
  try {
    const id = clean(req.params.id, 36);
    if (!uuidOk(id)) return res.status(404).json({ error: 'Device not found.' });
    if (id === req.user.device_id) return res.status(409).json({ error: 'Use Log out to remove the current device.' });
    const connection = await db();
    const [result] = await connection.execute(`UPDATE pamet_devices SET status='revoked',revoked_at=NOW() WHERE id=? AND user_id=? AND status='active'`, [id, req.user.id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Device not found.' });
    await audit(req.user.id, 'identity.device_revoked', { deviceId: id });
    res.json({ revoked: true });
  } catch (error) { next(error); }
});

app.post('/api/security/mfa/setup', limits.identity, auth, async (req, res, next) => {
  try {
    if (!process.env.IDENTITY_ENCRYPTION_KEY) return res.status(503).json({ error: 'MFA encryption is not configured.' });
    const secret = totpSecret();
    const connection = await db();
    await connection.execute('INSERT INTO pamet_mfa(user_id,secret_encrypted,enabled) VALUES(?,?,FALSE) ON DUPLICATE KEY UPDATE secret_encrypted=VALUES(secret_encrypted),enabled=FALSE,verified_at=NULL', [req.user.id, seal(secret)]);
    const issuer = encodeURIComponent('Pamet'); const label = encodeURIComponent(`Pamet:${req.user.email}`);
    res.json({ secret, otpauthUri: `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&digits=6&period=30` });
  } catch (error) { next(error); }
});

app.post('/api/security/mfa/confirm', limits.identity, auth, async (req, res, next) => {
  try {
    const connection = await db(); const [rows] = await connection.execute('SELECT secret_encrypted FROM pamet_mfa WHERE user_id=?', [req.user.id]);
    if (!rows.length || !verifyTotp(open(rows[0].secret_encrypted), req.body.code)) return res.status(400).json({ error: 'That verification code is not valid.' });
    await connection.execute('UPDATE pamet_mfa SET enabled=TRUE,verified_at=NOW() WHERE user_id=?', [req.user.id]);
    await audit(req.user.id, 'identity.mfa_enabled'); res.json({ enabled: true });
  } catch (error) { next(error); }
});

app.post('/api/security/mfa/disable', limits.identity, auth, async (req, res, next) => {
  try {
    const connection = await db(); const [rows] = await connection.execute('SELECT secret_encrypted,enabled FROM pamet_mfa WHERE user_id=?', [req.user.id]);
    if (!rows.length || !rows[0].enabled || !verifyTotp(open(rows[0].secret_encrypted), req.body.code)) return res.status(400).json({ error: 'A current authenticator code is required.' });
    await connection.execute('DELETE FROM pamet_mfa WHERE user_id=?', [req.user.id]); await audit(req.user.id, 'identity.mfa_disabled'); res.json({ enabled: false });
  } catch (error) { next(error); }
});

app.post('/api/account/recovery/request', limits.identity, async (req, res, next) => {
  try {
    if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return res.status(503).json({ error: 'Password reset email is not configured yet.' });
    const email = clean(req.body.email, 254).toLowerCase();
    if (emailOk(email) && process.env.RESEND_API_KEY && process.env.EMAIL_FROM) {
      const connection = await db(); const [rows] = await connection.execute('SELECT id,first_name FROM pamet_users WHERE email=? LIMIT 1', [email]);
      if (rows.length) {
        const raw = token(); await connection.execute('INSERT INTO pamet_recovery_tokens(id,user_id,token_hash,expires_at) VALUES(?,?,?,DATE_ADD(NOW(),INTERVAL 30 MINUTE))', [crypto.randomUUID(), rows[0].id, sha(raw)]);
        await mail(email, 'Recover your Pamet account', `<h1 style="font-size:22px">Recover your Pamet account</h1><p>This link expires in 30 minutes and can be used once.</p><p><a href="${html(`${APP}/?recover=${raw}`)}" style="display:inline-block;background:#4CAF7A;color:#0B2D24;text-decoration:none;font-weight:700;padding:11px 18px;border-radius:10px">Continue account recovery</a></p><p>If you did not request this, you can ignore this email.</p>`);
      }
    }
    res.status(202).json({ accepted: true });
  } catch (error) { next(error); }
});

app.post('/api/account/recovery/complete', limits.identity, async (req, res, next) => {
  try {
    const raw = clean(req.body.token, 128); const password = String(req.body.password || '');
    if (!installationKeyOk(raw) || password.length < 12 || password.length > 128) return res.status(400).json({ error: 'Use a valid recovery link and a password of at least 12 characters.' });
    const connection = await db(); const [rows] = await connection.execute(`SELECT r.id token_id,r.user_id,u.email,u.first_name,u.last_name,m.enabled mfa_enabled,m.secret_encrypted FROM pamet_recovery_tokens r JOIN pamet_users u ON u.id=r.user_id LEFT JOIN pamet_mfa m ON m.user_id=u.id WHERE r.token_hash=? AND r.used_at IS NULL AND r.expires_at>NOW() LIMIT 1`, [sha(raw)]);
    if (!rows.length) return res.status(400).json({ error: 'Recovery link is invalid or expired.' });
    const row = rows[0]; if (row.mfa_enabled && !verifyTotp(open(row.secret_encrypted), req.body.code)) return res.status(401).json({ error: 'Your authenticator code is required.' });
    const salt = crypto.randomBytes(16).toString('hex'); const hash = await passwordHash(password, salt);
    const tx = await connection.getConnection();
    try { await tx.beginTransaction(); await tx.execute('UPDATE pamet_recovery_tokens SET used_at=NOW() WHERE id=? AND used_at IS NULL', [row.token_id]); await tx.execute('UPDATE pamet_users SET password_hash=?,password_salt=? WHERE id=?', [hash, salt, row.user_id]); await tx.execute('UPDATE pamet_sessions SET revoked_at=NOW() WHERE user_id=? AND revoked_at IS NULL', [row.user_id]); await tx.commit(); }
    catch (error) { await tx.rollback(); throw error; } finally { tx.release(); }
    await createSession(connection, row.user_id, res); await audit(row.user_id, 'identity.password_reset');
    res.json({ recovered: true, profile: { id: String(row.user_id), email: row.email, firstName: row.first_name, lastName: row.last_name } });
  } catch (error) { next(error); }
});

app.post('/api/feedback', limits.feedback, auth, async (req, res, next) => {
  try {
    const allowed = new Set(['idea', 'usability', 'bug', 'other']);
    const category = allowed.has(req.body.category) ? req.body.category : 'other';
    const message = clean(req.body.message, 1000);
    const rawRating = req.body.rating;
    const rating = rawRating === null || rawRating === undefined || rawRating === '' ? null : Number(rawRating);
    const appVersion = clean(req.body.appVersion || VERSION, 16);
    const screen = clean(req.body.screen || 'settings', 40);
    if (message.length < 10) return res.status(400).json({ error: 'Please enter at least 10 characters of feedback.' });
    if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) return res.status(400).json({ error: 'Rating must be between 1 and 5.' });
    const connection = await db();
    await connection.execute('INSERT INTO pamet_feedback(id,category,rating,message,app_version,screen) VALUES(?,?,?,?,?,?)', [crypto.randomUUID(), category, rating, message, appVersion, screen]);
    if (process.env.FEEDBACK_WEBHOOK_URL) {
      fetch(process.env.FEEDBACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(process.env.FEEDBACK_WEBHOOK_TOKEN ? { Authorization: `Bearer ${process.env.FEEDBACK_WEBHOOK_TOKEN}` } : {}) },
        body: JSON.stringify({ category, rating, message, appVersion, screen, createdAt: new Date().toISOString() }),
        signal: AbortSignal.timeout(5000)
      }).catch((error) => console.warn('feedback_route_failed', { message: error.message }));
    }
    res.status(201).json({ saved: true });
  } catch (error) { next(error); }
});

app.get('/api/billing/config', async (req, res) => {
  const configured = (plan) => !!(stripe && prices[plan].monthly && prices[plan].annual);
  const valid = async (plan) => configured(plan) && (await Promise.all(['monthly', 'annual'].map((interval) => priceIsValid(plan, interval)))).every(Boolean);
  try {
    const [proEnabled, ultraEnabled] = await Promise.all([valid('pro'), valid('ultra')]);
    res.json({ publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '', proEnabled, ultraEnabled, emailEnabled: !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM) });
  } catch (error) {
    console.warn('stripe_catalog_validation_failed', { message: error.message });
    res.json({ publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '', proEnabled: false, ultraEnabled: false, emailEnabled: !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM) });
  }
});
app.get('/api/billing/status', auth, (req, res) => res.json({ user: publicUser(req.user) }));

app.post('/api/billing/create-subscription', limits.billing, auth, async (req, res, next) => {
  try {
    if (!stripe) return res.status(503).json({ error: 'Stripe is not configured.' });
    const plan = req.body.plan;
    const interval = req.body.interval;
    const checkoutAttemptId = clean(req.body.checkoutAttemptId, 64);
    if (!['pro', 'ultra'].includes(plan) || !['monthly', 'annual'].includes(interval) || !attemptIdOk(checkoutAttemptId)) return res.status(400).json({ error: 'A valid plan, interval, and checkout attempt are required.' });
    const price = prices[plan][interval];
    if (!price) return res.status(503).json({ error: 'Stripe price is not configured.' });
    if (!(await priceIsValid(plan, interval))) return res.status(503).json({ error: 'The configured Stripe price does not match this Pamet plan.' });
    if (req.user.stripe_subscription_id) {
      try {
        const existing = await stripe.subscriptions.retrieve(req.user.stripe_subscription_id, { expand: ['pending_setup_intent', 'default_payment_method'] });
        if (subscriptionEntitled(existing) || ['past_due', 'unpaid', 'paused'].includes(existing.status)) return res.status(409).json({ error: 'A Stripe subscription already exists. Use Manage your plan.' });
        if (!['canceled', 'incomplete_expired'].includes(existing.status)) await stripe.subscriptions.cancel(existing.id);
      } catch (error) { if (error.code !== 'resource_missing') throw error; }
    }
    const customerId = await customer(req.user);
    const subscription = await stripe.subscriptions.create({ customer: customerId, items: [{ price }], payment_behavior: 'default_incomplete', payment_settings: { save_default_payment_method: 'on_subscription' }, trial_period_days: 7, metadata: { pamet_user_id: String(req.user.id), pamet_plan: plan, pamet_interval: interval }, expand: ['pending_setup_intent', 'latest_invoice.confirmation_secret', 'latest_invoice.payment_intent'] }, { idempotencyKey: `pamet-sub-${req.user.id}-${checkoutAttemptId}` });
    const setup = subscription.pending_setup_intent;
    const confirmation = subscription.latest_invoice && subscription.latest_invoice.confirmation_secret;
    const paymentIntent = subscription.latest_invoice && subscription.latest_invoice.payment_intent;
    const clientSecret = (setup && setup.client_secret) || (confirmation && confirmation.client_secret) || (paymentIntent && paymentIntent.client_secret);
    if (!clientSecret) { await stripe.subscriptions.cancel(subscription.id); return res.status(502).json({ error: 'Stripe could not initialize checkout. Please try again.' }); }
    const connection = await db();
    await connection.execute('UPDATE pamet_users SET stripe_customer_id=?,stripe_subscription_id=?,subscription_status=? WHERE id=?', [customerId, subscription.id, subscription.status, req.user.id]);
    res.json({ clientSecret, intentType: setup && setup.client_secret ? 'setup' : 'payment', subscriptionId: subscription.id, plan, interval });
  } catch (error) { next(error); }
});

app.post('/api/billing/sync', limits.billing, auth, async (req, res, next) => {
  try {
    if (stripe && req.user.stripe_subscription_id) { const subscription = await stripe.subscriptions.retrieve(req.user.stripe_subscription_id, { expand: ['pending_setup_intent', 'default_payment_method'] }); await syncSubscription(subscription); }
    const connection = await db();
    const [rows] = await connection.execute('SELECT * FROM pamet_users WHERE id=?', [req.user.id]);
    res.json({ user: publicUser(rows[0]) });
  } catch (error) { next(error); }
});

app.post('/api/billing/portal', limits.billing, auth, async (req, res, next) => {
  try {
    if (!stripe || !req.user.stripe_customer_id) return res.status(409).json({ error: 'No Stripe billing account is available.' });
    const session = await stripe.billingPortal.sessions.create({ customer: req.user.stripe_customer_id, return_url: `${APP}/?billing=return` });
    res.json({ url: session.url });
  } catch (error) { next(error); }
});

app.post('/api/preferences/weekly-digest', auth, async (req, res, next) => {
  try {
    if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return res.status(503).json({ error: 'Weekly email is not configured.' });
    const enabled = req.body.enabled === true;
    const timezoneCandidate = clean(req.body.timezone || 'UTC', 100);
    const timezone = timezoneOk(timezoneCandidate) ? timezoneCandidate : 'UTC';
    const snapshot = req.body.snapshot === null || req.body.snapshot === undefined ? null : serializedObject(req.body.snapshot, 64 * 1024);
    if (enabled && !snapshot) return res.status(400).json({ error: 'A valid weekly summary is required.' });
    const connection = await db();
    await connection.execute('UPDATE pamet_users SET weekly_digest_enabled=?,timezone=?,latest_digest_json=CASE WHEN ? IS NULL THEN latest_digest_json ELSE ? END WHERE id=?', [enabled, timezone, snapshot, snapshot, req.user.id]);
    await audit(req.user.id, 'digest.preference_changed', { enabled });
    res.json({ enabled });
  } catch (error) { next(error); }
});

app.post('/api/digest/snapshot', auth, async (req, res, next) => {
  try {
    if (!req.user.weekly_digest_enabled) return res.status(409).json({ error: 'Weekly digest is not enabled.' });
    const snapshot = serializedObject(req.body.snapshot, 64 * 1024);
    if (!snapshot) return res.status(400).json({ error: 'A valid weekly summary is required.' });
    const connection = await db();
    await connection.execute('UPDATE pamet_users SET latest_digest_json=? WHERE id=?', [snapshot, req.user.id]);
    res.json({ saved: true });
  } catch (error) { next(error); }
});

app.get('/api/notifications/config', (req, res) => res.json({ enabled: push.configured(), publicKey: process.env.VAPID_PUBLIC_KEY || '' }));

app.post('/api/notifications/subscriptions', limits.identity, auth, async (req, res, next) => {
  try {
    if (!push.configured()) return res.status(503).json({ error: 'Push notifications are not configured.' });
    const subscription = req.body.subscription;
    const endpoint = clean(subscription && subscription.endpoint, 2048);
    const timezoneCandidate = clean(req.body.timezone || 'UTC', 100); const timezone = timezoneOk(timezoneCandidate) ? timezoneCandidate : 'UTC';
    const reminderHour = Number.isInteger(Number(req.body.reminderHour)) && Number(req.body.reminderHour) >= 0 && Number(req.body.reminderHour) <= 23 ? Number(req.body.reminderHour) : 20;
    if (!endpoint.startsWith('https://') || !plainObject(subscription.keys) || !subscription.keys.p256dh || !subscription.keys.auth) return res.status(400).json({ error: 'A valid push subscription is required.' });
    const serialized = JSON.stringify(subscription); if (Buffer.byteLength(serialized) > 16 * 1024) return res.status(413).json({ error: 'Push subscription is too large.' });
    const connection = await db();
    await connection.execute(`INSERT INTO pamet_push_subscriptions(id,user_id,device_id,endpoint_hash,subscription_json,timezone,reminder_hour,enabled) VALUES(?,?,?,?,?,?,?,TRUE) ON DUPLICATE KEY UPDATE user_id=VALUES(user_id),device_id=VALUES(device_id),subscription_json=VALUES(subscription_json),timezone=VALUES(timezone),reminder_hour=VALUES(reminder_hour),enabled=TRUE,failure_count=0`, [crypto.randomUUID(), req.user.id, req.user.device_id || null, sha(endpoint), serialized, timezone, reminderHour]);
    await audit(req.user.id, 'notifications.push_enabled', { reminderHour, timezone }); res.status(201).json({ saved: true });
  } catch (error) { next(error); }
});

app.delete('/api/notifications/subscriptions', limits.identity, auth, async (req, res, next) => {
  try {
    const endpoint = clean(req.body.endpoint, 2048); if (!endpoint) return res.status(400).json({ error: 'Push endpoint is required.' });
    const connection = await db(); await connection.execute('DELETE FROM pamet_push_subscriptions WHERE user_id=? AND endpoint_hash=?', [req.user.id, sha(endpoint)]);
    await audit(req.user.id, 'notifications.push_disabled'); res.json({ deleted: true });
  } catch (error) { next(error); }
});

app.get('/api/sync/:profileId', limits.sync, auth, async (req, res, next) => {
  try {
    if (req.user.plan !== 'ultra') return res.status(403).json({ error: 'Encrypted multi-device sync requires Pamet Ultra.' });
    const profileId = clean(req.params.profileId, 128); if (!localUserIdOk(profileId)) return res.status(400).json({ error: 'Invalid profile.' });
    const connection = await db(); const [rows] = await connection.execute('SELECT ciphertext,nonce,key_version,revision,content_hash,updated_at FROM pamet_sync_blobs WHERE user_id=? AND profile_id=?', [req.user.id, profileId]);
    if (!rows.length) return res.status(404).json({ error: 'No synchronized journal exists for this profile.' });
    const row = rows[0]; res.json({ ciphertext: Buffer.from(row.ciphertext).toString('base64'), nonce: Buffer.from(row.nonce).toString('base64'), keyVersion: row.key_version, revision: Number(row.revision), contentHash: row.content_hash, updatedAt: row.updated_at });
  } catch (error) { next(error); }
});

app.put('/api/sync/:profileId', limits.sync, auth, async (req, res, next) => {
  try {
    if (req.user.plan !== 'ultra') return res.status(403).json({ error: 'Encrypted multi-device sync requires Pamet Ultra.' });
    const profileId = clean(req.params.profileId, 128); const ciphertext = Buffer.from(String(req.body.ciphertext || ''), 'base64'); const nonce = Buffer.from(String(req.body.nonce || ''), 'base64');
    const keyVersion = Number(req.body.keyVersion); const expectedRevision = Number(req.body.expectedRevision || 0);
    if (!localUserIdOk(profileId) || ciphertext.length < 16 || ciphertext.length > 5 * 1024 * 1024 || nonce.length !== 12 || !Number.isInteger(keyVersion) || keyVersion < 1) return res.status(400).json({ error: 'Invalid encrypted sync payload.' });
    const connection = await db(); const contentHash = sha(ciphertext); const [existing] = await connection.execute('SELECT revision FROM pamet_sync_blobs WHERE user_id=? AND profile_id=?', [req.user.id, profileId]);
    const current = existing.length ? Number(existing[0].revision) : 0; if (current !== expectedRevision) return res.status(409).json({ error: 'A newer encrypted journal is available.', currentRevision: current });
    const revision = current + 1;
    await connection.execute(`INSERT INTO pamet_sync_blobs(user_id,profile_id,ciphertext,nonce,key_version,revision,content_hash) VALUES(?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE ciphertext=VALUES(ciphertext),nonce=VALUES(nonce),key_version=VALUES(key_version),revision=VALUES(revision),content_hash=VALUES(content_hash)`, [req.user.id, profileId, ciphertext, nonce, keyVersion, revision, contentHash]);
    await audit(req.user.id, 'sync.encrypted_blob_saved', { profileId, revision, keyVersion }); res.json({ saved: true, revision, contentHash });
  } catch (error) { next(error); }
});

app.post('/api/jobs/push-reminders', limits.cron, async (req, res, next) => {
  try {
    const secret = readBearer(req); if (!process.env.CRON_SECRET || !secret || !secretEqual(secret, process.env.CRON_SECRET)) return res.status(401).json({ error: 'Unauthorized.' });
    if (!push.configured()) return res.status(503).json({ error: 'Web Push is not configured.' });
    const connection = await db(); const [rows] = await connection.execute('SELECT * FROM pamet_push_subscriptions WHERE enabled=TRUE AND failure_count<5');
    let sent = 0; let disabled = 0;
    for (const row of rows) {
      try {
        const parts = new Intl.DateTimeFormat('en-CA', { timeZone: row.timezone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit' }).formatToParts(new Date());
        const value = Object.fromEntries(parts.map((part) => [part.type, part.value])); const localDate = `${value.year}-${value.month}-${value.day}`; const localHour = Number(value.hour === '24' ? 0 : value.hour);
        if (localHour !== Number(row.reminder_hour) || String(row.last_sent_local_date || '').slice(0, 10) === localDate) continue;
        await push.send(parse(row.subscription_json), { title: 'Time for a quick Pamet check-in', body: 'Take a moment to record how you felt today. Small entries build a clearer health history.', url: APP, tag: `pamet-daily-${localDate}` });
        await connection.execute('UPDATE pamet_push_subscriptions SET last_sent_local_date=?,last_success_at=NOW(),failure_count=0 WHERE id=?', [localDate, row.id]); sent += 1;
      } catch (error) {
        const terminal = error.statusCode === 404 || error.statusCode === 410;
        await connection.execute(`UPDATE pamet_push_subscriptions SET failure_count=failure_count+1,enabled=? WHERE id=?`, [!terminal, row.id]); if (terminal) disabled += 1;
        operationalEvent({ event: 'push.delivery_failed', subscriptionId: row.id, status: error.statusCode || 0 });
      }
    }
    res.json({ checked: rows.length, sent, disabled });
  } catch (error) { next(error); }
});

app.post('/api/jobs/weekly-digest', limits.cron, async (req, res, next) => {
  try {
    const secret = readBearer(req);
    if (!process.env.CRON_SECRET || !secret || !secretEqual(secret, process.env.CRON_SECRET)) return res.status(401).json({ error: 'Unauthorized.' });
    const connection = await db();
    const [users] = await connection.execute('SELECT * FROM pamet_users WHERE weekly_digest_enabled=TRUE AND latest_digest_json IS NOT NULL');
    let sent = 0;
    for (const user of users) {
      const summary = parse(user.latest_digest_json);
      const top = Array.isArray(summary.topSymptoms) ? summary.topSymptoms.slice(0, 3) : [];
      try {
        if (await mail(user.email, 'Your Pamet weekly summary is ready', `<h1 style="font-size:22px">Your weekly summary is ready.</h1><p>Here is your weekly Pamet overview based on the aggregate summary prepared on your device.</p><div style="background:#F4F5F2;border-radius:12px;padding:14px"><p><strong>${Number(summary.loggedDays || 0)}</strong> days logged</p><p><strong>${Number(summary.symptomDays || 0)}</strong> symptom days</p><p><strong>${Number(summary.averageSleep || 0).toFixed(1)}h</strong> average sleep</p></div>${top.length ? `<p><strong>Most frequently recorded</strong></p><ul>${top.map((item) => `<li>${html(item.name)} — ${Number(item.count || 0)} day(s)</li>`).join('')}</ul>` : ''}<p>Pamet observes. Pamet does not diagnose.</p><p><a href="${html(APP)}">Open Pamet</a></p>`)) sent += 1;
      } catch (error) { console.warn('digest_email_failed', { userId: user.id, message: error.message }); }
    }
    res.json({ attempted: users.length, sent });
  } catch (error) { next(error); }
});

app.post('/api/jobs/stripe-reconcile', limits.cron, async (req, res, next) => {
  try {
    const secret = readBearer(req);
    if (!process.env.CRON_SECRET || !secret || !secretEqual(secret, process.env.CRON_SECRET)) return res.status(401).json({ error: 'Unauthorized.' });
    if (!stripe) return res.status(503).json({ error: 'Stripe is not configured.' });
    const connection = await db();
    const [users] = await connection.execute('SELECT id,stripe_subscription_id,plan,subscription_status FROM pamet_users WHERE stripe_subscription_id IS NOT NULL');
    let corrected = 0;
    const failures = [];
    for (const user of users) {
      try {
        const subscription = await stripe.subscriptions.retrieve(user.stripe_subscription_id, { expand: ['pending_setup_intent', 'default_payment_method'] });
        const item = subscription.items && subscription.items.data && subscription.items.data[0];
        const expectedPlan = subscriptionEntitled(subscription) ? planForPrice(item && item.price && item.price.id) : 'free';
        if (expectedPlan !== user.plan || subscription.status !== user.subscription_status) corrected += 1;
        await syncSubscription(subscription);
      } catch (error) {
        failures.push({ userId: String(user.id), code: clean(error.code || 'stripe_error', 40) });
      }
    }
    await audit(null, 'billing.reconciliation_completed', { checked: users.length, corrected, failed: failures.length });
    res.json({ checked: users.length, corrected, failed: failures.length, failures });
  } catch (error) { next(error); }
});

app.get('/api/sharing/invites', auth, async (req, res, next) => {
  try {
    const kind = ['caregiver', 'provider'].includes(req.query.kind) ? req.query.kind : null;
    const connection = await db();
    const [rows] = await connection.execute(`SELECT id,kind,name,email,organization,permission_level,profile_name,status,expires_at,created_at FROM pamet_sharing_invites WHERE user_id=? ${kind ? 'AND kind=?' : ''} ORDER BY created_at DESC`, kind ? [req.user.id, kind] : [req.user.id]);
    res.json({ invites: rows.map((row) => ({ id: row.id, kind: row.kind, name: row.name, email: row.email, organization: row.organization, permission: row.permission_level, profileName: row.profile_name, status: row.status, expiresAt: row.expires_at, createdAt: row.created_at })) });
  } catch (error) { next(error); }
});

app.post('/api/sharing/invites', limits.sharing, auth, async (req, res, next) => {
  try {
    if (!['pro', 'ultra'].includes(req.user.plan)) return res.status(403).json({ error: 'Sharing requires Pamet Pro or Ultra.' });
    if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return res.status(503).json({ error: 'Email delivery is not configured.' });
    const kind = req.body.kind === 'provider' ? 'provider' : 'caregiver';
    const name = clean(req.body.name, 100);
    const recipient = clean(req.body.email, 254).toLowerCase();
    const organization = clean(req.body.organization, 120);
    const snapshot = serializedObject(req.body.snapshot);
    const requestedPermission = ['view', 'download'].includes(req.body.permission) ? req.body.permission : 'view';
    const permission = req.user.plan === 'ultra' ? requestedPermission : 'view';
    const profileName = clean(req.body.profileName, 80);
    const requestedDays = [7, 14, 30, 90].includes(Number(req.body.expiresInDays)) ? Number(req.body.expiresInDays) : (kind === 'provider' ? 14 : 30);
    const days = req.user.plan === 'ultra' ? requestedDays : (kind === 'provider' ? 14 : 30);
    if (!name || !emailOk(recipient) || !snapshot) return res.status(400).json({ error: 'Name, email, and a valid share snapshot are required.' });
    const connection = await db();
    if (req.user.plan === 'pro') {
      const [counts] = await connection.execute('SELECT COUNT(*) n FROM pamet_sharing_invites WHERE user_id=? AND kind=? AND status="active" AND revoked_at IS NULL AND expires_at>NOW()', [req.user.id, kind]);
      if (Number(counts[0].n) >= 1) return res.status(409).json({ error: `Pro supports one active ${kind} share at a time.` });
    }
    const id = crypto.randomUUID();
    const rawToken = token();
    const expires = new Date(Date.now() + days * 86400000);
    await connection.execute('INSERT INTO pamet_sharing_invites(id,user_id,kind,name,email,organization,permission_level,profile_name,share_token_hash,snapshot_json,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)', [id, req.user.id, kind, name, recipient, organization, permission, profileName, sha(rawToken), snapshot, expires]);
    const url = `${APP}/share.html?token=${encodeURIComponent(rawToken)}`;
    try { await mail(recipient, 'A Pamet health summary was shared with you', `<h1 style="font-size:22px">A Pamet health summary was shared with you.</h1><p>${html(req.user.first_name || 'A Pamet user')} invited you to review a ${html(profileName || 'Pamet')} summary.</p><p>Your permission is ${html(permission)}. The link expires in ${days} days and can be revoked at any time.</p><p><a href="${html(url)}" style="display:inline-block;background:#4CAF7A;color:#0B2D24;text-decoration:none;font-weight:700;padding:11px 18px;border-radius:10px">View shared summary</a></p><p style="font-size:12px">Pamet does not provide emergency monitoring, diagnosis, or clinical alerts.</p>`); }
    catch (error) { await connection.execute('DELETE FROM pamet_sharing_invites WHERE id=? AND user_id=?', [id, req.user.id]); throw error; }
    await audit(req.user.id, 'sharing.invite_created', { id, kind, permission, days });
    res.status(201).json({ id, permission, expiresInDays: days });
  } catch (error) { next(error); }
});

app.delete('/api/sharing/invites/:id', limits.sharing, auth, async (req, res, next) => {
  try {
    const id = clean(req.params.id, 36);
    if (!uuidOk(id)) return res.status(404).json({ error: 'Share not found.' });
    const connection = await db();
    const [result] = await connection.execute('UPDATE pamet_sharing_invites SET status="revoked",revoked_at=NOW() WHERE id=? AND user_id=?', [id, req.user.id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Share not found.' });
    await audit(req.user.id, 'sharing.invite_revoked', { id });
    res.json({ revoked: true });
  } catch (error) { next(error); }
});

app.get('/api/share/:token', limits.publicShare, async (req, res, next) => {
  try {
    const rawToken = clean(req.params.token, 256);
    if (!installationKeyOk(rawToken)) return res.status(404).json({ error: 'Share not found.' });
    const connection = await db();
    const [rows] = await connection.execute(`SELECT s.kind,s.name,s.organization,s.permission_level,s.profile_name,s.snapshot_json,s.expires_at,u.first_name owner_first_name FROM pamet_sharing_invites s JOIN pamet_users u ON u.id=s.user_id WHERE s.share_token_hash=? AND s.status='active' AND s.revoked_at IS NULL AND s.expires_at>NOW() LIMIT 1`, [sha(rawToken)]);
    if (!rows.length) return res.status(404).json({ error: 'This sharing link is invalid, expired, or revoked.' });
    const row = rows[0];
    res.json({ kind: row.kind, recipientName: row.name, organization: row.organization, permission: row.permission_level, profileName: row.profile_name, ownerFirstName: row.owner_first_name, expiresAt: row.expires_at, snapshot: parse(row.snapshot_json) });
  } catch (error) { next(error); }
});

// Asset URLs are not content-hashed, so they must revalidate on every release.
const staticOptions = { dotfiles: 'ignore', etag: true, fallthrough: false, immutable: false, maxAge: 0 };
app.use('/assets', express.static(path.join(__dirname, 'assets'), staticOptions));
app.use('/dist', express.static(path.join(__dirname, 'dist'), staticOptions));
app.get(['/', '/index.html'], (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/share.html', (req, res) => res.sendFile(path.join(__dirname, 'share.html')));
app.get('/manifest.webmanifest', (req, res) => res.type('application/manifest+json').sendFile(path.join(__dirname, 'manifest.webmanifest')));
app.get('/sw.js', (req, res) => { res.setHeader('Service-Worker-Allowed', '/'); res.sendFile(path.join(__dirname, 'sw.js')); });
app.use((req, res) => res.status(404).json({ error: 'Not found.' }));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = error.type === 'entity.too.large' ? 413 : error instanceof SyntaxError && error.status === 400 ? 400 : Number(error.status || 500);
  console.error('request_failed', { requestId: req.requestId, method: req.method, path: req.path, status, message: error.message });
  if (status >= 500) operationalAlert({ severity: 'error', kind: 'http_failure', requestId: req.requestId, method: req.method, route: metricRoute(req), status });
  const message = status === 413 ? 'Request is too large.' : status === 400 ? 'Invalid JSON request.' : NODE_ENV === 'production' ? 'Pamet could not complete that request.' : error.message;
  res.status(status).json({ error: message, requestId: req.requestId });
});

if (require.main === module) app.listen(PORT, () => console.log(`Pamet v${VERSION} listening on ${PORT}`));
module.exports = app;
