'use strict';

const fs = require('node:fs');
const path = require('node:path');

const base = String(process.env.PAMET_BASE_URL || 'https://pamet.wasmer.app').replace(/\/$/, '');
const expected = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'dist', 'asset-manifest.json'), 'utf8'));
const keys = ['bootstrapJs', 'featuresJs', 'bootstrapCss', 'featuresCss'];

(async () => {
  const response = await fetch(`${base}/dist/asset-manifest.json?acceptance=${Date.now()}`, {
    headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
    cache: 'no-store',
    redirect: 'follow',
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`remote asset manifest returned HTTP ${response.status}`);
  const actual = await response.json();

  const mismatches = keys.filter((key) => String(actual[key] || '') !== String(expected[key] || ''));
  if (mismatches.length) {
    for (const key of mismatches) {
      console.error(`FAIL: deployed ${key}=${actual[key] || 'missing'}; expected ${expected[key] || 'missing'}`);
    }
    process.exit(1);
  }

  console.log(`PASS: deployed asset manifest matches this repository build (${keys.map((key) => `${key}=${actual[key]}`).join(', ')}).`);
})().catch((error) => {
  console.error(`FAIL: exact deployed-asset check crashed: ${error.message}`);
  process.exit(1);
});
