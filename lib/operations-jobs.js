'use strict';

const { iterateById, clampBatchSize } = require('./batch');

const parse = (value, fallback = {}) => { if (value && typeof value === 'object') return value; try { return JSON.parse(value); } catch { return fallback; } };
const html = (value) => String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

async function runPushReminders({ connection, push, appBaseUrl, batchSize = 250, log = () => {} }) {
  const size = clampBatchSize(batchSize, 250, 1000);
  let checked = 0; let sent = 0; let disabled = 0; let batches = 0;
  for await (const rows of iterateById({
    connection,
    table: 'pamet_push_subscriptions',
    where: 'enabled=TRUE AND failure_count<5',
    columns: 'id,subscription_json,timezone,reminder_hour,last_sent_local_date,failure_count',
    idColumn: 'id',
    batchSize: size,
    initialCursor: ''
  })) {
    batches += 1;
    for (const row of rows) {
      checked += 1;
      try {
        const parts = new Intl.DateTimeFormat('en-CA', { timeZone: row.timezone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit' }).formatToParts(new Date());
        const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
        const localDate = `${value.year}-${value.month}-${value.day}`;
        const localHour = Number(value.hour === '24' ? 0 : value.hour);
        if (localHour !== Number(row.reminder_hour) || String(row.last_sent_local_date || '').slice(0, 10) === localDate) continue;
        await push.send(parse(row.subscription_json), {
          title: 'Time for a quick Pamet check-in',
          body: 'Take a moment to record how you felt today. Small entries build a clearer health history.',
          url: appBaseUrl,
          tag: `pamet-daily-${localDate}`
        });
        await connection.execute('UPDATE pamet_push_subscriptions SET last_sent_local_date=?,last_success_at=NOW(),failure_count=0 WHERE id=?', [localDate, row.id]);
        sent += 1;
      } catch (error) {
        const terminal = error.statusCode === 404 || error.statusCode === 410;
        await connection.execute('UPDATE pamet_push_subscriptions SET failure_count=failure_count+1,enabled=? WHERE id=?', [!terminal, row.id]);
        if (terminal) disabled += 1;
        log({ event: 'push.delivery_failed', subscriptionId: row.id, status: error.statusCode || 0 });
      }
    }
  }
  return { checked, sent, disabled, batches, batchSize: size };
}

async function runWeeklyDigest({ connection, sendMail, appBaseUrl, batchSize = 250, log = () => {} }) {
  const size = clampBatchSize(batchSize, 250, 1000);
  let attempted = 0; let sent = 0; let batches = 0;
  for await (const users of iterateById({
    connection,
    table: 'pamet_users',
    where: 'weekly_digest_enabled=TRUE AND latest_digest_json IS NOT NULL',
    columns: 'id,email,latest_digest_json',
    idColumn: 'id',
    batchSize: size
  })) {
    batches += 1;
    for (const user of users) {
      attempted += 1;
      const summary = parse(user.latest_digest_json);
      const top = Array.isArray(summary.topSymptoms) ? summary.topSymptoms.slice(0, 3) : [];
      const body = `<h1 style="font-size:22px">Your weekly summary is ready.</h1><p>Here is your weekly Pamet overview based on the aggregate summary prepared on your device.</p><div style="background:#F4F5F2;border-radius:12px;padding:14px"><p><strong>${Number(summary.loggedDays || 0)}</strong> days logged</p><p><strong>${Number(summary.symptomDays || 0)}</strong> symptom days</p><p><strong>${Number(summary.averageSleep || 0).toFixed(1)}h</strong> average sleep</p></div>${top.length ? `<p><strong>Most frequently recorded</strong></p><ul>${top.map((item) => `<li>${html(item.name)} — ${Number(item.count || 0)} day(s)</li>`).join('')}</ul>` : ''}<p>Pamet observes. Pamet does not diagnose.</p><p><a href="${html(appBaseUrl)}">Open Pamet</a></p>`;
      try {
        if (await sendMail(user.email, 'Your Pamet weekly summary is ready', body)) sent += 1;
      } catch (error) {
        log({ event: 'digest.email_failed', userId: String(user.id), message: error.message });
      }
    }
  }
  return { attempted, sent, batches, batchSize: size };
}

function subscriptionEntitled(subscription) {
  if (subscription.status === 'active') return true;
  if (subscription.status !== 'trialing') return false;
  if (subscription.default_payment_method) return true;
  return !!(subscription.pending_setup_intent && typeof subscription.pending_setup_intent === 'object' && subscription.pending_setup_intent.status === 'succeeded');
}

async function runStripeReconcile({ connection, stripe, priceToPlan, batchSize = 100, log = () => {} }) {
  const size = clampBatchSize(batchSize, 100, 500);
  let checked = 0; let corrected = 0; let batches = 0;
  const failures = [];
  for await (const users of iterateById({
    connection,
    table: 'pamet_users',
    where: 'stripe_subscription_id IS NOT NULL',
    columns: 'id,stripe_subscription_id,plan,subscription_status',
    idColumn: 'id',
    batchSize: size
  })) {
    batches += 1;
    for (const user of users) {
      checked += 1;
      try {
        const subscription = await stripe.subscriptions.retrieve(user.stripe_subscription_id, { expand: ['pending_setup_intent', 'default_payment_method'] });
        const item = subscription.items?.data?.[0];
        const expectedPlan = subscriptionEntitled(subscription) ? priceToPlan(item?.price?.id) : 'free';
        if (expectedPlan !== user.plan || subscription.status !== user.subscription_status) {
          await connection.execute('UPDATE pamet_users SET plan=?,subscription_status=? WHERE id=?', [expectedPlan, subscription.status, user.id]);
          corrected += 1;
        }
      } catch (error) {
        const failure = { userId: String(user.id), code: String(error.code || 'stripe_error').slice(0, 40) };
        failures.push(failure);
        log({ event: 'billing.reconcile_failed', ...failure });
      }
    }
  }
  return { checked, corrected, failed: failures.length, failures: failures.slice(0, 50), batches, batchSize: size };
}

module.exports = { runPushReminders, runWeeklyDigest, runStripeReconcile, subscriptionEntitled };
