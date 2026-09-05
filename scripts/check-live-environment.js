'use strict';

const expectedVersion = require('../package.json').version;
const base = String(process.env.PAMET_BASE_URL || 'https://pamet.wasmer.app').replace(/\/$/, '');
const assetVersion = expectedVersion.replace(/\D/g, '') || 'current';

function fail(message) { console.error(`FAIL: ${message}`); process.exitCode = 1; }
function pass(message) { console.log(`PASS: ${message}`); }
async function json(path, expectedStatus = 200) {
  const response = await fetch(`${base}${path}`, { headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' }, cache: 'no-store', redirect: 'follow', signal: AbortSignal.timeout(15000) });
  const body = await response.json().catch(() => ({}));
  if (response.status !== expectedStatus) { fail(`${path} returned HTTP ${response.status}; expected ${expectedStatus}.`); return { response, body }; }
  pass(`${path} returned HTTP ${expectedStatus}.`); return { response, body };
}
async function stripeWebhookProbe() {
  const response = await fetch(`${base}/api/stripe/webhook`, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }, body: '{}', cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(15000) });
  const body = await response.json().catch(() => ({}));
  if (response.status === 400 && body.error === 'Invalid Stripe webhook.') { pass('Stripe webhook endpoint is configured and rejects unsigned requests'); return; }
  if (response.status === 503 && body.error === 'Stripe webhook not configured.') { fail('Stripe webhook endpoint is not configured in the deployed environment'); return; }
  fail(`Stripe webhook probe returned HTTP ${response.status} with an unexpected response.`);
}

