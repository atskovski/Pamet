'use strict';

const fs = require('fs');
const vm = require('vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const securityUi = fs.readFileSync('js/security-v1.1.0.js', 'utf8');
const authUi = fs.readFileSync('js/auth.js', 'utf8');
const feedbackUi = fs.readFileSync('js/feedback-v1.0.3.js', 'utf8');
const releaseCss = fs.readFileSync('css/release-v1.1.0.css', 'utf8');
const secureServer = fs.readFileSync('secure-server.js', 'utf8');
const edgeAccount = fs.readFileSync('lib/edge-account.js', 'utf8');
const qrSource = fs.readFileSync('js/qr-v1.2.0.js', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');

test('all security and recovery dialogs use the centered Pamet modal backdrop', () => {
  assert.match(securityUi, /pamet-modal-backdrop security-overlay/);
  assert.doesNotMatch(securityUi, /className\s*=\s*["']modal-overlay security-overlay/);
  assert.match(releaseCss, /\.pamet-modal-backdrop[\s\S]*position:\s*fixed!important/);
  assert.match(releaseCss, /place-items:\s*center!important/);
  assert.match(releaseCss, /max-height:\s*calc\(100dvh/);
});

test('password reset keeps a stable form reference across asynchronous work', () => {
  assert.match(securityUi, /const submittedForm = event\.currentTarget/);
  assert.match(securityUi, /submittedForm\.reset\(\)/);
  assert.doesNotMatch(securityUi, /await[\s\S]{0,500}event\.currentTarget\.reset\(\)/);
});

test('login keeps an explicit create-account path', () => {
  assert.match(index, /id="showRegister">Create one<\/a>/);
  assert.match(securityUi, /switcher\.hidden = false/);
  assert.match(securityUi, /createLink\.hidden = false/);
});

test('legacy accounts migrate to server password sessions instead of dead-ending on recovery', () => {
  assert.match(authUi, /\/api\/auth\/legacy-upgrade/);
  assert.match(authUi, /delete u\.deviceKey/);
  assert.doesNotMatch(authUi, /This account still uses legacy device access/);
  assert.match(secureServer, /app\.post\('\/api\/auth\/legacy-upgrade'/);
  assert.match(edgeAccount, /identity\.legacy_password_upgraded/);
});

test('global sign-out revokes server sessions and clears the local session marker', () => {
  assert.match(authUi, /endAllSessions\(\)/);
  assert.match(authUi, /\/api\/auth\/logout-all/);
  assert.match(edgeAccount, /UPDATE pamet_sessions SET revoked_at=NOW\(\) WHERE user_id=\?/);
  assert.match(edgeAccount, /identity\.all_sessions_revoked/);
});

test('authenticator setup is local, fresh, QR-enabled, and confirmation-gated', () => {
  assert.match(securityUi, /\/api\/security\/mfa\/setup/);
  assert.match(securityUi, /PametQr\?\.svg/);
  assert.match(securityUi, /\/api\/security\/mfa\/confirm/);
  assert.match(securityUi, /Each time you start setup, Pamet creates a new secret/);
  assert.doesNotMatch(securityUi, /chart\.googleapis|api\.qrserver|quickchart|qrcode\.monkey/i);
});

test('private QR encoder produces a bounded version-10 SVG without network access', () => {
  const sandbox = { window: {}, TextEncoder, Uint8Array, Array, Math, Error };
  vm.createContext(sandbox);
  vm.runInContext(qrSource, sandbox);
  const qr = sandbox.window.PametQr;
  assert.ok(qr);
  const uri = 'otpauth://totp/Pamet:test@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Pamet&digits=6&period=30';
  const matrix = qr.matrix(uri);
  assert.equal(matrix.length, 57);
  assert.equal(matrix.every((row) => row.length === 57), true);
  assert.equal(matrix.flat().some(Boolean), true);
  const svg = qr.svg(uri);
  assert.match(svg, /^<svg/);
  assert.match(svg, /Authenticator setup QR code/);
  assert.doesNotMatch(qrSource, /fetch\(|XMLHttpRequest|https?:\/\//);
});

test('feedback success is prominent and automatically clears after five seconds', () => {
  assert.match(feedbackUi, /feedback-success/);
  assert.match(feedbackUi, /5000/);
  assert.match(releaseCss, /#feedbackStatus\.feedback-success/);
  assert.match(releaseCss, /text-align:\s*center/);
});

test('mobile layout covers safe areas, narrow phones, and input zoom prevention', () => {
  assert.match(releaseCss, /env\(safe-area-inset-top\)/);
  assert.match(releaseCss, /@media\(max-width:390px\)/);
  assert.match(releaseCss, /@media\(max-width:340px\)/);
  assert.match(releaseCss, /font-size:\s*16px!important/);
  assert.match(releaseCss, /\.app-shell\s*\{[^}]*width:\s*100vw/);
});

test('script CSP no longer permits executable inline script attributes', () => {
  assert.match(secureServer, /script-src-attr 'none'/);
  assert.match(secureServer, /replace\("script-src 'self' 'unsafe-inline'", "script-src 'self'"\)/);
  const authHeaderBlock = secureServer.match(/function authSecurityHeaders[\s\S]*?function parseAuthJson/)[0];
  assert.doesNotMatch(authHeaderBlock, /script-src 'self' 'unsafe-inline'/);
});
