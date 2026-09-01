'use strict';

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const mysql = require('mysql2/promise');
const Stripe = require('stripe');

const VERSION = '2.0.1';
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
const ultraEnabled = String(process.env.ULTRA_ENABLED || '').toLowerCase() === 'true';
const priceValidationCache = new Map();
let pool;
let poolInitialization;

app.disable('x-powered-by');
app.set('trust proxy', 1);

const sha = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const token = () => crypto.randomBytes(32).toString('hex');
const clean = (value, max) => String(value || '').trim().slice(0, max);
const emailOk = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const plainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const parse = (value, fallback = {}) => { if (plainObject(value) || Array.isArray(value)) return value; try { return JSON.parse(value); } catch { return fallback; } };
const html = (value) => String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const readBearer = (req) => { const value = String(req.headers.authorization || ''); return value.startsWith('Bearer ') ? value.slice(7).trim() : ''; };
const installationKeyOk = (value) => /^[a-f0-9]{64}$/i.test(value);
const localUserIdOk = (value) => /^[a-z0-9][a-z0-9-]{15,127}$/i.test(value);
const attemptIdOk = (value) => /^[a-z0-9][a-z0-9-]{15,63}$/i.test(value);
const uuidOk = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const timezoneOk = (value) => { try { new Intl.DateTimeFormat('en-US', { timeZone: value }).format(); return true; } catch { return false; } };
const secretEqual = (left, right) => { const a = Buffer.from(sha(left)); const b = Buffer.from(sha(right)); return a.length === b.length && crypto.timingSafeEqual(a, b); };
const serializedObject = (value, maxBytes = 200 * 1024) => { if (!plainObject(value)) return null; const json = JSON.stringify(value); return Buffer.byteLength(json, 'utf8') <= maxBytes ? json : null; };

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
    try {
      let lastError;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try { await schema(candidate); pool = candidate; return pool; }
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

async function schema(connection) {
  await connection.query(`CREATE TABLE IF NOT EXISTS pamet_users (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,local_user_id VARCHAR(128) NOT NULL UNIQUE,device_key_hash CHAR(64) NOT NULL UNIQUE,email VARCHAR(254) NOT NULL UNIQUE,first_name VARCHAR(100) NOT NULL DEFAULT '',last_name VARCHAR(100) NOT NULL DEFAULT '',timezone VARCHAR(100) NOT NULL DEFAULT 'UTC',plan VARCHAR(16) NOT NULL DEFAULT 'free',subscription_status VARCHAR(32) NOT NULL DEFAULT 'none',stripe_customer_id VARCHAR(128) NULL UNIQUE,stripe_subscription_id VARCHAR(128) NULL UNIQUE,weekly_digest_enabled BOOLEAN NOT NULL DEFAULT FALSE,latest_digest_json JSON NULL,confirmation_email_sent_at DATETIME NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,INDEX idx_digest(weekly_digest_enabled)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await connection.query(`CREATE TABLE IF NOT EXISTS pamet_sharing_invites (id CHAR(36) PRIMARY KEY,user_id BIGINT UNSIGNED NOT NULL,kind VARCHAR(20) NOT NULL,name VARCHAR(100) NOT NULL,email VARCHAR(254) NOT NULL,organization VARCHAR(120) NOT NULL DEFAULT '',permission_level VARCHAR(24) NOT NULL DEFAULT 'view',profile_name VARCHAR(80) NOT NULL DEFAULT '',status VARCHAR(20) NOT NULL DEFAULT 'active',share_token_hash CHAR(64) NOT NULL UNIQUE,snapshot_json JSON NOT NULL,expires_at DATETIME NOT NULL,revoked_at DATETIME NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES pamet_users(id) ON DELETE CASCADE,INDEX idx_share(user_id,kind,status)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await connection.query(`ALTER TABLE pamet_sharing_invites ADD COLUMN IF NOT EXISTS permission_level VARCHAR(24) NOT NULL DEFAULT 'view' AFTER organization`);
  await connection.query(`ALTER TABLE pamet_sharing_invites ADD COLUMN IF NOT EXISTS profile_name VARCHAR(80) NOT NULL DEFAULT '' AFTER permission_level`);
  await connection.query(`CREATE TABLE IF NOT EXISTS pamet_audit_log (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,user_id BIGINT UNSIGNED NULL,event_type VARCHAR(80) NOT NULL,event_json JSON NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,INDEX idx_audit(user_id,created_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await connection.query(`CREATE TABLE IF NOT EXISTS pamet_feedback (id CHAR(36) PRIMARY KEY,category VARCHAR(24) NOT NULL,rating TINYINT UNSIGNED NULL,message VARCHAR(1000) NOT NULL,app_version VARCHAR(16) NOT NULL,screen VARCHAR(40) NOT NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,INDEX idx_feedback_created(created_at),INDEX idx_feedback_category(category)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await connection.query(`CREATE TABLE IF NOT EXISTS pamet_stripe_events (event_id VARCHAR(255) PRIMARY KEY,event_type VARCHAR(100) NOT NULL,processed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,INDEX idx_stripe_event_time(processed_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}

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

function rateLimit({ windowMs, max, name }) {
  const hits = new Map();
  return (req, res, next) => {
    if (process.env.DISABLE_RATE_LIMITS === 'true') return next();
    const now = Date.now();
    const key = `${name}:${req.ip || req.socket.remoteAddress || 'unknown'}`;
    let item = hits.get(key);
    if (!item || item.resetAt <= now) item = { count: 0, resetAt: now + windowMs };
    item.count += 1;
    hits.set(key, item);
    if (hits.size > 5000) for (const [entryKey, value] of hits) if (value.resetAt <= now) hits.delete(entryKey);
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - item.count)));
    res.setHeader('RateLimit-Reset', String(Math.ceil(item.resetAt / 1000)));
    if (item.count > max) { res.setHeader('Retry-After', String(Math.ceil((item.resetAt - now) / 1000))); return res.status(429).json({ error: 'Too many requests. Please try again later.' }); }
    next();
  };
}

const limits = {
  bootstrap: rateLimit({ windowMs: 15 * 60 * 1000, max: 20, name: 'bootstrap' }),
  billing: rateLimit({ windowMs: 15 * 60 * 1000, max: 20, name: 'billing' }),
  feedback: rateLimit({ windowMs: 60 * 60 * 1000, max: 10, name: 'feedback' }),
  sharing: rateLimit({ windowMs: 60 * 60 * 1000, max: 30, name: 'sharing' }),
  publicShare: rateLimit({ windowMs: 60 * 1000, max: 60, name: 'public-share' }),
  cron: rateLimit({ windowMs: 15 * 60 * 1000, max: 10, name: 'cron' })
};

async function auth(req, res, next) {
  try {
    const key = readBearer(req);
    if (!installationKeyOk(key)) return res.status(401).json({ error: 'Authentication required.' });
    const connection = await db();
    const [rows] = await connection.execute('SELECT * FROM pamet_users WHERE device_key_hash=? LIMIT 1', [sha(key)]);
    if (!rows.length) return res.status(401).json({ error: 'Authentication required.' });
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
  const valid = !!(price.active && price.currency === 'usd' && price.unit_amount === expected.amount && price.recurring && price.recurring.interval === expected.interval);
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

app.get('/api/health', (req, res) => res.json({ ok: true, version: VERSION }));
app.get('/api/ready', async (req, res) => { try { const connection = await db(); await connection.query('SELECT 1'); res.json({ ok: true, version: VERSION }); } catch { res.status(503).json({ ok: false, version: VERSION }); } });

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
    let created = false;
    if (user) {
      if (user.device_key_hash !== keyHash) return res.status(403).json({ error: 'This device credential does not match the account.' });
      await connection.execute('UPDATE pamet_users SET email=?,first_name=?,last_name=?,timezone=? WHERE id=?', [email, first, last, timezone, user.id]);
    } else {
      if (rows.some((row) => row.email === email)) return res.status(409).json({ error: 'This email is already linked to another Pamet installation.' });
      const [result] = await connection.execute('INSERT INTO pamet_users(local_user_id,device_key_hash,email,first_name,last_name,timezone) VALUES(?,?,?,?,?,?)', [local, keyHash, email, first, last, timezone]);
      const [fresh] = await connection.execute('SELECT * FROM pamet_users WHERE id=?', [result.insertId]);
      user = fresh[0]; created = true;
    }
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
    const connectionPool = await db();
    const connection = await connectionPool.getConnection();
    try { await connection.beginTransaction(); await connection.execute('DELETE FROM pamet_audit_log WHERE user_id=?', [req.user.id]); await connection.execute('DELETE FROM pamet_users WHERE id=?', [req.user.id]); await connection.commit(); }
    catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
    res.json({ deleted: true });
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
    res.status(201).json({ saved: true });
  } catch (error) { next(error); }
});

app.get('/api/billing/config', (req, res) => res.json({ publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '', proEnabled: !!(stripe && prices.pro.monthly && prices.pro.annual), ultraEnabled: !!(ultraEnabled && stripe && prices.ultra.monthly && prices.ultra.annual), emailEnabled: !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM) }));
app.get('/api/billing/status', auth, (req, res) => res.json({ user: publicUser(req.user) }));

app.post('/api/billing/create-subscription', limits.billing, auth, async (req, res, next) => {
  try {
    if (!stripe) return res.status(503).json({ error: 'Stripe is not configured.' });
    const plan = req.body.plan;
    const interval = req.body.interval;
    const checkoutAttemptId = clean(req.body.checkoutAttemptId, 64);
    if (!['pro', 'ultra'].includes(plan) || !['monthly', 'annual'].includes(interval) || !attemptIdOk(checkoutAttemptId)) return res.status(400).json({ error: 'A valid plan, interval, and checkout attempt are required.' });
    if (plan === 'ultra' && !ultraEnabled) return res.status(409).json({ error: 'Ultra is not available for purchase yet.' });
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
app.use('/css', express.static(path.join(__dirname, 'css'), staticOptions));
app.use('/js', express.static(path.join(__dirname, 'js'), staticOptions));
app.get(['/', '/index.html'], (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/share.html', (req, res) => res.sendFile(path.join(__dirname, 'share.html')));
app.get('/manifest.webmanifest', (req, res) => res.type('application/manifest+json').sendFile(path.join(__dirname, 'manifest.webmanifest')));
app.get('/sw.js', (req, res) => { res.setHeader('Service-Worker-Allowed', '/'); res.sendFile(path.join(__dirname, 'sw.js')); });
app.use((req, res) => res.status(404).json({ error: 'Not found.' }));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = error.type === 'entity.too.large' ? 413 : error instanceof SyntaxError && error.status === 400 ? 400 : Number(error.status || 500);
  console.error('request_failed', { requestId: req.requestId, method: req.method, path: req.path, status, message: error.message });
  const message = status === 413 ? 'Request is too large.' : status === 400 ? 'Invalid JSON request.' : NODE_ENV === 'production' ? 'Pamet could not complete that request.' : error.message;
  res.status(status).json({ error: message, requestId: req.requestId });
});

if (require.main === module) app.listen(PORT, () => console.log(`Pamet v${VERSION} listening on ${PORT}`));
module.exports = app;
