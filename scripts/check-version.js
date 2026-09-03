'use strict';

const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const version = pkg.version;
const expected = '1.2.3';
const secureServer = fs.readFileSync('secure-server.js', 'utf8');
const main = fs.readFileSync('js/main.js', 'utf8');
const feedback = fs.readFileSync('js/feedback-v1.0.3.js', 'utf8');
const worker = fs.readFileSync('sw.js', 'utf8');
const updateFlow = fs.readFileSync('js/version-update-v1.2.3.js', 'utf8');
const bundle = fs.readFileSync('dist/pamet.min.js', 'utf8');
const readme = fs.readFileSync('README.md', 'utf8');
const changelog = fs.readFileSync('CHANGELOG.md', 'utf8');

function check(condition, message) { if (!condition) throw new Error(message); }

check(version === expected, `package.json must identify Pamet ${expected}.`);
check(pkg.scripts.start === 'node secure-server.js', 'Production startup must launch the server immediately without rebuilding the deployment filesystem.');
check(!pkg.scripts.postinstall, 'Do not run the bundle build from postinstall; Wasmer installs dependencies before copying application source.');
check(pkg.scripts.build && pkg.scripts.build.includes('esbuild js/main.js'), 'Production build command must bundle the current application source.');
check(Boolean(pkg.dependencies && pkg.dependencies.esbuild), 'Production deployment build requires esbuild to be a production dependency.');
check(secureServer.includes("require('./package.json').version"), 'The production edge must source its version from package.json.');
check(secureServer.includes("app.get('/api/health'") && secureServer.includes('version: VERSION'), 'The production health endpoint must report the canonical release version.');
check(secureServer.includes("app.use('/api/ready'") && secureServer.includes('{ ...body, version: VERSION }'), 'The readiness endpoint must be normalized to the canonical release version.');
check(secureServer.includes('renderVersionedIndex') && secureServer.includes('X-Pamet-Version'), 'The production edge must render release identity into HTML and response headers.');
check(main.includes(`const PAMET_VERSION = '${expected}'`) && main.includes('window.PametLoadedVersion = PAMET_VERSION'), 'Browser runtime must expose the actually loaded release version.');
check(main.includes('protectReleaseFooter()') && main.includes('new MutationObserver'), 'The release entrypoint must protect the Settings footer from legacy feature-layer version writes.');
check(main.includes("fetch('/api/health'") && main.includes('PametOfferVersionUpdate?.(health.version)'), 'A newer server release must trigger the safe update prompt instead of disguising the loaded version.');
check(!main.includes('applyReleaseVersion(health.version)'), 'A stale bundle must never overwrite its displayed loaded version with the server version.');
check(main.includes("navigator.serviceWorker.register('sw.js?v=1230')"), 'PWA registration must reference the current release worker.');
check(main.includes('version-update-v1.2.3.js'), 'The production bundle must load the safe new-version update flow.');
check(updateFlow.includes('New Pamet version available') && updateFlow.includes('Update now') && updateFlow.includes('does not clear your saved Pamet data'), 'The update flow must provide a safe, explicit refresh prompt.');
check(updateFlow.includes('PametLoadedVersion') && updateFlow.includes("fetch(`/api/health?release_check=${Date.now()}`") && updateFlow.includes("cache: 'no-store'"), 'The update flow must compare the server release with the loaded bundle and bypass caches.');
check(feedback.includes('window.PametVersion ||'), 'Feedback must use the browser runtime version instead of a release literal.');
check(worker.includes(`Pamet v${expected}`) && worker.includes('pamet-shell-v123-0'), 'Service worker cache/version must match the release.');
check(worker.includes('SKIP_WAITING'), 'Service worker must support an explicit safe update activation message.');
check(bundle.includes('/api/health') && bundle.includes(expected) && bundle.includes('Your health history, finally useful.'), 'The generated production bundle must contain release identity for the current release.');
check(readme.includes(`Version ${expected}`) && readme.includes('Current State'), 'README must state the current release and current state.');
check(changelog.includes(`## [${expected}]`), 'CHANGELOG must contain the current release.');

console.log(`Pamet ${expected} version checks passed.`);
