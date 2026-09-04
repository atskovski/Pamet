'use strict';

const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const assetVersion = pkg.version.replace(/\D/g, '');
const versionParts = pkg.version.split('.').map(Number);
const previousPatch = `${versionParts[0]}.${versionParts[1]}.${Math.max(0, versionParts[2] - 1)}`;
const previousAssetVersion = previousPatch.replace(/\D/g, '');
const hotfixStatus = fs.existsSync('HOTFIX_STATUS.md') ? fs.readFileSync('HOTFIX_STATUS.md', 'utf8') : '';
const inheritedPatchShell = hotfixStatus.includes(`# Pamet ${pkg.version}`) && hotfixStatus.includes(`Base release: **Pamet ${previousPatch}**`);
const server = fs.readFileSync('server.js', 'utf8');
const secureServer = fs.readFileSync('secure-server.js', 'utf8');
const edgeAccount = fs.readFileSync('lib/edge-account.js', 'utf8');
const app = fs.readFileSync('js/app.js', 'utf8');
const main = fs.readFileSync('js/main.js', 'utf8');
const billing = fs.readFileSync('js/billing-sharing.js', 'utf8');
const auth = fs.readFileSync('js/auth.js', 'utf8');
const securityUi = fs.readFileSync('js/security.js', 'utf8');
const qr = fs.readFileSync('js/qr-sharing.js', 'utf8');
const share = fs.readFileSync('share.html', 'utf8');
const schema = fs.readFileSync('db/schema.sql', 'utf8');
const limiter = fs.readFileSync('lib/rate-limit.js', 'utf8');
const notifications = fs.readFileSync('js/notifications.js', 'utf8');
const encryptedSync = fs.readFileSync('js/encrypted-sync.js', 'utf8');
const ci = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
const integrationTests = fs.readFileSync('tests/integration.test.js', 'utf8');
const uiTests = fs.readFileSync('tests/ui-hardening.test.js', 'utf8');
const cryptoUiTests = fs.readFileSync('tests/crypto-ui.test.js', 'utf8');
const backupDrill = fs.readFileSync('scripts/backup-restore-drill.sh', 'utf8');
const localEncryptionThreatModel = fs.readFileSync('LOCAL_ENCRYPTION_THREAT_MODEL.md', 'utf8');

function check(condition, message) { if (!condition) throw new Error(message); }

