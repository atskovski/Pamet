'use strict';

const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const version = pkg.version;
const expected = '1.2.2';
const secureServer = fs.readFileSync('secure-server.js', 'utf8');
const main = fs.readFileSync('js/main.js', 'utf8');
const feedback = fs.readFileSync('js/feedback-v1.0.3.js', 'utf8');
const worker = fs.readFileSync('sw.js', 'utf8');
const bundle = fs.readFileSync('dist/pamet.min.js', 'utf8');
const readme = fs.readFileSync('README.md', 'utf8');
const changelog = fs.readFileSync('CHANGELOG.md', 'utf8');

function check(condition, message) { if (!condition) throw new Error(message); }

check(version === expected, `package.json must identify Pamet ${expected}.`);
check(pkg.scripts.start.startsWith('npm run build &&'), 'Production startup must rebuild the browser bundle before serving traffic.');
check(Boolean(pkg.dependencies && pkg.dependencies.esbuild), 'Production startup build requires esbuild to be a production dependency.');
check(secureServer.includes("require('./package.json').version"), 'The production edge must source its version from package.json.');
check(secureServer.includes("app.get('/api/health'") && secureServer.includes('version: VERSION'), 'The production health endpoint must report the canonical release version.');
check(secureServer.includes("app.use('/api/ready'") && secureServer.includes('{ ...body, version: VERSION }'), 'The readiness endpoint must be normalized to the canonical release version.');
check(secureServer.includes('renderVersionedIndex') && secureServer.includes('X-Pamet-Version'), 'The production edge must render release identity into HTML and response headers.');
check(main.includes(`const PAMET_VERSION = '${expected}'`), 'Browser runtime fallback version must match package.json.');
check(main.includes("fetch('/api/health'") && main.includes('applyReleaseVersion(health.version)'), 'Settings version must reconcile against the deployed health endpoint.');
check(main.includes("navigator.serviceWorker.register('sw.js?v=1220')"), 'PWA registration must reference the current release worker.');
check(feedback.includes('window.PametVersion ||'), 'Feedback must use the browser runtime version instead of a release literal.');
check(worker.includes(`Pamet v${expected}`) && worker.includes('pamet-shell-v122-0'), 'Service worker cache/version must match the release.');
check(bundle.includes('/api/health') && bundle.includes(expected) && bundle.includes('Your health history, finally useful.'), 'The generated production bundle must contain live version reconciliation for the current release.');
check(readme.includes(`Version ${expected}`) && readme.includes('Current State'), 'README must state the current release and current state.');
check(changelog.includes(`## [${expected}]`), 'CHANGELOG must contain the current release.');

console.log(`Pamet ${expected} version checks passed.`);
