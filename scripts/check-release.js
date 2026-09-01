'use strict';

const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('css/styles.css', 'utf8');
const store = fs.readFileSync('js/store.js', 'utf8');
const app = fs.readFileSync('js/app.js', 'utf8');
const server = fs.readFileSync('server.js', 'utf8');
const manifest = JSON.parse(fs.readFileSync('manifest.webmanifest', 'utf8'));
const worker = fs.readFileSync('sw.js', 'utf8');

function check(condition, message) {
  if (!condition) throw new Error(message);
}

check(
  html.includes('href="css/brand-v1.0.3.css" data-pamet-brand-v103'),
  'The v1.0.3 brand stylesheet must be loaded directly.'
);
check(
  html.includes('src="js/v1.0.3.js" data-pamet-v103'),
  'The v1.0.3 runtime must be loaded directly.'
);
check(
  html.indexOf('src="js/app.js"') < html.indexOf('src="js/v1.0.3.js"'),
  'The v1.0.3 runtime must load after the base app.'
);
check(
  /\[hidden\]\s*\{[^}]*display:\s*none\s*!important\s*;?[^}]*\}/.test(css),
  'Every native hidden state must remain hidden.'
);
check(
  !html.includes('id="customSymptomList"') && !html.includes('>Custom symptoms<'),
  'The retired Custom symptoms settings card must not be rendered.'
);
check(
  html.includes('Pamet v2.0.1 · Your health history, finally useful.'),
  'The visible footer must identify Pamet v2.0.1.'
);
check(
  html.includes('Don’t have an account?') && /id="registerForm" hidden/.test(html),
  'Registration must remain a deliberate secondary action.'
);
check(
  !/id="reg(?:First|Last)Name"[^>]*value=/.test(html) && !/id="reg(?:First|Last)Name"[^>]*placeholder=/.test(html),
  'Registration names must never be prefilled or presented as example profiles.'
);
check(
  html.includes('id="homeEmptyState" hidden') && html.includes('id="metricsGrid" hidden') && html.includes('id="recentSection" hidden'),
  'New-user dashboard content must start in the empty state.'
);
check(
  store.includes('return [];') && !store.includes('function sampleEntries'),
  'New users must start with no sample health entries.'
);
check(
  app.includes('Entry saved — Pamet is updating your patterns.') && html.includes('Entry saved! Pamet is updating your patterns.'),
  'Saved-entry feedback must use Pamet language.'
);
check(
  html.includes('Pamet pattern detection') && !html.includes('Improve AI (anonymous)'),
  'Settings must use Pamet pattern and product-feedback language.'
);
check(
  server.includes("app.post('/api/feedback', limits.feedback, auth") && server.includes('pamet_feedback'),
  'Product feedback must be authenticated in transit and stored without account fields.'
);
check(
  manifest.display === 'standalone' && manifest.icons.some((icon) => icon.sizes === '192x192') && manifest.icons.some((icon) => icon.sizes === '512x512'),
  'The PWA manifest must include standalone display and phone-sized icons.'
);
check(
  worker.includes('pamet-shell-v201') && !worker.slice(0, worker.indexOf('const PATHS')).includes('/api/'),
  'The Phase 2 service worker must use a fresh cache and never list API data in the shell.'
);

console.log('Pamet Phase 2 release checks passed.');
