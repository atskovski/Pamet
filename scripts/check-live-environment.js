'use strict';

const expectedVersion = require('../package.json').version;
const base = String(process.env.PAMET_BASE_URL || 'https://pamet.wasmer.app').replace(/\/$/, '');
const assetVersion = expectedVersion.replace(/\D/g, '') || 'current';

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

function pass(message) { console.log(`PASS: ${message}`); }

async function json(path, expectedStatus = 200) {
  const response = await fetch(`${base}${path}`, {
    headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
    cache: 'no-store',
    redirect: 'follow',
    signal: AbortSignal.timeout(15000)
  });
  const body = await response.json().catch(() => ({}));
  if (response.status !== expectedStatus) {
    fail(`${path} returned HTTP ${response.status}; expected ${expectedStatus}.`);
    return { response, body };
  }
  pass(`${path} returned HTTP ${expectedStatus}.`);
  return { response, body };
}

(async () => {
  console.log(`Pamet real-environment acceptance: ${base}`);
  console.log(`Expected release from repository: ${expectedVersion}`);

  const nonce = Date.now();
  const root = await fetch(`${base}/?acceptance=${nonce}`, {
    headers: { Accept: 'text/html', 'Cache-Control': 'no-cache' },
    cache: 'no-store',
    redirect: 'follow',
    signal: AbortSignal.timeout(15000)
  });
  const rootHtml = await root.text();
  if (root.ok) pass('application shell is reachable');
  else fail(`application shell returned HTTP ${root.status}`);

  const rootVersion = root.headers.get('x-pamet-version');
  if (rootVersion === expectedVersion) pass(`application response header reports ${expectedVersion}`);
  else fail(`application X-Pamet-Version=${rootVersion || 'missing'}; expected ${expectedVersion}`);

  const expectedFooter = `Pamet v${expectedVersion} · Your health history, finally useful.`;
  if (rootHtml.includes(expectedFooter)) pass(`server-rendered Settings footer contains ${expectedVersion}`);
  else fail(`server-rendered Settings footer does not contain ${expectedFooter}`);

  if (rootHtml.includes(`dist/pamet.min.js?v=${assetVersion}`) && rootHtml.includes(`dist/pamet.min.css?v=${assetVersion}`)) {
    pass(`application shell references ${expectedVersion} release assets`);
  } else {
    fail(`application shell does not reference expected release asset version ${assetVersion}`);
  }

  const healthResult = await json('/api/health');
  const health = healthResult.body;
  if (health.ok === true) pass('health reports ok=true'); else fail('health did not report ok=true');
  if (health.version === expectedVersion) pass(`health reports expected release ${expectedVersion}`);
  else fail(`health version=${health.version || 'missing'}; expected ${expectedVersion}`);
  if (healthResult.response.headers.get('x-pamet-version') === expectedVersion) pass('health release header matches repository');
  else fail(`health X-Pamet-Version=${healthResult.response.headers.get('x-pamet-version') || 'missing'}; expected ${expectedVersion}`);

  const readyResult = await json('/api/ready');
  const ready = readyResult.body;
  if (ready.ok === true && ready.launchReady === true) pass('readiness reports launchReady=true'); else fail('readiness is not launch-ready');
  if (ready.version === expectedVersion) pass(`readiness reports expected release ${expectedVersion}`);
  else fail(`readiness version=${ready.version || 'missing'}; expected ${expectedVersion}`);
  if (readyResult.response.headers.get('x-pamet-version') === expectedVersion) pass('readiness release header matches repository');
  else fail(`readiness X-Pamet-Version=${readyResult.response.headers.get('x-pamet-version') || 'missing'}; expected ${expectedVersion}`);

  const required = ['database', 'distributedRateLimit', 'push', 'email', 'logDrain', 'metrics', 'alerts', 'identityEncryption'];
  for (const key of required) {
    if (ready.checks && ready.checks[key] === true) pass(`readiness dependency ${key}`); else fail(`readiness dependency ${key} is not healthy`);
  }

  const billing = (await json('/api/billing/config')).body;
  if (billing.proEnabled === true) pass('Pro billing is enabled'); else fail('Pro billing is disabled');
  if (billing.ultraEnabled === true) pass('Ultra billing is enabled'); else fail('Ultra billing is disabled');
  if (billing.emailEnabled === true) pass('email delivery is enabled'); else fail('email delivery is disabled');

  for (const path of ['/api/entitlements', '/api/security/devices', '/api/sharing/invites']) {
    const result = await json(path, 401);
    if (result.body && result.body.error === 'Authentication required.') pass(`${path} fails closed without authentication`);
    else fail(`${path} did not return the expected authentication error`);
  }

  if (process.exitCode) {
    console.error('Pamet real-environment acceptance FAILED.');
    process.exit(process.exitCode);
  }
  console.log('Pamet real-environment acceptance PASSED for automated public checks.');
})().catch((error) => {
  console.error(`FAIL: live acceptance checker crashed: ${error.message}`);
  process.exit(1);
});
