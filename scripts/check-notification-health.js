'use strict';

const fs = require('fs');

const experience = fs.readFileSync('js/platform-experience.js', 'utf8');
const platform = fs.readFileSync('js/platform-foundation.js', 'utf8');

function check(condition, message) {
  if (!condition) throw new Error(message);
}

[
  'Notifications have not been enabled on this device yet.',
  'Notifications are blocked in browser or device settings.',
  'Permission is allowed, but this device is not subscribed to Pamet reminders.',
  'Notifications are ready on this device.',
  'Checking notification permission and device subscription',
  'Check again'
].forEach((text) => check(experience.includes(text), `Notification health UX must retain: ${text}`));

check(experience.includes('Notification.requestPermission'), 'Notification repair must be able to request undecided browser permission from a user action.');
check(experience.includes("window.addEventListener('pamet:notification-health'"), 'Notification health must publish live status to Settings.');
check(experience.includes('button.disabled = true') && experience.includes('button.disabled = false'), 'Check again must provide visible in-progress button state.');
check(platform.includes('notificationHealth'), 'Platform foundation must expose notification health capability.');
check(experience.includes('does not read or send health-journal content'), 'Notification health explanation must distinguish device status from journal content.');
check(experience.includes("repair.textContent = 'Enable notifications'") && experience.includes("repair.textContent = 'Repair subscription'"), 'Repair action must explain the state-specific next step.');

console.log('Pamet notification-health UX gate passed.');
