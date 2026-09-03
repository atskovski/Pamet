'use strict';

const fs = require('fs');

const client = fs.readFileSync('js/platform-experience.js', 'utf8');
const main = fs.readFileSync('js/main.js', 'utf8');
const cssEntry = fs.readFileSync('css/main.css', 'utf8');
const css = fs.readFileSync('css/platform-experience.css', 'utf8');

function check(condition, message) {
  if (!condition) throw new Error(message);
}

check(main.includes('import "./platform-experience.js"'), 'Platform Settings experience must be loaded from the production entrypoint.');
check(cssEntry.includes('@import "./platform-experience.css"'), 'Platform Settings styles must be part of the production CSS bundle.');
check(client.includes('Download my Pamet data') && client.includes('downloadJson'), 'Data portability UI must remain wired to the local export contract.');
check(client.includes('Notification health') && client.includes('notificationHealth'), 'Notification-health UI must remain wired to platform health checks.');
check(client.includes('browser or device site settings'), 'Denied-notification recovery must provide a manual recovery path.');
check(!client.includes('style='), 'Platform Settings experience must remain compatible with strict style CSP.');
check(css.includes('#141A1E') && css.includes('#F2F5F4'), 'Platform Settings dark mode must retain readable dark-surface contrast.');

console.log('Platform experience checks passed.');