check(!server.includes("express.static(path.join(__dirname),"), 'The repository root must never be public.');
check(server.includes("app.use('/assets'") && server.includes("app.use('/dist'") && !server.includes("app.use('/js'") && !server.includes("app.use('/css'"), 'Production must expose only assets and built bundles, not source modules.');
check(server.includes('immutable: false') && server.includes('maxAge: 0'), 'Unversioned application assets must revalidate after deployments.');
const productionHtml = fs.readFileSync('index.html', 'utf8');
const currentBundleShell = productionHtml.includes(`dist/pamet.min.js?v=${assetVersion}`) && productionHtml.includes(`dist/pamet.min.css?v=${assetVersion}`);
const inheritedBundleShell = inheritedPatchShell && productionHtml.includes(`dist/pamet.min.js?v=${previousAssetVersion}`) && productionHtml.includes(`dist/pamet.min.css?v=${previousAssetVersion}`);
check(currentBundleShell || inheritedBundleShell, `Executable assets must use the Pamet ${pkg.version} release bundle URL or the explicitly inherited ${previousPatch} shell.`);
check(currentBundleShell || (secureServer.includes('.replace(/dist\\/pamet\\.min\\.css\\?v=\\d+/g, `dist/pamet.min.css?v=${releaseAssetVersion}`)') && secureServer.includes('.replace(/dist\\/pamet\\.min\\.js\\?v=\\d+/g, `dist/pamet.min.js?v=${releaseAssetVersion}`)')), 'Inherited executable shell assets require production-edge release-token normalization.');
check(!productionHtml.includes('?v=1200'), 'Historical v=1200 executable asset references must not return.');
check(main.includes(`navigator.serviceWorker.register('sw.js?v=${assetVersion}0', { updateViaCache: 'none' })`), `PWA service-worker registration must rotate with Pamet ${pkg.version} and bypass the worker HTTP cache.`);
check(main.includes('registration.update()'), 'PWA startup must actively check the release worker for updates.');
check(server.includes('Content-Security-Policy') && server.includes('Strict-Transport-Security') && server.includes("app.disable('x-powered-by')"), 'Production security headers must remain enabled.');
check(server.includes("script-src-attr 'none'") && server.includes("style-src-attr 'none'") && !server.includes("script-src 'self' 'unsafe-inline'") && !server.includes("style-src 'self' 'unsafe-inline'"), 'Inner application CSP must block inline script/style attributes and unsafe-inline execution/presentation.');
check(secureServer.includes("script-src-attr 'none'") && secureServer.includes("style-src-attr 'none'") && secureServer.includes('hardenedCsp'), 'Production edge CSP must preserve strict inline-attribute blocking.');
check(secureServer.includes("const VERSION = require('./package.json').version") && secureServer.includes("app.get('/api/health'") && secureServer.includes('version: VERSION'), 'The production edge must report the canonical package release version.');
check(secureServer.includes("app.get('/sw.js'") && secureServer.includes("Cache-Control', 'no-store, max-age=0'"), 'The production edge must force service-worker revalidation.');
check(server.includes("const VERSION = require('./package.json').version;"), 'The application server must use the same canonical package release version.');
check(secureServer.includes('renderVersionedIndex') && secureServer.includes('X-Pamet-Version'), 'Production HTML and headers must expose the canonical release version.');
check(server.includes('distributedRateLimit') && limiter.includes('REDIS_URL') && limiter.includes('pExpire') && server.includes('limits.billing'), 'Sensitive handlers must use shared Redis/Valkey rate limits.');
check(server.includes('priceIsValid') && [699, 5999, 1299, 9999].every((amount) => server.includes(`amount: ${amount}`)), 'Stripe prices must be verified against the approved catalog.');
check(server.includes('idempotencyKey') && server.includes('pamet_stripe_events') && server.includes('INSERT IGNORE INTO pamet_stripe_events'), 'Stripe writes and webhooks must be idempotent.');
check(server.includes("app.get('/api/ready'") && server.includes("app.get('/api/health'"), 'Health and dependency readiness handlers are required.');
check(server.includes('poolInitialization') && server.includes('await candidate.end()'), 'Database initialization must be single-flight and clean up failed pools.');
check(server.includes("process.env.AUTO_MIGRATE === 'true'") && server.includes("candidate.query('SELECT 1')"), 'Production startup must separate schema migrations from request readiness.');
check(server.includes('information_schema.COLUMNS') && !server.includes('ADD COLUMN IF NOT EXISTS'), 'Schema upgrades must support MySQL versions without ADD COLUMN IF NOT EXISTS.');
check((secureServer.match(/app\.listen/g) || []).length === 1 && !secureServer.includes('/api/stripe/webhook'), 'The runtime wrapper must not duplicate application handlers.');
check(!app.includes('S.setPlan("pro")'), 'The browser must never grant its own paid entitlement.');
check(app.includes('/^[=+\\-@]/') && app.includes('S.exportAllData().profiles'), 'Exports must cover every profile and neutralize spreadsheet formulas.');
check(app.includes('if (addSymptomButton && newSymptomInput)'), 'Startup must tolerate the retired custom-symptom settings card.');
check(billing.includes('checkoutAttemptId') && billing.includes('crypto.randomUUID()'), 'Checkout requests must include an idempotency attempt ID.');
check(auth.includes('ROUNDS=600000') && auth.includes('global.crypto.getRandomValues') && !auth.includes('Math.random().toString(16)'), 'Password hashing and credentials must use production-strength Web Crypto.');
check(auth.includes('/api/auth/legacy-upgrade') && auth.includes('delete u.deviceKey') && edgeAccount.includes('identity.legacy_password_upgraded'), 'Legacy accounts must migrate into server-password sessions instead of dead-ending on recovery.');
check(auth.includes('/api/auth/logout-all') && edgeAccount.includes('identity.all_sessions_revoked'), 'Users must be able to revoke all server sessions and return to login.');
check(!share.includes('contribute') && share.includes("d.permission==='download'"), 'Share permissions must be limited to implemented view/download behavior.');
check(schema.includes('pamet_stripe_events'), 'The deployable schema must include webhook idempotency storage.');
check(schema.includes('pamet_devices') && schema.includes('pamet_recovery_tokens') && schema.includes('pamet_mfa'), 'Device revocation, recovery, and MFA storage must be deployable.');
check(schema.includes('pamet_push_subscriptions') && server.includes("app.post('/api/jobs/push-reminders'") && notifications.includes('pushManager.subscribe'), 'Closed-app Web Push must include subscription and scheduled delivery paths.');
check(schema.includes('pamet_sync_blobs') && encryptedSync.includes('AES-GCM') && encryptedSync.includes('HKDF') && server.includes("app.put('/api/sync/:profileId'"), 'Ultra sync must encrypt in the browser and store only opaque blobs.');
check(schema.includes('pamet_sessions') && server.includes('HttpOnly; SameSite=Lax') && server.includes("app.post('/api/auth/login'"), 'Cross-device authentication must use revocable server sessions in HttpOnly cookies.');
check(server.includes("app.post('/api/account/recovery/request'") && server.includes('identity.password_reset') && server.includes('password_hash=?,password_salt=?'), 'Password recovery must send an expiring email link and reset the server password verifier.');
check(server.includes("app.get('/api/entitlements'") && server.includes("app.post('/api/appointments'"), 'Paid capabilities and Ultra appointment data must be enforced by the server.');
check(server.includes('LOG_DRAIN_URL') && server.includes('ALERT_WEBHOOK_URL') && server.includes("app.get('/api/metrics'"), 'Logs, alerts, and protected metrics must expose production integrations.');
check(server.includes('GRAFANA_OTLP_ENDPOINT') && server.includes("sendOtlp('logs'") && server.includes("sendOtlp('metrics'"), 'Grafana Cloud must receive OTLP logs and metrics through a least-privilege deployment token.');
check(securityUi.includes('pamet-modal-backdrop security-overlay') && securityUi.includes('PametQr?.svg') && qr.includes('never sends the encoded value to another service'), 'Account security must use centered in-app dialogs and local-only authenticator QR generation.');

