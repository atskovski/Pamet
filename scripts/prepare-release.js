'use strict';

const fs = require('fs');
const { spawnSync } = require('child_process');

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const version = pkg.version;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('package.json version is not semantic.');

const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
lock.version = version;
if (!lock.packages || !lock.packages['']) throw new Error('package-lock root package metadata is missing.');
lock.packages[''].version = version;
fs.writeFileSync('package-lock.json', JSON.stringify(lock, null, 2) + '\n');

const changelogPath = 'CHANGELOG.md';
let changelog = fs.readFileSync(changelogPath, 'utf8');
const heading = `## [${version}]`;
if (!changelog.includes(heading)) {
  const release = `## [${version}] — 2026-09-04\n\n### Production hardening, scale, and plan consistency\n\n- Added a canonical Free / Pro / Ultra plan catalog and responsive full-feature comparison in Settings.\n- Added CI drift checks tying displayed plan features to mobile and server-authoritative entitlements.\n- Reworked Notification health so Check again visibly refreshes browser permission and active push-subscription state with state-specific repair guidance.\n- Hardened GitHub Actions scheduled-job OIDC verification for providers with restricted GitHub JWKS egress by retaining strict JWT validation and automatically refreshing a bundled set of GitHub public signing keys.\n- Added scale-oriented MySQL indexes plus an idempotent production migration, database connection-budget guidance, and a blocking scale/capacity release gate.\n- Added raw and gzip production bundle performance budgets.\n- Streamlined README/go-live documentation around current product, architecture, safety boundaries, release gates, scaling, and external assurance.\n- Rotated the PWA worker/cache/static release identity to 1.6.4 and advanced the mobile backend contract while retaining 1.5.1 as the compatible native minimum.\n\n---\n\n`;
  changelog = changelog.replace('# Pamet Change Log\n\n', `# Pamet Change Log\n\n${release}`);
  fs.writeFileSync(changelogPath, changelog);
}

const sync = spawnSync(process.execPath, ['scripts/sync-plan-catalog.js'], { stdio: 'inherit' });
if (sync.status !== 0) process.exit(sync.status || 1);
console.log(`Prepared Pamet ${version} release metadata.`);
