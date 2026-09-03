'use strict';

const fs = require('fs');
const main = fs.readFileSync('js/main.js', 'utf8');
const cssMain = fs.readFileSync('css/main.css', 'utf8');
const mobileCss = fs.readFileSync('css/mobile.css', 'utf8');
const securityUi = fs.readFileSync('js/security.js', 'utf8');
const auth = fs.readFileSync('js/auth.js', 'utf8');
const switchUi = fs.readFileSync('js/account-switch.js', 'utf8');
const localEncryption = fs.readFileSync('js/local-encryption.js', 'utf8');
const ci = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
const secureServer = fs.readFileSync('secure-server.js', 'utf8');
const assurance = fs.readFileSync('docs/EXTERNAL_ASSURANCE_READINESS.md', 'utf8');

function check(condition, message) { if (!condition) throw new Error(message); }

check(main.includes('./account-switch.js'), 'Production bundle must include safe account switching.');
check(main.includes('./qr-sharing.js') && main.includes('./security.js'), 'Authenticator QR/security modules must ship together.');
check(!main.includes('./local-encryption.js'), 'Local encryption must remain disabled until independent review approves migration enablement.');
check(cssMain.includes('./mobile.css'), 'Mobile viewport overrides must remain in the production style pipeline.');
check(mobileCss.includes('place-items:center!important') && mobileCss.includes('height:100dvh!important'), 'Security/recovery dialogs must be viewport-centered.');
check(mobileCss.includes('font-size:16px!important'), 'Mobile form controls must prevent iOS focus zoom.');
check(mobileCss.includes('#feedbackStatus.feedback-success') && mobileCss.includes('position:fixed!important'), 'Feedback confirmation must be prominent and centered.');
check(securityUi.includes('PametQr?.svg') && securityUi.includes('/api/security/mfa/confirm'), 'Authenticator setup must render a QR and require verification.');
check(auth.includes('/api/auth/legacy-upgrade') && !auth.includes('This account still uses legacy device access'), 'Legacy sign-in must auto-upgrade rather than dead-end.');
check(switchUi.includes('Use a different account') && switchUi.includes('S.wipeAll()'), 'Cross-account switching must explicitly isolate browser-local health data.');
check(localEncryption.includes('enabled: false') && localEncryption.includes('reviewRequired: true') && localEncryption.includes('staged-not-committed'), 'Local encryption framework must remain review-gated and non-committing.');
check(ci.includes('backup-restore-drill.sh'), 'CI must execute the database backup/restore drill.');
check(secureServer.includes("script-src-attr 'none'") && secureServer.includes("style-src-attr 'none'") && secureServer.includes('hardenedCsp'), 'Strict script/style CSP hardening must remain enabled.');
check(assurance.includes('independent penetration-test report') && assurance.includes('accessibility review') && assurance.includes('BAA'), 'External assurance evidence pack must cover security, accessibility, and legal/vendor posture.');

console.log('Pamet UI/security production gates passed.');
