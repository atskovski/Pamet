'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { runPushReminders, runWeeklyDigest, runStripeReconcile, subscriptionEntitled } = require('../lib/operations-jobs');

function connectionFor(tableRows) {
  const updates = [];
  return {
    updates,
    async execute(sql, params = []) {
      if (sql.startsWith('SELECT')) {
        const table = Object.keys(tableRows).find((name) => sql.includes(`\`${name}\``));
        if (!table) return [[]];
        const cursor = params[params.length - 1];
        const limit = Number((sql.match(/LIMIT (\d+)/) || [])[1] || 250);
        const rows = tableRows[table]
          .filter((row) => String(row.id) > String(cursor === 0 ? '' : cursor))
          .sort((a, b) => String(a.id).localeCompare(String(b.id)))
          .slice(0, limit);
        return [rows];
      }
      updates.push({ sql, params });
      return [{ affectedRows: 1 }];
    }
  };
}

test('push reminder job processes UUID subscriptions in bounded batches', async () => {
  const hour = new Date().getUTCHours();
  const connection = connectionFor({ pamet_push_subscriptions: [
    { id: '11111111-1111-4111-8111-111111111111', subscription_json: '{}', timezone: 'UTC', reminder_hour: hour, last_sent_local_date: null, failure_count: 0 },
    { id: '22222222-2222-4222-8222-222222222222', subscription_json: '{}', timezone: 'UTC', reminder_hour: hour, last_sent_local_date: null, failure_count: 0 }
  ] });
  let deliveries = 0;
  const result = await runPushReminders({ connection, push: { send: async () => { deliveries += 1; } }, appBaseUrl: 'https://pamet.example', batchSize: 1 });
  assert.equal(result.checked, 2);
  assert.equal(result.batches, 2);
  assert.equal(result.sent, 2);
  assert.equal(deliveries, 2);
  assert.equal(connection.updates.length, 2);
});

test('weekly digest uses bounded batches and sends aggregate summaries', async () => {
  const connection = connectionFor({ pamet_users: [
    { id: 1, email: 'one@example.test', latest_digest_json: JSON.stringify({ loggedDays: 3, symptomDays: 1, averageSleep: 7, topSymptoms: [{ name: 'Headache', count: 1 }] }) },
    { id: 2, email: 'two@example.test', latest_digest_json: JSON.stringify({ loggedDays: 5, symptomDays: 2, averageSleep: 6.5 }) }
  ] });
  const recipients = [];
  const result = await runWeeklyDigest({ connection, sendMail: async (to) => { recipients.push(to); return true; }, appBaseUrl: 'https://pamet.example', batchSize: 1 });
  assert.deepEqual(recipients, ['one@example.test', 'two@example.test']);
  assert.equal(result.attempted, 2);
  assert.equal(result.sent, 2);
  assert.equal(result.batches, 2);
});

test('stripe reconciliation updates only mismatched entitlements', async () => {
  const connection = connectionFor({ pamet_users: [
    { id: 1, stripe_subscription_id: 'sub_1', plan: 'free', subscription_status: 'none' },
    { id: 2, stripe_subscription_id: 'sub_2', plan: 'free', subscription_status: 'canceled' }
  ] });
  const stripe = { subscriptions: { retrieve: async (id) => id === 'sub_1'
    ? { status: 'active', items: { data: [{ price: { id: 'price_pro' } }] } }
    : { status: 'canceled', items: { data: [{ price: { id: 'price_pro' } }] } } } };
  const result = await runStripeReconcile({ connection, stripe, priceToPlan: (id) => id === 'price_pro' ? 'pro' : 'free', batchSize: 1 });
  assert.equal(result.checked, 2);
  assert.equal(result.corrected, 1);
  assert.equal(result.failed, 0);
  assert.equal(connection.updates.length, 1);
  assert.deepEqual(connection.updates[0].params, ['pro', 'active', 1]);
});

test('trial entitlement requires completed payment setup', () => {
  assert.equal(subscriptionEntitled({ status: 'trialing', default_payment_method: 'pm_1' }), true);
  assert.equal(subscriptionEntitled({ status: 'trialing', pending_setup_intent: { status: 'succeeded' } }), true);
  assert.equal(subscriptionEntitled({ status: 'trialing', pending_setup_intent: { status: 'requires_payment_method' } }), false);
  assert.equal(subscriptionEntitled({ status: 'past_due' }), false);
});
