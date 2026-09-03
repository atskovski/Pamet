'use strict';

const base = String(process.env.PAMET_BASE_URL || 'https://pamet.wasmer.app').replace(/\/$/, '');

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

function pass(message) { console.log(`PASS: ${message}`); }

async function json(path, expectedStatus = 200) {
  const response = await fetch(`${base}${path}`, {
    headers: { Accept: 'application/json' },
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

  const root = await fetch(`${base}/`, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
  if (root.ok) pass('application shell is reachable');
  else fail(`application shell returned HTTP ${root.status}`);

  const health = (await json('/api/health')).body;
  if (health.ok === true) pass('health reports ok=true'); else fail('health did not report ok=true');
  if (/^\d+\.\d+\.\d+$/.test(String(health.version || ''))) pass(`health reports semantic version ${health.version}`); else fail('health did not report a semantic version');

  const ready = (await json('/api/ready')).body;
  if (ready.ok === true && ready.launchReady === true) pass('readiness reports launchReady=true'); else fail('readiness is not launch-ready');
  if (ready.version === health.version) pass(`health/readiness versions agree at ${health.version}`); else fail(`version mismatch: health=${health.version || 'missing'} ready=${ready.version || 'missing'}`);
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
