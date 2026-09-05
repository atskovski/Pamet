'use strict';

const fs = require('fs');
const zlib = require('zlib');

const manifestPath = 'dist/asset-manifest.json';
if (!fs.existsSync(manifestPath)) throw new Error('Asset manifest is missing. Run the production build first.');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const entries = {
  bootstrapJs: { file: 'dist/pamet.min.js', raw: 170 * 1024, gzip: 55 * 1024 },
  // One-year Insights plus the local Ultra caregiver PDF fallback stay deferred.
  // Allow 2 KiB additional raw feature code while preserving gzip and total budgets.
  featuresJs: { file: 'dist/pamet.features.min.js', raw: 194 * 1024, gzip: 65 * 1024 },
  bootstrapCss: { file: 'dist/pamet.min.css', raw: 115 * 1024, gzip: 38 * 1024 },
  featuresCss: { file: 'dist/pamet.features.min.css', raw: 90 * 1024, gzip: 30 * 1024 }
};
const initialRawBudget = 260 * 1024;
const initialGzipBudget = 88 * 1024;
const totalRawBudget = 500 * 1024;
const totalGzipBudget = 175 * 1024;

for (const key of Object.keys(entries)) {
  const value = String(manifest[key] || '');
  if (!/^\/dist\/pamet\.(?:bootstrap|features|styles)\.[a-f0-9]{12}\.(?:js|css)$/.test(value)) {
    throw new Error(`Manifest ${key} must reference a content-hashed immutable asset.`);
  }
  if (!fs.existsSync(value.slice(1))) throw new Error(`Manifest asset ${value} is missing.`);
}

const experienceSource = fs.readFileSync('js/experience.js', 'utf8');
const broadExperienceObserver = /new\s+MutationObserver[\s\S]{0,500}\.observe\(document\.(?:body|documentElement)\s*,\s*\{[^}]*childList\s*:\s*true[^}]*subtree\s*:\s*true[^}]*\}\s*\)/m;
if (broadExperienceObserver.test(experienceSource)) throw new Error('js/experience.js must use explicit lifecycle/navigation refreshes instead of a page-wide MutationObserver.');

const main = fs.readFileSync('js/main.js', 'utf8');
const authenticated = fs.readFileSync('js/authenticated-features.js', 'utf8');
for (const heavy of ['care-planning.js', 'care-workspace.js', 'encrypted-sync.js', 'qr-sharing.js', 'insights.js', 'ui-ux.js']) {
  if (main.includes(`import "./${heavy}"`)) throw new Error(`${heavy} must stay out of the signed-out bootstrap.`);
  if (!authenticated.includes(`import "./${heavy}"`)) throw new Error(`${heavy} must be present in the authenticated feature bundle.`);
}
if (!main.includes('loadAuthenticatedFeatures')) throw new Error('Bootstrap must lazy-load authenticated features.');
if (!main.includes('navigator.connection?.saveData')) throw new Error('Feature prefetch must respect Save-Data.');

let totalRaw = 0;
let totalGzip = 0;
const sizes = {};
for (const [name, budget] of Object.entries(entries)) {
  if (!fs.existsSync(budget.file)) throw new Error(`${budget.file} is missing.`);
  const bytes = fs.readFileSync(budget.file);
  const raw = bytes.length;
  const gzip = zlib.gzipSync(bytes, { level: 9 }).length;
  if (raw > budget.raw) throw new Error(`${budget.file} raw size ${raw} exceeds budget ${budget.raw}.`);
  if (gzip > budget.gzip) throw new Error(`${budget.file} gzip size ${gzip} exceeds budget ${budget.gzip}.`);
  sizes[name] = { raw, gzip };
  totalRaw += raw;
  totalGzip += gzip;
}
const initialRaw = sizes.bootstrapJs.raw + sizes.bootstrapCss.raw;
const initialGzip = sizes.bootstrapJs.gzip + sizes.bootstrapCss.gzip;
if (initialRaw > initialRawBudget) throw new Error(`Signed-out initial bundle ${initialRaw} exceeds ${initialRawBudget}.`);
if (initialGzip > initialGzipBudget) throw new Error(`Signed-out initial gzip ${initialGzip} exceeds ${initialGzipBudget}.`);
if (totalRaw > totalRawBudget) throw new Error(`Total production bundles ${totalRaw} exceed ${totalRawBudget}.`);
if (totalGzip > totalGzipBudget) throw new Error(`Total production gzip ${totalGzip} exceeds ${totalGzipBudget}.`);

const fmt = (value) => `${(value / 1024).toFixed(1)} KiB`;
console.log(`Pamet performance budget passed. Initial signed-out: ${fmt(initialRaw)} raw / ${fmt(initialGzip)} gzip; total: ${fmt(totalRaw)} raw / ${fmt(totalGzip)} gzip; bootstrap JS ${fmt(sizes.bootstrapJs.raw)}, feature JS ${fmt(sizes.featuresJs.raw)}.`);