check(ci.includes('integration:') && ci.includes('mysql:') && ci.includes('PAMET_INTEGRATION_TESTS') && ci.includes('npm run test:integration'), 'CI must retain the MySQL-backed production lifecycle integration gate.');
check(ci.includes('backup-restore-drill.sh') && backupDrill.includes('mysqldump') && backupDrill.includes('pamet_restore_drill'), 'CI must retain a disposable MySQL backup and separate-schema restore drill.');
check(uiTests.includes("require('node:test')") && uiTests.includes("require('node:assert/strict')") && uiTests.includes('legacy-upgrade') && uiTests.includes("script-src-attr 'none'") && uiTests.includes("style-src-attr 'none'"), 'UI/security regression tests must remain executable and cover legacy auth migration plus strict script/style CSP.');
check(cryptoUiTests.includes("require('../js/qr-sharing.js')") && cryptoUiTests.includes("require('../js/local-encryption.js')") && cryptoUiTests.includes('stageMigration'), 'Crypto UI regression tests must target the feature-owned QR and local-encryption modules.');
check(
  integrationTests.includes('/api/auth/register') && integrationTests.includes('/api/auth/password') && integrationTests.includes('/api/security/devices/') && integrationTests.includes('/api/sharing/invites') && integrationTests.includes('/api/share/') && integrationTests.includes('/api/stripe/webhook') && integrationTests.includes('/api/entitlements') && integrationTests.includes('/api/sync/') && integrationTests.includes('currentRevision'),
  'Integration coverage must retain auth, entitlement, device, sharing/revocation, Stripe, and encrypted-sync lifecycle assertions.'
);
check(
  localEncryptionThreatModel.includes('random per-profile DEK') && localEncryptionThreatModel.includes('user-held RRK') && localEncryptionThreatModel.includes('password reset') && localEncryptionThreatModel.includes('intentionally unrecoverable'),
  'Local encryption work must retain the explicit key/recovery threat-model gate before implementation.'
);

console.log(`Pamet ${pkg.version} production hardening checks passed.`);
