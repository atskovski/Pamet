'use strict';

process.env.NODE_ENV = 'production';
process.env.DISABLE_RATE_LIMITS = 'true';
const app = require('../server');

async function check(condition, message) { if (!condition) throw new Error(message); }

(async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const health = await fetch(`${base}/api/health`);
    const body = await health.json();
    await check(health.ok && body.version === '1.0.5', 'Health handler must report v1.0.5.');
    await check(health.headers.get('x-content-type-options') === 'nosniff', 'Security headers must be present.');
    await check(health.headers.get('content-security-policy')?.includes("default-src 'self'"), 'CSP must be present.');
    await check(health.headers.get('strict-transport-security')?.includes('max-age='), 'HSTS must be present in production.');

    for (const privatePath of ['/server.js', '/package.json', '/db/schema.sql', '/.env.example']) {
      const response = await fetch(base + privatePath);
      await check(response.status === 404, `${privatePath} must not be public.`);
    }
    const home = await fetch(`${base}/`);
    await check(home.ok && (await home.text()).includes('<title>Pamet'), 'The application shell must be available.');
    const malformed = await fetch(`${base}/api/account/bootstrap`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
    await check(malformed.status === 400, 'Malformed JSON must produce a safe 400 response.');
    console.log('Pamet HTTP security smoke checks passed.');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
