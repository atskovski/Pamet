'use strict';

const webpush = require('web-push');

function configured() { return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT); }
function configure() { if (!configured()) return false; webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY); return true; }
async function send(subscription, payload) { if (!configure()) throw new Error('Web Push is not configured.'); return webpush.sendNotification(subscription, JSON.stringify(payload), { TTL: 60 * 60, urgency: 'normal' }); }

module.exports = { configured, send };
