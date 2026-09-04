'use strict';

const fs = require('fs');

const experience = fs.readFileSync('js/platform-experience.js', 'utf8');
const platform = fs.readFileSync('js/platform-foundation.js', 'utf8');

function check(condition, message) {
  if (!condition) throw new Error(message);
}

[
  'Notification permission has not been decided yet.',
  'Notifications are blocked in browser or device settings.',
  'Permission is allowed, but this device is not subscribed.',
  'Notifications are available on this device.',
  'Checking notification status',
  'Check again'
].forEach((text) => check(experience.includes(text), `Notification health UX must retain: ${text}`));

check(experience.includes('Notification.requestPermission'), 'Notification repair must be able to request undecided browser permission from a user action.');
check(experience.includes("window.addEventListener('pamet:notification-health'"), 'Notification health must publish live status to Settings.');
check(experience.includes('disabled = true') || experience.includes('disabled=true'), 'Check again must provide visible in-progress button state.');
check(platform.includes('notificationHealth'), 'Platform foundation must expose notification health capability.');
check(experience.includes('does not read') || experience.includes('journal data') || experience.includes('health data'), 'Notification health explanation must distinguish device status from journal content.');

console.log('Pamet notification-health UX gate passed.');
