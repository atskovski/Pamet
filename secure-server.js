'use strict';

// Backwards-compatible deployment entry point. The reviewed Express application
// remains in server.js; this edge wrapper adds account-keyed login throttling,
// breached-password screening, legacy identity migration, release normalization,
// server-rendered release identity, CSP enforcement, and release-safe scheduled jobs.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const VERSION = require('./package.json').version;
const inner = require('./server');
const { distributedRateLimit } = require('./lib/rate-limit');
const { breachedPassword } = require('./lib/security');
const { legacyUpgrade, logoutAll } = require('./lib/edge-account');
const { appointmentReminderJob } = require('./lib/appointment-reminders');
const { createPlatformFoundation } = require('./lib/platform-foundation');
const { createPlatformRouter } = require('./routes/platform');

const app = express();
const port = Number(process.env.PORT || 8080);
const nodeEnv = process.env.NODE_ENV || 'development';
const platform = createPlatformFoundation({ version: VERSION, nodeEnv });
const json = express.json({ limit: '256kb', strict: true });
const sha = (value) => crypto.createHash('sha256').update(String(value || '')).digest('hex');
const normalizedEmail = (req) => String(req.body && req.body.email || '').trim().toLowerCase().slice(0, 254);
const releaseAssetVersion = VERSION.replace(/\D/g, '') || 'current';
const indexTemplate = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const versionedIndex = indexTemplate
  .replace(/Pamet v\d+\.\d+\.\d+ · Your health history, finally useful\./g, `Pamet v${VERSION} · Your health history, finally useful.`)
  .replace(/dist\/pamet\.min\.css\?v=\d+/g, `dist/pamet.min.css?v=${releaseAssetVersion}`)
  .replace(/dist\/pamet\.min\.js\?v=\d+/g, `dist/pamet.min.js?v=${releaseAssetVersion}`)
  .replace('class="metric-icon" style="--icon-bg:var(--warm-light)"', 'class="metric-icon tone-warm"')
  .replace('class="metric-icon" style="--icon-bg:var(--sage-light)"', 'class="metric-icon tone-sage"')
  .replace('class="metric-badge" data-badge="+3 vs last" style="--badge:var(--warm-terracotta)"', 'class="metric-badge tone-terracotta" data-badge="+3 vs last"')
  .replace('class="metric-badge" data-badge="Improving" style="--badge:var(--sage-green)"', 'class="metric-badge tone-sage" data-badge="Improving"')
  .replace('class="metric-badge" data-badge="Watch" style="--badge:var(--rose-pink)"', 'class="metric-badge tone-rose" data-badge="Watch"')
  .replace('class="metric-badge" data-badge="Pamet active" style="--badge:var(--sage-green)"', 'class="metric-badge tone-sage" data-badge="Pamet active"')
  .replace('<i style="background:var(--warm-light)"></i>', '<i class="legend-swatch tone-warm"></i>')
  .replace('<i style="background:var(--rose-light)"></i>', '<i class="legend-swatch tone-rose"></i>')
  .replace('<i style="background:var(--sage-light)"></i>', '<i class="legend-swatch tone-sage"></i>')
  .replace(/\s*<script>\s*\/\/ Register the service worker[\s\S]*?<\/script>/, '');

function hardenedCsp(value) {
  let policy = String(value || '')
    .replace("script-src 'self' 'unsafe-inline'", "script-src 'self'")
    .replace("style-src 'self' 'unsafe-inline'", "style-src 'self'")
    .replace('; style-src', "; script-src-attr 'none'; style-src");
  if (!policy.includes('style-src-attr')) policy = policy.replace('; font-src', "; style-src-attr 'none'; font-src");
  return policy;
}

app.use((req, res, next) => {
  const setHeader = res.setHeader.bind(res);
  res.setHeader = (name, value) => setHeader(name, String(name).toLowerCase() === 'content-security-policy' ? hardenedCsp(value) : value);
  res.setHeader('X-Pamet-Version', VERSION);
  next();
});

/* Edge request context adds request IDs and bounded in-memory runtime telemetry without storing health data. */
app.use(platform.middleware);
app.use(createPlatformRouter(platform));

