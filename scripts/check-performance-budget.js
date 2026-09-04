'use strict';

const fs = require('fs');
const zlib = require('zlib');

const budgets = {
  'dist/pamet.min.js': { raw: 300 * 1024, gzip: 90 * 1024 },
  'dist/pamet.min.css': { raw: 160 * 1024, gzip: 45 * 1024 }
};
const combinedRawBudget = 450 * 1024;
const combinedGzipBudget = 125 * 1024;

let combinedRaw = 0;
let combinedGzip = 0;
const report = [];

for (const [file, budget] of Object.entries(budgets)) {
  if (!fs.existsSync(file)) throw new Error(`${file} is missing. Run the production build before the performance gate.`);
  const bytes = fs.readFileSync(file);
  const raw = bytes.length;
  const gzip = zlib.gzipSync(bytes, { level: 9 }).length;
  combinedRaw += raw;
  combinedGzip += gzip;
  if (raw > budget.raw) throw new Error(`${file} raw size ${raw} exceeds budget ${budget.raw}.`);
  if (gzip > budget.gzip) throw new Error(`${file} gzip size ${gzip} exceeds budget ${budget.gzip}.`);
  report.push(`${file}: ${(raw / 1024).toFixed(1)} KiB raw / ${(gzip / 1024).toFixed(1)} KiB gzip`);
}

if (combinedRaw > combinedRawBudget) throw new Error(`Combined production bundle ${combinedRaw} exceeds raw budget ${combinedRawBudget}.`);
if (combinedGzip > combinedGzipBudget) throw new Error(`Combined production bundle gzip ${combinedGzip} exceeds budget ${combinedGzipBudget}.`);

console.log(`Pamet production performance budget passed. ${report.join('; ')}; combined ${(combinedRaw / 1024).toFixed(1)} KiB raw / ${(combinedGzip / 1024).toFixed(1)} KiB gzip.`);