(async () => {
  console.log(`Pamet real-environment acceptance: ${base}`);
  console.log(`Expected release from repository: ${expectedVersion}`);
  const nonce = Date.now();
  const root = await fetch(`${base}/?acceptance=${nonce}`, { headers: { Accept: 'text/html', 'Cache-Control': 'no-cache' }, cache: 'no-store', redirect: 'follow', signal: AbortSignal.timeout(15000) });
  const rootHtml = await root.text();
  if (root.ok) pass('application shell is reachable'); else fail(`application shell returned HTTP ${root.status}`);
  const rootVersion = root.headers.get('x-pamet-version');
  if (rootVersion === expectedVersion) pass(`application response header reports ${expectedVersion}`); else fail(`application X-Pamet-Version=${rootVersion || 'missing'}; expected ${expectedVersion}`);
  const expectedFooter = `Pamet v${expectedVersion} · Your health history, finally useful.`;
  if (rootHtml.includes(expectedFooter)) pass(`server-rendered Settings footer contains ${expectedVersion}`); else fail(`server-rendered Settings footer does not contain ${expectedFooter}`);

  const shellPatterns = {
    bootstrapJs: /(?:\/|\b)dist\/pamet\.bootstrap\.[a-f0-9]{12}\.js/,
    bootstrapCss: /(?:\/|\b)dist\/pamet\.styles\.[a-f0-9]{12}\.css/,
    featuresJs: /pamet-features-js[^>]+\/dist\/pamet\.features\.[a-f0-9]{12}\.js/,
    featuresCss: /pamet-features-css[^>]+\/dist\/pamet\.features\.[a-f0-9]{12}\.css/
  };
  if (Object.values(shellPatterns).every((pattern) => pattern.test(rootHtml)) && rootHtml.includes(`assets/pamet-mark.svg?v=${assetVersion}`)) pass('application shell references content-hashed performance bundles');
  else fail('application shell does not reference the expected content-hashed bootstrap/feature assets');
  if ((root.headers.get('link') || '').includes('rel=preload')) pass('application shell preloads critical bootstrap assets'); else fail('critical bootstrap Link preload header is missing');
  if (!rootHtml.includes('?v=1200')) pass('historical v=1200 shell token is absent'); else fail('historical v=1200 shell token is still present in production HTML');
  if (!/fonts\.googleapis\.com\/css2\?family=Georgia/i.test(rootHtml)) pass('redundant Georgia Google Fonts request is absent'); else fail('production HTML still requests Georgia from Google Fonts');
  if (!rootHtml.includes('navigator.serviceWorker.register')) pass('production HTML has no duplicate inline service-worker registration'); else fail('production HTML still contains a duplicate inline service-worker registration');

  const manifestResult = await json('/dist/asset-manifest.json');
  const manifest = manifestResult.body;
  for (const key of ['bootstrapJs', 'featuresJs', 'bootstrapCss', 'featuresCss']) {
    const value = String(manifest[key] || '');
    if (/^\/dist\/pamet\.(?:bootstrap|features|styles)\.[a-f0-9]{12}\.(?:js|css)$/.test(value)) pass(`asset manifest contains hashed ${key}`); else fail(`asset manifest ${key} is invalid`);
    if (value) {
      const asset = await fetch(`${base}${value}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      if (asset.ok) pass(`${key} is reachable`); else fail(`${key} returned HTTP ${asset.status}`);
      if ((asset.headers.get('cache-control') || '').includes('immutable')) pass(`${key} uses immutable caching`); else fail(`${key} is missing immutable cache policy`);
    }
  }

  const workerResponse = await fetch(`${base}/sw.js?acceptance=${nonce}`, { headers: { Accept: 'text/javascript', 'Cache-Control': 'no-cache' }, cache: 'no-store', redirect: 'follow', signal: AbortSignal.timeout(15000) });
  const workerText = await workerResponse.text();
  if (workerResponse.ok) pass('service worker is reachable without HTTP cache reuse'); else fail(`service worker returned HTTP ${workerResponse.status}`);
  const workerCachePattern = new RegExp(`pamet-shell-v${assetVersion}-[1-9][0-9]*`);
  if (workerCachePattern.test(workerText) && workerText.includes('/dist/asset-manifest.json')) pass('service worker uses release cache plus manifest-driven assets'); else fail('service worker does not use the expected manifest-driven release cache');

  const healthResult = await json('/api/health');
  const health = healthResult.body;
  if (health.ok === true) pass('health reports ok=true'); else fail('health did not report ok=true');
  if (health.version === expectedVersion) pass(`health reports expected release ${expectedVersion}`); else fail(`health version=${health.version || 'missing'}; expected ${expectedVersion}`);
  if (healthResult.response.headers.get('x-pamet-version') === expectedVersion) pass('health release header matches repository'); else fail(`health X-Pamet-Version=${healthResult.response.headers.get('x-pamet-version') || 'missing'}; expected ${expectedVersion}`);

  const readyResult = await json('/api/ready');
  const ready = readyResult.body;
  if (ready.ok === true && ready.launchReady === true) pass('readiness reports launchReady=true'); else fail('readiness is not launch-ready');
  if (ready.version === expectedVersion) pass(`readiness reports expected release ${expectedVersion}`); else fail(`readiness version=${ready.version || 'missing'}; expected ${expectedVersion}`);
  if (readyResult.response.headers.get('x-pamet-version') === expectedVersion) pass('readiness release header matches repository'); else fail(`readiness X-Pamet-Version=${readyResult.response.headers.get('x-pamet-version') || 'missing'}; expected ${expectedVersion}`);
  const required = ['database', 'distributedRateLimit', 'push', 'email', 'logDrain', 'metrics', 'alerts', 'identityEncryption'];
  for (const key of required) if (ready.checks && ready.checks[key] === true) pass(`readiness dependency ${key}`); else fail(`readiness dependency ${key} is not healthy`);

  const billing = (await json('/api/billing/config')).body;
  if (billing.proEnabled === true) pass('Pro billing is enabled'); else fail('Pro billing is disabled');
  if (billing.ultraEnabled === true) pass('Ultra billing is enabled'); else fail('Ultra billing is disabled');
  if (billing.emailEnabled === true) pass('email delivery is enabled'); else fail('email delivery is disabled');
  await stripeWebhookProbe();
  const oauth = (await json('/api/auth/oauth/providers')).body;
  if (typeof oauth.google === 'boolean' && typeof oauth.apple === 'boolean') pass(`OAuth provider endpoint is healthy (Google ${oauth.google ? 'configured' : 'not configured'}, Apple ${oauth.apple ? 'configured' : 'not configured'})`); else fail('OAuth provider endpoint did not return boolean Google/Apple readiness flags');
  for (const path of ['/api/entitlements', '/api/security/devices', '/api/sharing/invites']) {
    const result = await json(path, 401);
    if (result.body && result.body.error === 'Authentication required.') pass(`${path} fails closed without authentication`); else fail(`${path} did not return the expected authentication error`);
  }
  if (process.exitCode) { console.error('Pamet real-environment acceptance FAILED.'); process.exit(process.exitCode); }
  console.log('Pamet real-environment acceptance PASSED for automated public checks.');
})().catch((error) => { console.error(`FAIL: live acceptance checker crashed: ${error.message}`); process.exit(1); });
