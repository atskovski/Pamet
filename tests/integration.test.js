'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const mysql = require('mysql2/promise');
const Stripe = require('stripe');

const enabled = process.env.PAMET_INTEGRATION_TESTS === 'true';

async function reservePort() {
  const socket = net.createServer();
  await new Promise((resolve, reject) => socket.once('error', reject).listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  return port;
}

async function waitForReady(base, child, output) {
  let lastError;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Pamet integration server exited early.\n${output()}`);
    try {
      const response = await fetch(`${base}/api/ready`);
      if (response.status === 200) return;
      lastError = new Error(`readiness returned ${response.status}: ${await response.text()}`);
    } catch (error) { lastError = error; }
    await new Promise((resolve) => setTimeout(resolve, 125));
  }
  throw new Error(`Pamet integration server did not become ready: ${lastError && lastError.message}\n${output()}`);
}

function cookieFrom(response) {
  const raw = response.headers.get('set-cookie');
  assert.ok(raw, 'expected a session cookie');
  return raw.split(';', 1)[0];
}

function dbOptions() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  return {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    database: process.env.DB_NAME || 'pamet_test',
    user: process.env.DB_USER || process.env.DB_USERNAME || 'pamet',
    password: process.env.DB_PASSWORD || 'pamet',
    waitForConnections: true,
    connectionLimit: 2
  };
}

if (!enabled) {
  test('production integration matrix', { skip: 'set PAMET_INTEGRATION_TESTS=true to run MySQL-backed lifecycle tests' }, () => {});
} else {
  test('production integration matrix', async (t) => {
    const root = path.resolve(__dirname, '..');
    const run = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    const email = `ci+${run}@example.com`;
    const password = `Pamet-CI-${run}!A1`;
    const nextPassword = `Pamet-CI-${run}!B2`;
    const profileId = `profile-${run}-primary`;
    const stripeSecret = 'sk_test_pamet_ci_not_networked';
    const webhookSecret = `whsec_pamet_ci_${run}`;
    const ultraPrice = `price_ci_ultra_${run}`;
    const capturePath = path.join(os.tmpdir(), `pamet-email-${run}.jsonl`);
    const port = await reservePort();
    const base = `http://127.0.0.1:${port}`;
    const shim = path.join(root, 'tests', 'integration-network-shim.js');
    const nodeOptions = [process.env.NODE_OPTIONS, `--require=${shim}`].filter(Boolean).join(' ');
    try { fs.unlinkSync(capturePath); } catch {}

    let childOutput = '';
    const child = spawn(process.execPath, ['secure-server.js'], {
      cwd: root,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PORT: String(port),
        APP_BASE_URL: base,
        AUTO_MIGRATE: 'true',
        DISABLE_RATE_LIMITS: 'true',
        DISABLE_BREACHED_PASSWORD_CHECK: 'true',
        IDENTITY_ENCRYPTION_KEY: process.env.IDENTITY_ENCRYPTION_KEY || '11'.repeat(32),
        STRIPE_SECRET_KEY: stripeSecret,
        STRIPE_WEBHOOK_SECRET: webhookSecret,
        STRIPE_PRICE_ULTRA_MONTHLY: ultraPrice,
        STRIPE_PRICE_ULTRA_ANNUAL: `price_ci_ultra_annual_${run}`,
        STRIPE_PRICE_PRO_MONTHLY: `price_ci_pro_${run}`,
        STRIPE_PRICE_PRO_ANNUAL: `price_ci_pro_annual_${run}`,
        RESEND_API_KEY: 're_ci_intercepted',
        EMAIL_FROM: 'Pamet CI <ci@example.com>',
        PAMET_TEST_EMAIL_CAPTURE: capturePath,
        NODE_OPTIONS: nodeOptions
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout.on('data', (chunk) => { childOutput += chunk.toString(); });
    child.stderr.on('data', (chunk) => { childOutput += chunk.toString(); });

    let pool;
    let userId;
    const stripeEventIds = [];

    t.after(async () => {
      if (pool) {
        try {
          if (userId) {
            await pool.execute('DELETE FROM pamet_audit_log WHERE user_id=?', [userId]);
            await pool.execute('DELETE FROM pamet_users WHERE id=?', [userId]);
          }
          for (const eventId of stripeEventIds) await pool.execute('DELETE FROM pamet_stripe_events WHERE event_id=?', [eventId]);
        } catch {}
        await pool.end().catch(() => {});
      }
      if (child.exitCode === null) {
        child.kill('SIGTERM');
        await Promise.race([
          new Promise((resolve) => child.once('exit', resolve)),
          new Promise((resolve) => setTimeout(resolve, 1500))
        ]);
        if (child.exitCode === null) child.kill('SIGKILL');
      }
      try { fs.unlinkSync(capturePath); } catch {}
    });

    await waitForReady(base, child, () => childOutput);
    pool = mysql.createPool(dbOptions());

    const request = async (pathname, { method = 'GET', cookie, body, headers = {} } = {}) => fetch(`${base}${pathname}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });

    let primaryCookie;

    await t.test('register, session, login, and logout lifecycle', async () => {
      const registered = await request('/api/auth/register', {
        method: 'POST',
        body: { email, firstName: 'CI', lastName: 'Lifecycle', password, timezone: 'America/Phoenix' }
      });
      assert.equal(registered.status, 201, await registered.text());
      const registerBody = await registered.json();
      userId = registerBody.user.id;
      primaryCookie = cookieFrom(registered);

      const session = await request('/api/auth/session', { cookie: primaryCookie });
      assert.equal(session.status, 200);
      assert.equal((await session.json()).user.email, email);

      const login = await request('/api/auth/login', { method: 'POST', body: { email, password } });
      assert.equal(login.status, 200);
      const disposableCookie = cookieFrom(login);

      const logout = await request('/api/auth/logout', { method: 'POST', cookie: disposableCookie, body: {} });
      assert.equal(logout.status, 200);
      assert.equal((await logout.json()).loggedOut, true);

      const loggedOutSession = await request('/api/auth/session', { cookie: disposableCookie });
      assert.equal(loggedOutSession.status, 401);
    });

    await t.test('password change invalidates other sessions but preserves the current session', async () => {
      const secondLogin = await request('/api/auth/login', { method: 'POST', body: { email, password } });
      assert.equal(secondLogin.status, 200);
      const secondCookie = cookieFrom(secondLogin);

      const changed = await request('/api/auth/password', {
        method: 'POST', cookie: primaryCookie, body: { currentPassword: password, newPassword: nextPassword }
      });
      assert.equal(changed.status, 200, await changed.text());

      const invalidated = await request('/api/auth/session', { cookie: secondCookie });
      assert.equal(invalidated.status, 401);

      const preserved = await request('/api/auth/session', { cookie: primaryCookie });
      assert.equal(preserved.status, 200);

      const oldPassword = await request('/api/auth/login', { method: 'POST', body: { email, password } });
      assert.equal(oldPassword.status, 401);

      const newPasswordLogin = await request('/api/auth/login', { method: 'POST', body: { email, password: nextPassword } });
      assert.equal(newPasswordLogin.status, 200);
      primaryCookie = cookieFrom(newPasswordLogin);
    });

    const stripe = new Stripe(stripeSecret);
    const postWebhook = async (event) => {
      const payload = JSON.stringify(event);
      const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });
      return fetch(`${base}/api/stripe/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'stripe-signature': signature },
        body: payload
      });
    };

    await t.test('Stripe webhook is idempotent and entitlements are server-authoritative', async () => {
      const free = await request('/api/entitlements', { cookie: primaryCookie });
      assert.equal(free.status, 200);
      const freeBody = await free.json();
      assert.equal(freeBody.plan, 'free');
      assert.equal(freeBody.capabilities.sharing, false);
      assert.equal(freeBody.capabilities.encryptedSync, false);

      const eventId = `evt_ci_ultra_${run}`;
      stripeEventIds.push(eventId);
      const event = {
        id: eventId,
        object: 'event',
        type: 'customer.subscription.updated',
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        pending_webhooks: 1,
        data: { object: {
          id: `sub_ci_${run}`,
          object: 'subscription',
          customer: `cus_ci_${run}`,
          status: 'active',
          metadata: { pamet_user_id: String(userId) },
          default_payment_method: `pm_ci_${run}`,
          items: { data: [{ price: { id: ultraPrice } }] }
        } }
      };

      const first = await postWebhook(event);
      assert.equal(first.status, 200, await first.text());
      assert.equal((await first.json()).received, true);

      const replay = await postWebhook(event);
      assert.equal(replay.status, 200);
      const replayBody = await replay.json();
      assert.equal(replayBody.received, true);
      assert.equal(replayBody.duplicate, true);

      const entitled = await request('/api/entitlements', { cookie: primaryCookie });
      assert.equal(entitled.status, 200);
      const entitledBody = await entitled.json();
      assert.equal(entitledBody.plan, 'ultra');
      assert.equal(entitledBody.capabilities.sharing, true);
      assert.equal(entitledBody.capabilities.encryptedSync, true);
      assert.equal(entitledBody.capabilities.multipleProfiles, true);

      const [events] = await pool.execute('SELECT COUNT(*) n FROM pamet_stripe_events WHERE event_id=?', [eventId]);
      assert.equal(Number(events[0].n), 1);
    });

    await t.test('device revocation disables the revoked bearer credential', async () => {
      const deviceId = crypto.randomUUID();
      const deviceToken = crypto.randomBytes(32).toString('hex');
      const credentialHash = crypto.createHash('sha256').update(deviceToken).digest('hex');
      await pool.execute('INSERT INTO pamet_devices(id,user_id,credential_hash,label,last_used_at) VALUES(?,?,?,?,NOW())', [deviceId, userId, credentialHash, 'CI secondary device']);

      const listed = await request('/api/security/devices', { cookie: primaryCookie });
      assert.equal(listed.status, 200);
      assert.ok((await listed.json()).devices.some((device) => device.id === deviceId && device.status === 'active'));

      const revoked = await request(`/api/security/devices/${deviceId}`, { method: 'DELETE', cookie: primaryCookie, body: {} });
      assert.equal(revoked.status, 200, await revoked.text());
      assert.equal((await revoked.json()).revoked, true);

      const bearerAfterRevoke = await request('/api/auth/session', { headers: { Authorization: `Bearer ${deviceToken}` } });
      assert.equal(bearerAfterRevoke.status, 401);

      const [rows] = await pool.execute('SELECT status,revoked_at FROM pamet_devices WHERE id=?', [deviceId]);
      assert.equal(rows[0].status, 'revoked');
      assert.ok(rows[0].revoked_at);
    });

    await t.test('sharing invite create, public fetch, revoke, and post-revoke denial', async () => {
      const created = await request('/api/sharing/invites', {
        method: 'POST',
        cookie: primaryCookie,
        body: {
          kind: 'caregiver',
          name: 'CI Caregiver',
          email: `caregiver+${run}@example.com`,
          organization: 'Pamet CI',
          permission: 'download',
          profileName: 'Primary profile',
          expiresInDays: 7,
          snapshot: { summary: 'CI-only synthetic health summary', entries: 3, disclaimer: 'not a diagnosis' }
        }
      });
      assert.equal(created.status, 201, await created.text());
      const createdBody = await created.json();
      assert.equal(createdBody.permission, 'download');
      assert.equal(createdBody.expiresInDays, 7);

      const captured = fs.readFileSync(capturePath, 'utf8').trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
      const message = captured.find((mail) => String(mail.subject).includes('health summary'));
      assert.ok(message, 'expected intercepted sharing email');
      const tokenMatch = String(message.html).match(/token=([a-f0-9]{64})/i);
      assert.ok(tokenMatch, 'expected a 64-character sharing token in the email');
      const shareToken = tokenMatch[1];

      const publicView = await request(`/api/share/${shareToken}`);
      assert.equal(publicView.status, 200);
      const publicBody = await publicView.json();
      assert.equal(publicBody.permission, 'download');
      assert.equal(publicBody.snapshot.entries, 3);

      const revoke = await request(`/api/sharing/invites/${createdBody.id}`, { method: 'DELETE', cookie: primaryCookie, body: {} });
      assert.equal(revoke.status, 200);
      assert.equal((await revoke.json()).revoked, true);

      const afterRevoke = await request(`/api/share/${shareToken}`);
      assert.equal(afterRevoke.status, 404);
    });

    await t.test('encrypted sync enforces optimistic revisions and returns opaque ciphertext', async () => {
      const ciphertextV1 = Buffer.from(`opaque encrypted journal ${run} revision one`).toString('base64');
      const nonceV1 = crypto.randomBytes(12).toString('base64');
      const saved = await request(`/api/sync/${profileId}`, {
        method: 'PUT', cookie: primaryCookie,
        body: { ciphertext: ciphertextV1, nonce: nonceV1, keyVersion: 1, expectedRevision: 0 }
      });
      assert.equal(saved.status, 200, await saved.text());
      const savedBody = await saved.json();
      assert.equal(savedBody.revision, 1);

      const fetched = await request(`/api/sync/${profileId}`, { cookie: primaryCookie });
      assert.equal(fetched.status, 200);
      const fetchedBody = await fetched.json();
      assert.equal(fetchedBody.revision, 1);
      assert.equal(fetchedBody.ciphertext, ciphertextV1);
      assert.equal(fetchedBody.nonce, nonceV1);

      const stale = await request(`/api/sync/${profileId}`, {
        method: 'PUT', cookie: primaryCookie,
        body: { ciphertext: Buffer.from(`stale encrypted journal ${run} payload`).toString('base64'), nonce: crypto.randomBytes(12).toString('base64'), keyVersion: 1, expectedRevision: 0 }
      });
      assert.equal(stale.status, 409);
      const staleBody = await stale.json();
      assert.equal(staleBody.currentRevision, 1);

      const current = await request(`/api/sync/${profileId}`, {
        method: 'PUT', cookie: primaryCookie,
        body: { ciphertext: Buffer.from(`opaque encrypted journal ${run} revision two`).toString('base64'), nonce: crypto.randomBytes(12).toString('base64'), keyVersion: 1, expectedRevision: 1 }
      });
      assert.equal(current.status, 200);
      assert.equal((await current.json()).revision, 2);
    });

    await t.test('subscription downgrade removes Ultra capabilities and closes gated APIs', async () => {
      const eventId = `evt_ci_canceled_${run}`;
      stripeEventIds.push(eventId);
      const canceled = {
        id: eventId,
        object: 'event',
        type: 'customer.subscription.deleted',
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        pending_webhooks: 1,
        data: { object: {
          id: `sub_ci_${run}`,
          object: 'subscription',
          customer: `cus_ci_${run}`,
          status: 'canceled',
          metadata: { pamet_user_id: String(userId) },
          items: { data: [{ price: { id: ultraPrice } }] }
        } }
      };
      const response = await postWebhook(canceled);
      assert.equal(response.status, 200, await response.text());

      const entitlement = await request('/api/entitlements', { cookie: primaryCookie });
      assert.equal(entitlement.status, 200);
      const body = await entitlement.json();
      assert.equal(body.plan, 'free');
      assert.equal(body.capabilities.sharing, false);
      assert.equal(body.capabilities.encryptedSync, false);

      const syncDenied = await request(`/api/sync/${profileId}`, { cookie: primaryCookie });
      assert.equal(syncDenied.status, 403);

      const shareDenied = await request('/api/sharing/invites', {
        method: 'POST', cookie: primaryCookie,
        body: { kind: 'caregiver', name: 'Denied', email: `denied+${run}@example.com`, snapshot: { synthetic: true } }
      });
      assert.equal(shareDenied.status, 403);
    });
  });
}
