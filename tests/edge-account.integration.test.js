'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const mysql = require('mysql2/promise');

const enabled = process.env.PAMET_INTEGRATION_TESTS === 'true';
const sha = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function dbOptions() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  return {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    database: process.env.DB_NAME || 'pamet_test',
    user: process.env.DB_USER || process.env.DB_USERNAME || 'pamet',
    password: process.env.DB_PASSWORD || 'pamet'
  };
}

async function waitReady(base, child, output) {
  for (let i = 0; i < 80; i += 1) {
    if (child.exitCode !== null) throw new Error(`Pamet exited early:\n${output()}`);
    try { const response = await fetch(`${base}/api/ready`); if (response.status === 200) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 125));
  }
  throw new Error(`Pamet did not become ready:\n${output()}`);
}

function cookieFrom(response) {
  const raw = response.headers.get('set-cookie');
  assert.ok(raw, 'expected session cookie');
  return raw.split(';', 1)[0];
}

if (!enabled) {
  test('edge account migration matrix', { skip: 'set PAMET_INTEGRATION_TESTS=true' }, () => {});
} else {
  test('legacy device upgrades once and logout-all revokes every server session', async (t) => {
    const root = path.resolve(__dirname, '..');
    const run = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    const email = `legacy+${run}@example.com`;
    const password = `Pamet-Legacy-${run}!A1`;
    const deviceToken = crypto.randomBytes(32).toString('hex');
    const deviceHash = sha(deviceToken);
    const localUserId = `legacy-${run}`;
    const deviceId = crypto.randomUUID();
    const port = await reservePort();
    const base = `http://127.0.0.1:${port}`;
    let output = '';
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
        IDENTITY_ENCRYPTION_KEY: process.env.IDENTITY_ENCRYPTION_KEY || '22'.repeat(32)
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout.on('data', (chunk) => { output += chunk.toString(); });
    child.stderr.on('data', (chunk) => { output += chunk.toString(); });

    const pool = mysql.createPool(dbOptions());
    let userId;
    t.after(async () => {
      try { if (userId) { await pool.execute('DELETE FROM pamet_audit_log WHERE user_id=?', [userId]); await pool.execute('DELETE FROM pamet_users WHERE id=?', [userId]); } } catch {}
      await pool.end().catch(() => {});
      if (child.exitCode === null) child.kill('SIGTERM');
    });

    await waitReady(base, child, () => output);
    const [insert] = await pool.execute('INSERT INTO pamet_users(local_user_id,device_key_hash,email,first_name,last_name,timezone) VALUES(?,?,?,?,?,?)', [localUserId, deviceHash, email, 'Legacy', 'CI', 'America/Phoenix']);
    userId = insert.insertId;
    await pool.execute('INSERT INTO pamet_devices(id,user_id,credential_hash,label,status,last_used_at) VALUES(?,?,?,?,\'active\',NOW())', [deviceId, userId, deviceHash, 'Legacy CI device']);

    const before = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    assert.equal(before.status, 401);

    const upgraded = await fetch(`${base}/api/auth/legacy-upgrade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${deviceToken}` },
      body: JSON.stringify({ email, password })
    });
    assert.equal(upgraded.status, 200, await upgraded.text());
    assert.equal((await upgraded.json()).upgraded, true);

    const [passwordRows] = await pool.execute('SELECT password_hash,password_salt FROM pamet_users WHERE id=?', [userId]);
    assert.ok(passwordRows[0].password_hash);
    assert.ok(passwordRows[0].password_salt);

    const firstLogin = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    assert.equal(firstLogin.status, 200, await firstLogin.text());
    const firstCookie = cookieFrom(firstLogin);

    const secondLogin = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    assert.equal(secondLogin.status, 200);
    const secondCookie = cookieFrom(secondLogin);

    const logoutAll = await fetch(`${base}/api/auth/logout-all`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: firstCookie }, body: '{}' });
    assert.equal(logoutAll.status, 200, await logoutAll.text());
    const logoutBody = await logoutAll.json();
    assert.equal(logoutBody.loggedOut, true);
    assert.ok(logoutBody.revokedSessions >= 2);

    for (const cookie of [firstCookie, secondCookie]) {
      const session = await fetch(`${base}/api/auth/session`, { headers: { Cookie: cookie } });
      assert.equal(session.status, 401);
    }

    const [audit] = await pool.execute("SELECT event_type FROM pamet_audit_log WHERE user_id=? AND event_type IN ('identity.legacy_password_upgraded','identity.all_sessions_revoked')", [userId]);
    assert.deepEqual(new Set(audit.map((row) => row.event_type)), new Set(['identity.legacy_password_upgraded', 'identity.all_sessions_revoked']));
  });
}
