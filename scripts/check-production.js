'use strict';

const fs = require('fs');
const server = fs.readFileSync('server.js', 'utf8');
const secureServer = fs.readFileSync('secure-server.js', 'utf8');
const app = fs.readFileSync('js/app.js', 'utf8');
const billing = fs.readFileSync('js/v1.0.3.js', 'utf8');
const auth = fs.readFileSync('js/auth.js', 'utf8');
const share = fs.readFileSync('share.html', 'utf8');
const schema = fs.readFileSync('db/schema.sql', 'utf8');

function check(condition, message) { if (!condition) throw new Error(message); }

check(!server.includes("express.static(path.join(__dirname),"), 'The repository root must never be public.');
check(server.includes("app.use('/assets'") && server.includes("app.use('/css'") && server.includes("app.use('/js'"), 'Static files must use explicit allowlisted mounts.');
check(server.includes('immutable: false') && server.includes('maxAge: 0'), 'Unversioned application assets must revalidate after deployments.');
check(server.includes('Content-Security-Policy') && server.includes('Strict-Transport-Security') && server.includes("app.disable('x-powered-by')"), 'Production security headers must remain enabled.');
check(server.includes('function rateLimit') && server.includes('limits.billing') && server.includes('limits.sharing'), 'Sensitive handlers must remain rate limited.');
check(server.includes('priceIsValid') && [699, 5999, 1299, 9999].every((amount) => server.includes(`amount: ${amount}`)), 'Stripe prices must be verified against the approved catalog.');
check(server.includes('idempotencyKey') && server.includes('pamet_stripe_events') && server.includes('INSERT IGNORE INTO pamet_stripe_events'), 'Stripe writes and webhooks must be idempotent.');
check(server.includes("app.get('/api/ready'") && server.includes("app.get('/api/health'"), 'Health and dependency readiness handlers are required.');
check((secureServer.match(/app\.listen/g) || []).length === 1 && !secureServer.includes('/api/stripe/webhook'), 'The runtime wrapper must not duplicate application handlers.');
check(!app.includes('S.setPlan("pro")'), 'The browser must never grant its own paid entitlement.');
check(app.includes('/^[=+\\-@]/') && app.includes('S.exportAllData().profiles'), 'Exports must cover every profile and neutralize spreadsheet formulas.');
check(app.includes('if (addSymptomButton && newSymptomInput)'), 'Startup must tolerate the retired custom-symptom settings card.');
check(billing.includes('checkoutAttemptId') && billing.includes('crypto.randomUUID()'), 'Checkout requests must include an idempotency attempt ID.');
check(auth.includes('ROUNDS=600000') && auth.includes('global.crypto.getRandomValues') && !auth.includes('Math.random().toString(16)'), 'Password hashing and credentials must use production-strength Web Crypto.');
check(!share.includes('contribute') && share.includes("d.permission==='download'"), 'Share permissions must be limited to implemented view/download behavior.');
check(schema.includes('pamet_stripe_events'), 'The deployable schema must include webhook idempotency storage.');

console.log('Pamet production hardening checks passed.');
