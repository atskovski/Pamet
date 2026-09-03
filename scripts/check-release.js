'use strict';

const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('css/styles.css', 'utf8');
const store = fs.readFileSync('js/store.js', 'utf8');
const app = fs.readFileSync('js/app.js', 'utf8');
const main = fs.readFileSync('js/main.js', 'utf8');
const updateFlow = fs.readFileSync('js/version-update-v1.2.3.js', 'utf8');
const server = fs.readFileSync('server.js', 'utf8');
const secureServer = fs.readFileSync('secure-server.js', 'utf8');
const manifest = JSON.parse(fs.readFileSync('manifest.webmanifest', 'utf8'));
const worker = fs.readFileSync('sw.js', 'utf8');

function check(condition, message) {
  if (!condition) throw new Error(message);
}

check(html.includes('href="dist/pamet.min.css?v=1200"'), 'The production CSS bundle must be loaded.');
check(html.includes('src="dist/pamet.min.js?v=1200"'), 'The production JavaScript bundle must be loaded.');
check(!html.includes('src="js/app.js') && !html.includes('href="css/phase2.css'), 'Legacy runtime layers must not load directly.');
check(/\[hidden\]\s*\{[^}]*display:\s*none\s*!important\s*;?[^}]*\}/.test(css), 'Every native hidden state must remain hidden.');
check(!html.includes('id="customSymptomList"') && !html.includes('>Custom symptoms<'), 'The retired Custom symptoms settings card must not be rendered.');
check(
  main.includes("const PAMET_VERSION = '1.2.3'") &&
  main.includes('window.PametLoadedVersion = PAMET_VERSION') &&
  main.includes('function applyReleaseVersion(version = PAMET_VERSION)') &&
  main.includes('protectReleaseFooter()') &&
  main.includes('new MutationObserver') &&
  main.includes('Pamet v${normalized} · Your health history, finally useful.') &&
  main.includes("fetch('/api/health'") &&
  main.includes('PametOfferVersionUpdate?.(health.version)') &&
  !main.includes('applyReleaseVersion(health.version)'),
  'The production browser runtime must identify and protect the actually loaded Pamet v1.2.3 while offering a newer server release without disguising stale code.'
);
check(
  secureServer.includes('renderVersionedIndex') &&
  secureServer.includes('Pamet v${VERSION} · Your health history, finally useful.') &&
  secureServer.includes('X-Pamet-Version'),
  'The production edge must make the rendered Settings version server-authoritative.'
);
check(html.includes('Don’t have an account?') && /id="registerForm" hidden/.test(html), 'Registration must remain a deliberate secondary action.');
check(!/id="reg(?:First|Last)Name"[^>]*value=/.test(html) && !/id="reg(?:First|Last)Name"[^>]*placeholder=/.test(html), 'Registration names must never be prefilled or presented as example profiles.');
check(html.includes('id="homeEmptyState" hidden') && html.includes('id="metricsGrid" hidden') && html.includes('id="recentSection" hidden'), 'New-user dashboard content must start in the empty state.');
check(store.includes('return [];') && !store.includes('function sampleEntries'), 'New users must start with no sample health entries.');
check(app.includes('Entry saved — Pamet is updating your patterns.') && html.includes('Entry saved! Pamet is updating your patterns.'), 'Saved-entry feedback must use Pamet language.');
check(html.includes('Pamet pattern detection') && !html.includes('Improve AI (anonymous)'), 'Settings must use Pamet pattern and product-feedback language.');
check(server.includes("app.post('/api/feedback', limits.feedback, auth") && server.includes('pamet_feedback'), 'Product feedback must be authenticated in transit and stored without account fields.');
check(manifest.display === 'standalone' && manifest.icons.some((icon) => icon.sizes === '192x192') && manifest.icons.some((icon) => icon.sizes === '512x512'), 'The PWA manifest must include standalone display and phone-sized icons.');
check(main.includes("navigator.serviceWorker.register('sw.js?v=1230')"), 'Service-worker registration must live in the external bundle and reference v1.2.3.');
check(worker.includes('pamet-shell-v123-0') && worker.includes('dist/pamet.min.js?v=123') && !worker.slice(0, worker.indexOf('const PATHS')).includes('/api/'), 'The v1.2.3 service worker must use a fresh bundled cache and never list API data in the shell.');
check(worker.includes('u.pathname.startsWith("/api/")||u.pathname.startsWith("/share")'), 'Service-worker fetch handling must bypass API and sensitive share routes.');
check(updateFlow.includes('New Pamet version available') && updateFlow.includes('Update now') && updateFlow.includes('Later'), 'The app must provide a visible new-version refresh prompt.');
check(updateFlow.includes('PametLoadedVersion') && updateFlow.includes('sessionStorage') && !updateFlow.includes('localStorage.clear') && !updateFlow.includes('indexedDB.deleteDatabase'), 'The update flow must compare against the loaded bundle and must not clear local health data.');

console.log('Pamet v1.2.3 release checks passed.');
