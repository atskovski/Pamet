'use strict';

const crypto = require('crypto');
const { promisify } = require('util');
const mysql = require('mysql2/promise');

const scryptAsync = promisify(crypto.scrypt);
const SESSION_COOKIE = 'pamet_session';
let pool;

const sha = (value) => crypto.createHash('sha256').update(String(value || '')).digest('hex');
const readCookie = (req, name) => String(req.headers.cookie || '').split(';').map((item) => item.trim().split('=')).find(([key]) => key === name)?.[1] || '';
const readBearer = (req) => { const value = String(req.headers.authorization || ''); return value.startsWith('Bearer ') ? value.slice(7).trim() : ''; };
const installationKeyOk = (value) => /^[a-f0-9]{64}$/i.test(value);
const emailOk = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

function databaseOptions() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const ssl = String(process.env.DB_SSL || '').toLowerCase() === 'true'
    ? { rejectUnauthorized: String(process.env.DB_SSL_REJECT_UNAUTHORIZED || 'true').toLowerCase() !== 'false' }
    : undefined;
  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    database: process.env.DB_NAME,
    user: process.env.DB_USER || process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    ssl,
    waitForConnections: true,
    connectionLimit: 2,
    connectTimeout: 10000,
    enableKeepAlive: true
  };
}

async function db() {
  if (pool) return pool;
  if (!process.env.DATABASE_URL && !process.env.DB_HOST) throw Object.assign(new Error('Database is not configured.'), { status: 503 });
  pool = mysql.createPool(databaseOptions());
  await pool.query('SELECT 1');
  return pool;
}

async function passwordHash(password, salt) {
  return (await scryptAsync(String(password), Buffer.from(salt, 'hex'), 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })).toString('hex');
}

function clearSessionCookie(res) {
  const secure = (process.env.NODE_ENV || 'development') === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`);
}

async function userFromRequest(req) {
  const connection = await db();
  const rawSession = readCookie(req, SESSION_COOKIE);
  if (rawSession) {
    const [rows] = await connection.execute(`SELECT u.id,u.email,s.id session_id FROM pamet_sessions s JOIN pamet_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>NOW() LIMIT 1`, [sha(rawSession)]);
    if (rows.length) return rows[0];
  }
  const bearer = readBearer(req);
  if (installationKeyOk(bearer)) {
    const credentialHash = sha(bearer);
    const [rows] = await connection.execute(`SELECT u.id,u.email,d.id device_id FROM pamet_devices d JOIN pamet_users u ON u.id=d.user_id WHERE d.credential_hash=? AND d.status='active' LIMIT 1`, [credentialHash]);
    if (rows.length) return rows[0];
    const [legacy] = await connection.execute('SELECT id,email FROM pamet_users WHERE device_key_hash=? LIMIT 1', [credentialHash]);
    if (legacy.length) return legacy[0];
  }
  return null;
}

async function legacyUpgrade(req, res, next) {
  try {
    const password = String(req.body && req.body.password || '');
    const email = String(req.body && req.body.email || '').trim().toLowerCase().slice(0, 254);
    const bearer = readBearer(req);
    if (!installationKeyOk(bearer) || !emailOk(email) || password.length < 12 || password.length > 128) return res.status(400).json({ error: 'A valid legacy device, email, and password of at least 12 characters are required.' });
    const connection = await db();
    const credentialHash = sha(bearer);
    const [rows] = await connection.execute(`SELECT u.id,u.email FROM pamet_users u LEFT JOIN pamet_devices d ON d.user_id=u.id AND d.credential_hash=? AND d.status='active' WHERE u.email=? AND (u.device_key_hash=? OR d.id IS NOT NULL) LIMIT 1`, [credentialHash, email, credentialHash]);
    if (!rows.length) return res.status(403).json({ error: 'This legacy device is not authorized for that account.' });
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = await passwordHash(password, salt);
    await connection.execute('UPDATE pamet_users SET password_hash=?,password_salt=? WHERE id=?', [hash, salt, rows[0].id]);
    await connection.execute('INSERT INTO pamet_audit_log(user_id,event_type,event_json) VALUES(?,?,?)', [rows[0].id, 'identity.legacy_password_upgraded', JSON.stringify({ method: 'authorized_device' })]);
    res.json({ upgraded: true });
  } catch (error) { next(error); }
}

async function logoutAll(req, res, next) {
  try {
    const user = await userFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Authentication required.' });
    const connection = await db();
    const [result] = await connection.execute('UPDATE pamet_sessions SET revoked_at=NOW() WHERE user_id=? AND revoked_at IS NULL', [user.id]);
    await connection.execute('INSERT INTO pamet_audit_log(user_id,event_type,event_json) VALUES(?,?,?)', [user.id, 'identity.all_sessions_revoked', JSON.stringify({ sessions: Number(result.affectedRows || 0) })]);
    clearSessionCookie(res);
    res.json({ loggedOut: true, revokedSessions: Number(result.affectedRows || 0) });
  } catch (error) { next(error); }
}

module.exports = { legacyUpgrade, logoutAll };
