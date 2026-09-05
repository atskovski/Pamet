'use strict';

const fs = require('fs');
const path = require('path');
const { buildSync } = require('esbuild');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'js', 'insights-charting.js');
const dist = path.join(root, 'dist');
const outfile = path.join(dist, 'pamet.insights-charting.min.js');
const sourceText = fs.readFileSync(source, 'utf8');

if (/\bstyle\s*=\s*["']/.test(sourceText)) {
  throw new Error('Strict CSP build still contains a style attribute in js/insights-charting.js');
}
if (/\.style\.(?:setProperty|cssText|display|overflow|width|height|color|background)/.test(sourceText)) {
  throw new Error('Strict CSP build still contains presentation CSSOM mutation in js/insights-charting.js');
}

fs.mkdirSync(dist, { recursive:true });
buildSync({
  entryPoints:[source],
  bundle:true,
  minify:true,
  platform:'browser',
  format:'iife',
  target:['es2020'],
  outfile
});

const size = fs.statSync(outfile).size;
console.log(`Deferred Insights charting built: /dist/pamet.insights-charting.min.js (${size} bytes)`);