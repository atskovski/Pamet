'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const jsDir = path.join(root, 'js');
const jsFiles = fs.readdirSync(jsDir).filter((name) => name.endsWith('.js'));
const source = [index, ...jsFiles.map((name) => fs.readFileSync(path.join(jsDir, name), 'utf8'))].join('\n');
const failures = [];
const passes = [];

function check(condition, message) {
  if (condition) passes.push(message);
  else failures.push(message);
}

const ids = [...index.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
const idCounts = ids.reduce((map, id) => map.set(id, (map.get(id) || 0) + 1), new Map());
const duplicates = [...idCounts.entries()].filter(([, count]) => count > 1).map(([id]) => id);
check(duplicates.length === 0, `no duplicate DOM ids${duplicates.length ? ` (${duplicates.join(', ')})` : ''}`);

const screenIds = new Set([...index.matchAll(/\bid="screen-([^"]+)"/g)].map((m) => m[1]));
const dataTabs = new Set([...index.matchAll(/\bdata-tab="([^"]+)"/g)].map((m) => m[1]));
const dataNav = new Set([...source.matchAll(/\bdata-nav=["'`]([^"'`]+)["'`]/g)].map((m) => m[1]).filter((v) => !v.includes('${')));
for (const target of [...dataTabs, ...dataNav]) {
  check(screenIds.has(target), `navigation target "${target}" resolves to #screen-${target}`);
}

const orphanScreens = [...screenIds].filter((screen) => screen !== 'home' && !dataTabs.has(screen) && !dataNav.has(screen));
check(orphanScreens.length === 0, `every non-home screen is reachable${orphanScreens.length ? ` (orphans: ${orphanScreens.join(', ')})` : ''}`);

const hashAnchors = [...index.matchAll(/<a\b[^>]*href="#"[^>]*>/g)].map((m) => m[0]);
const allowedHashIds = new Set(['showRegister', 'showLogin']);
const badHashAnchors = hashAnchors.filter((tag) => {
  const id = tag.match(/\bid="([^"]+)"/)?.[1];
  return !allowedHashIds.has(id);
});
check(badHashAnchors.length === 0, 'placeholder hash links are limited to JavaScript-controlled auth switches');
for (const id of allowedHashIds) {
  check(source.includes(`#${id}`) || source.includes(`"${id}"`) || source.includes(`'${id}'`), `#${id} has JavaScript behavior`);
}

const externalAnchors = [...index.matchAll(/<a\b[^>]*href="(https?:\/\/[^"#]+)"[^>]*>/g)].map((m) => m[1]);
check(externalAnchors.every((href) => /^https:\/\//.test(href)), 'static external links use HTTPS');

const buttonTags = [...index.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)];
const unnamedButtons = buttonTags.filter((match) => {
  const tag = match[0];
  const body = match[1].replace(/<[^>]+>/g, '').replace(/&[^;]+;/g, ' ').trim();
  return !body && !/aria-label="[^"]+"/.test(tag) && !/title="[^"]+"/.test(tag);
});
check(unnamedButtons.length === 0, `every static button has an accessible name${unnamedButtons.length ? ` (${unnamedButtons.length} unnamed)` : ''}`);

const navButtons = [...index.matchAll(/<button\b[^>]*(?:data-tab|data-nav)="([^"]+)"[^>]*>/g)].map((m) => m[1]);
check(navButtons.length > 0, 'primary or secondary navigation controls are present');

const primaryTabs = ['home', 'calendar', 'patterns', 'settings'];
for (const tab of primaryTabs) {
  check(dataTabs.has(tab), `primary tab "${tab}" exists`);
  check(screenIds.has(tab), `primary screen "${tab}" exists`);
}
check(screenIds.has('report'), 'Visit Brief screen exists');
check(dataNav.has('report') || dataTabs.has('report'), 'Visit Brief is reachable through navigation');

const interactiveIds = [...index.matchAll(/<(?:button|a|input|select|textarea)\b[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);
for (const id of interactiveIds) {
  const occurrences = (source.match(new RegExp(`(?:#${id}\\b|getElementById\\(["']${id}["']|querySelector\\(["']#${id}["'])`, 'g')) || []).length;
  const isNativeFormControl = new RegExp(`<(?:input|select|textarea)\\b[^>]*\\bid="${id}"`).test(index);
  check(isNativeFormControl || occurrences > 0, `interactive #${id} is referenced by application behavior`);
}

check(/addEventListener\(["']click["']/.test(source), 'application defines click interaction handlers');
check(/addEventListener\(["']submit["']/.test(source), 'application defines form submit handlers');

if (failures.length) {
  console.error(`Pamet UI contract audit FAILED (${failures.length} issue${failures.length === 1 ? '' : 's'}):`);
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(1);
}

console.log(`Pamet UI contract audit PASSED (${passes.length} assertions).`);
