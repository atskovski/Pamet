'use strict';

const fs = require('fs');
const path = require('path');
const { buildSync } = require('esbuild');

const root = path.resolve(__dirname, '..');
const jsSource = path.join(root, 'js', 'insights-charting.js');
const cssSource = path.join(root, 'css', 'insights-charting.css');
const dist = path.join(root, 'dist');
const jsOut = path.join(dist, 'pamet.insights-charting.min.js');
const cssOut = path.join(dist, 'pamet.insights-charting.min.css');
const sourceText = fs.readFileSync(jsSource, 'utf8');

if (/\bstyle\s*=\s*["']/.test(sourceText)) {
  throw new Error('Strict CSP build still contains a style attribute in js/insights-charting.js');
}
if (/\.style\.(?:setProperty|cssText|display|overflow|width|height|color|background)/.test(sourceText)) {
  throw new Error('Strict CSP build still contains presentation CSSOM mutation in js/insights-charting.js');
}

fs.mkdirSync(dist, { recursive:true });
buildSync({
  entryPoints:[jsSource],
  bundle:true,
  minify:true,
  platform:'browser',
  format:'iife',
  target:['es2020'],
  outfile:jsOut
});
buildSync({
  entryPoints:[cssSource],
  bundle:true,
  minify:true,
  outfile:cssOut
});

const jsSize = fs.statSync(jsOut).size;
const cssSize = fs.statSync(cssOut).size;
console.log(`Deferred Insights charting built: /dist/pamet.insights-charting.min.js (${jsSize} bytes), /dist/pamet.insights-charting.min.css (${cssSize} bytes)`);