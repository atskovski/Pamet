'use strict';

const fs = require('fs');

const client = fs.readFileSync('js/platform-experience.js', 'utf8');
const authenticated = fs.readFileSync('js/authenticated-features.js', 'utf8');
const cssEntry = fs.readFileSync('css/main.css', 'utf8');
const css = fs.readFileSync('css/platform-experience.css', 'utf8');

function check(condition, message) { if (!condition) throw new Error(message); }

check(authenticated.includes('import "./platform-experience.js"'), 'Platform Settings experience must be loaded from the authenticated production entrypoint.');
check(cssEntry.includes('@import "./platform-experience.css"'), 'Platform Settings styles must remain represented in the full production CSS contract.');
check(client.includes('Download my Pamet data') && client.includes('downloadJson'), 'Data portability UI must remain wired to the local export contract.');
check(client.includes('Notification health') && client.includes('notificationHealth'), 'Notification-health UI must remain wired to platform health checks.');
check(client.includes('browser or device’s site settings') && client.includes('Check again'), 'Denied-notification recovery must provide a manual browser/OS recovery path.');
check(client.includes('Checking notification permission and device subscription') && client.includes('button.disabled = true'), 'Notification recheck must visibly communicate active status checking.');
check(client.includes('does not read or send health-journal content'), 'Notification health must explain its data boundary.');
check(!client.includes('style='), 'Platform Settings experience must remain compatible with strict style CSP.');
check(css.includes('#141A1E') && css.includes('#F2F5F4'), 'Platform Settings dark mode must retain readable dark-surface contrast.');

console.log('Platform experience checks passed.');
