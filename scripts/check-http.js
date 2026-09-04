'use strict';

process.env.NODE_ENV = 'production';
process.env.DISABLE_RATE_LIMITS = 'true';
const expectedVersion = require('../package.json').version;
const assetVersion = expectedVersion.replace(/\D/g, '') || 'current';
const app = require('../server');

async function check(condition, message) { if (!condition) throw new Error(message); }

(async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const health = await fetch(`${base}/api/health`);
    const body = await health.json();
    await check(health.ok && body.version === expectedVersion, `Health handler must report canonical v${expectedVersion}.`);
    await check(health.headers.get('x-content-type-options') === 'nosniff', 'Security headers must be present.');
    const csp = health.headers.get('content-security-policy') || '';
    await check(csp.includes("default-src 'self'") && csp.includes("script-src-attr 'none'") && csp.includes("style-src-attr 'none'") && !csp.includes("'unsafe-inline'"), 'Strict CSP must be present without unsafe-inline.');
    await check(health.headers.get('strict-transport-security')?.includes('max-age='), 'HSTS must be present in production.');

    for (const privatePath of ['/server.js', '/package.json', '/db/schema.sql', '/.env.example', '/js/auth.js', '/css/styles.css']) {
      const response = await fetch(base + privatePath);
      await check(response.status === 404, `${privatePath} must not be public.`);
    }
    const home = await fetch(`${base}/`);
    const homeHtml = await home.text();
    await check(home.ok && homeHtml.includes('<title>Pamet'), 'The application shell must be available.');
    await check(homeHtml.includes(`dist/pamet.min.js?v=${assetVersion}`) && homeHtml.includes(`dist/pamet.min.css?v=${assetVersion}`), `The rendered application shell must use package-derived asset version ${assetVersion}.`);
    await check((await fetch(`${base}/dist/pamet.min.js?v=${assetVersion}`)).ok, 'The production JavaScript bundle must be served.');
    await check((await fetch(`${base}/dist/pamet.min.css?v=${assetVersion}`)).ok, 'The production stylesheet must be served.');
    const malformed = await fetch(`${base}/api/account/bootstrap`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
    await check(malformed.status === 400, 'Malformed JSON must produce a safe 400 response.');
    console.log(`Pamet ${expectedVersion} HTTP security smoke checks passed.`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
