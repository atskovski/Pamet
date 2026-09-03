'use strict';

const fs = require('fs');
const path = require('path');
const { buildSync } = require('esbuild');

const root = path.resolve(__dirname, '..');
const temp = path.join(root, '.csp-build');
const tempJs = path.join(temp, 'js');
const sourceJs = path.join(root, 'js');

function replaceRequired(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`CSP build transform not found: ${label}`);
  return source.replace(from, to);
}

function transformFile(name, transform) {
  const target = path.join(tempJs, name);
  const source = fs.readFileSync(target, 'utf8');
  fs.writeFileSync(target, transform(source));
}

fs.rmSync(temp, { recursive: true, force: true });
fs.mkdirSync(temp, { recursive: true });
fs.cpSync(sourceJs, tempJs, { recursive: true });

transformFile('app.js', (input) => {
  let source = input;
  source = replaceRequired(source,
    'const PAT_COLORS = { rose: "var(--rose-pink)", amber: "var(--warm-amber)", sage: "var(--sage-green)", neutral: "var(--ink-tertiary)" };',
    'const PAT_COLORS = { rose: "var(--rose-pink)", amber: "var(--warm-amber)", sage: "var(--sage-green)", neutral: "var(--ink-tertiary)" };\n  const toneClass = (name) => ({ rose: "tone-rose", amber: "tone-amber", sage: "tone-sage", neutral: "tone-neutral" }[name] || "tone-neutral");',
    'app tone classes');
  source = replaceRequired(source, '    el.style.setProperty("--tier-color", tier.color);', '    el.classList.add(`tier-${tier.key}`);', 'tier inline style');
  source = replaceRequired(source, '    $("#streakCard").style.display = showStreak ? "flex" : "none";', '    $("#streakCard").hidden = !showStreak;', 'streak display style');
  source = replaceRequired(source, '<span class="pattern-icon" style="background:color-mix(in srgb, ${c} 16%, transparent);color:${c}">${icon}</span>', '<span class="pattern-icon ${toneClass(p.colorName)}">${icon}</span>', 'pattern icon style');
  source = replaceRequired(source,
    '<div class="conf-row"><span class="lbl">Confidence</span><span style="color:${c};font-weight:800">${Math.round(p.confidence * 100)}%</span></div>\n        <div class="conf-bar"><span style="width:${Math.round(p.confidence * 100)}%;background:${c}"></span></div>',
    '<div class="conf-row"><span class="lbl">Confidence</span><span class="conf-value ${toneClass(p.colorName)}">${Math.round(p.confidence * 100)}%</span></div>\n        <div class="conf-bar"><progress class="conf-progress ${toneClass(p.colorName)}" max="100" value="${Math.round(p.confidence * 100)}" aria-label="${Math.round(p.confidence * 100)}% confidence"></progress></div>',
    'confidence inline styles');
  source = replaceRequired(source,
    '<div class="report-bullet"><span class="bullet" style="color:${c}">•</span><span>${esc(p.title)} (${Math.round(p.confidence*100)}% confidence): ${esc(p.detail)}</span></div>',
    '<div class="report-bullet"><span class="bullet ${toneClass(p.colorName)}">•</span><span>${esc(p.title)} (${Math.round(p.confidence*100)}% confidence): ${esc(p.detail)}</span></div>',
    'report bullet style');
  source = replaceRequired(source, '<tr><td>${esc(k)}</td><td style="text-align:right;font-weight:600">${esc(v)}</td></tr>', '<tr><td>${esc(k)}</td><td class="report-value">${esc(v)}</td></tr>', 'print report value style');
  source = replaceRequired(source, '    document.body.style.overflow = "hidden";', '    document.body.classList.add("modal-open");', 'modal body lock');
  source = replaceRequired(source, '    document.body.style.overflow = "";', '    document.body.classList.remove("modal-open");', 'modal body unlock');
  return source;
});

transformFile('billing-sharing.js', (input) => input
  .replace('class="btn btn-primary btn-block" style="margin-top:14px"', 'class="btn btn-primary btn-block payment-confirm"')
  .replace('class="data-btn" data-close style="margin-top:8px"', 'class="data-btn modal-secondary-action" data-close')
  .replace('id="includeNotes" type="checkbox" style="width:auto;margin-right:6px"', 'id="includeNotes" type="checkbox" class="share-notes-checkbox"')
  .replace("p.style.cssText='margin:18px 0 0;padding-top:12px;border-top:1px solid var(--border-color);font-size:11px;color:var(--text-tertiary)';", ''));

transformFile('insights.js', (input) => replaceRequired(input,
  '<div class="mini-meter" aria-hidden="true"><span style="width:${value}%"></span></div>',
  '<div class="mini-meter" aria-hidden="true"><progress max="100" value="${value}"></progress></div>',
  'insights completeness meter'));

transformFile('product-clarity.js', (input) => replaceRequired(input,
  '<div class="pattern-readiness-meter" aria-label="Pattern baseline strength"><span style="width:${Math.min(100, strength)}%"></span></div>',
  '<div class="pattern-readiness-meter" aria-label="Pattern baseline strength"><progress max="100" value="${Math.min(100, strength)}"></progress></div>',
  'pattern readiness meter'));

transformFile('login-experience.js', (input) => replaceRequired(input,
  '    welcome.style.setProperty("--login-scene", `url("/assets/${scenes[index]}")`);',
  '    welcome.classList.remove("login-scene-sunrise", "login-scene-morning", "login-scene-dusk");\n    welcome.classList.add(`login-scene-${scenes[index].replace(/^login-|\\.jpg$/g, "")}`);',
  'login scene inline style'));

const mainSource = fs.readFileSync(path.join(tempJs, 'main.js'), 'utf8');
const browserSources = ['main.js', ...Array.from(mainSource.matchAll(/import\s+["']\.\/([^"']+\.js)["']/g), (match) => match[1])];
for (const name of browserSources) {
  const source = fs.readFileSync(path.join(tempJs, name), 'utf8');
  if (/\bstyle\s*=\s*["']/.test(source)) throw new Error(`Strict CSP build still contains a style attribute in active js/${name}`);
  if (/\.style\.(?:setProperty|cssText|display|overflow|width|height|color|background)/.test(source)) throw new Error(`Strict CSP build still contains presentation CSSOM mutation in active js/${name}`);
}

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
buildSync({ entryPoints: [path.join(tempJs, 'main.js')], bundle: true, minify: true, outfile: path.join(root, 'dist', 'pamet.min.js') });
buildSync({ entryPoints: [path.join(root, 'css', 'main.css')], bundle: true, minify: true, external: ['../assets/*'], outfile: path.join(root, 'dist', 'pamet.min.css') });
fs.rmSync(temp, { recursive: true, force: true });
console.log('Pamet strict-CSP production bundles built.');
