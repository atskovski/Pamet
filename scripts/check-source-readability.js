'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const jsRoot = path.join(root, 'js');
const MODERN_MAX_LINE = 360;
const LEGACY_MEGA_LINE = 500;
const LEGACY_DEBT_CEILING = 96;
const modernFiles = new Set([
  'plan-comparison.js',
  'plan-management.js',
  'plan-management-loader.js',
  'plan-matrix.js',
  'visit-workflow-loader.js'
]);

const files = fs.readdirSync(jsRoot).filter((name) => name.endsWith('.js') && !name.endsWith('.generated.js'));
let megaLines = 0;
const violations = [];
const debt = [];

for (const name of files) {
  const lines = fs.readFileSync(path.join(jsRoot, name), 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    const length = line.length;
    if (length > LEGACY_MEGA_LINE) {
      megaLines += 1;
      debt.push(`${name}:${index + 1} (${length})`);
    }
    if (modernFiles.has(name) && length > MODERN_MAX_LINE) violations.push(`${name}:${index + 1} is ${length} characters`);
  });
}

if (violations.length) {
  throw new Error(`Readable-source gate failed. Modern Pamet modules may not exceed ${MODERN_MAX_LINE} characters per source line:\n${violations.join('\n')}`);
}

if (megaLines > LEGACY_DEBT_CEILING) {
  throw new Error(`Dense-source debt increased to ${megaLines} lines over ${LEGACY_MEGA_LINE} characters; ceiling is ${LEGACY_DEBT_CEILING}. Format/refactor source instead of raising the ceiling.`);
}

console.log(`Source readability gate passed. Modern modules stay under ${MODERN_MAX_LINE} chars/line; legacy mega-line debt is ${megaLines}/${LEGACY_DEBT_CEILING}.`);
if (debt.length) console.log(`Legacy formatting debt remains tracked in ${new Set(debt.map((item) => item.split(':')[0])).size} files and must trend downward.`);
