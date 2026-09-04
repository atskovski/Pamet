'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const catalogPath = path.join(root, 'contracts', 'plan-features.json');
const generatedPath = path.join(root, 'js', 'plan-catalog.generated.js');
const readmePath = path.join(root, 'README.md');
const checkOnly = process.argv.includes('--check');
const START = '<!-- PLAN_MATRIX:START -->';
const END = '<!-- PLAN_MATRIX:END -->';

const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const keys = catalog.plans.map((plan) => plan.key);
if (JSON.stringify(keys) !== JSON.stringify(['free', 'pro', 'ultra'])) throw new Error('Plan catalog must define free, pro, ultra in order.');
if (!Array.isArray(catalog.features) || catalog.features.length < 1) throw new Error('Plan catalog must contain features.');
for (const feature of catalog.features) {
  if (!feature.id || !feature.label) throw new Error('Every plan feature needs an id and label.');
  for (const key of keys) if (typeof feature[key] !== 'boolean') throw new Error(`Feature ${feature.id} is missing ${key} availability.`);
}

const generated = `/* Generated from contracts/plan-features.json. Run \`node scripts/sync-plan-catalog.js\` after plan changes. */\n(function (global) {\n  "use strict";\n  global.PametPlanCatalog = ${JSON.stringify(catalog, null, 2)};\n})(window);\n`;

const mark = (value) => value ? '✅' : '—';
const pricingRows = catalog.plans.map((plan) => `| ${plan.name} | ${plan.monthly} | ${plan.annual} |`).join('\n');
const featureRows = catalog.features.map((feature) => `| ${feature.label} | ${mark(feature.free)} | ${mark(feature.pro)} | ${mark(feature.ultra)} |`).join('\n');
const matrix = `${START}\n### Plan feature matrix\n\nThis matrix is generated from \`contracts/plan-features.json\`, the source of truth used by the in-app **Compare Pamet plans** experience. Update the contract, run \`node scripts/sync-plan-catalog.js\`, and CI will reject drift between product copy and the application.\n\n| Plan | Monthly | Annual |\n| --- | ---: | ---: |\n${pricingRows}\n\n| Feature | Free | Pro | Ultra |\n| --- | :---: | :---: | :---: |\n${featureRows}\n\nThe server-authoritative entitlement API remains the enforcement boundary for paid capabilities; the matrix is product/display metadata, not an authorization mechanism.\n${END}`;

function replaceMatrix(readme) {
  const start = readme.indexOf(START);
  const end = readme.indexOf(END);
  if (start < 0 || end < 0 || end < start) throw new Error('README plan matrix markers are missing.');
  return readme.slice(0, start) + matrix + readme.slice(end + END.length);
}

const currentGenerated = fs.existsSync(generatedPath) ? fs.readFileSync(generatedPath, 'utf8') : '';
const currentReadme = fs.readFileSync(readmePath, 'utf8');
const nextReadme = replaceMatrix(currentReadme);

if (checkOnly) {
  if (currentGenerated !== generated) throw new Error('js/plan-catalog.generated.js is out of sync. Run node scripts/sync-plan-catalog.js.');
  if (currentReadme !== nextReadme) throw new Error('README plan matrix is out of sync. Run node scripts/sync-plan-catalog.js.');
  console.log(`Plan catalog synchronized: ${catalog.plans.length} plans, ${catalog.features.length} features.`);
  process.exit(0);
}

fs.writeFileSync(generatedPath, generated);
fs.writeFileSync(readmePath, nextReadme);
console.log(`Updated browser catalog and README from ${path.relative(root, catalogPath)}.`);