app.use('/api', (req, res, next) => {
  const authorization = String(req.headers.authorization || '');
  const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (/^[a-f0-9]{64}$/i.test(bearer) && !req.path.startsWith('/jobs/') && req.path !== '/metrics') {
    console.log(JSON.stringify({ service: 'pamet', version: VERSION, event: 'identity.legacy_bearer_observed', method: req.method, path: req.path, requestId: req.pametRequestId || null, at: new Date().toISOString() }));
  }
  next();
});

function authSecurityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(self "https://js.stripe.com")');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' https://js.stripe.com https://*.js.stripe.com; script-src-attr 'none'; style-src 'self' https://fonts.googleapis.com; style-src-attr 'none'; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://*.stripe.com; connect-src 'self' https://api.stripe.com https://*.stripe.com https://link.com https://*.link.com; frame-src https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com https://link.com https://*.link.com");
  res.setHeader('Cache-Control', 'no-store');
  if (nodeEnv === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
}

function parseAuthJson(req, res, next) {
  json(req, res, (error) => {
    if (error) return res.status(400).json({ error: 'Invalid JSON request.' });
    next();
  });
}

function renderVersionedIndex(req, res) {
  res.type('html').set('Cache-Control', 'no-store').send(versionedIndex);
}

const accountLoginLimit = distributedRateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  name: 'login-account',
  keyGenerator: (req) => `email:${sha(normalizedEmail(req) || 'missing')}`
});

const passwordSafetyLimit = distributedRateLimit({ windowMs: 15 * 60 * 1000, max: 10, name: 'password-safety' });

async function rejectBreachedPassword(req, res, next) {
  const password = String(req.body && (req.body.newPassword || req.body.password) || '');
  if (password.length < 12) return next();
  if (nodeEnv === 'test' && process.env.DISABLE_BREACHED_PASSWORD_CHECK === 'true') return next();
  try {
    if (await breachedPassword(password)) return res.status(400).json({ error: 'Choose a password that has not appeared in known data breaches.' });
  } catch (error) {
    console.warn('breached_password_check_failed', { message: error.message });
  }
  next();
}

app.use('/api/auth', authSecurityHeaders);
app.get('/api/health', authSecurityHeaders, (req, res) => res.json({ ok: true, version: VERSION }));

/* Service-worker scripts must bypass intermediary/browser HTTP caching so an old controller can discover a new release. */
app.get('/sw.js', (req, res) => {
  res.setHeader('Service-Worker-Allowed', '/');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.type('application/javascript').sendFile(path.join(__dirname, 'sw.js'));
});

app.use('/api/ready', (req, res, next) => {
  const sendJson = res.json.bind(res);
  res.json = (body) => sendJson(body && typeof body === 'object' ? { ...body, version: VERSION } : body);
  next();
});

app.get(['/', '/index.html'], authSecurityHeaders, renderVersionedIndex);

app.post('/api/auth/login', parseAuthJson, accountLoginLimit);
app.post('/api/auth/register', parseAuthJson, passwordSafetyLimit, rejectBreachedPassword);
app.post('/api/auth/password', parseAuthJson, passwordSafetyLimit, rejectBreachedPassword);
app.post('/api/auth/legacy-upgrade', parseAuthJson, passwordSafetyLimit, rejectBreachedPassword, legacyUpgrade);
app.post('/api/auth/logout-all', parseAuthJson, logoutAll);
app.post('/api/jobs/appointment-reminders', json, appointmentReminderJob);
app.use(inner);
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = Number(error.status || 500);
  platform.recordFailure({ requestId: req.pametRequestId || null, method: req.method, path: platform.safePath(req), status, message: error.message });
  console.error('secure_edge_error', { requestId: req.pametRequestId || null, path: req.path, message: error.message });
  res.status(status).json({ error: status === 503 ? 'Service temporarily unavailable.' : 'Request failed.' });
});

if (require.main === module) app.listen(port, () => console.log(`Pamet v${VERSION} listening securely on ${port}`));

module.exports = app;
