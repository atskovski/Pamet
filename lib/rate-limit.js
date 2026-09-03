'use strict';

const { createClient } = require('redis');

let client;
let connection;
let distributedFallback;
const local = new Map();

async function redis() {
  if (!process.env.REDIS_URL) return null;
  if (client && client.isReady) return client;
  if (!connection) {
    client = createClient({ url: process.env.REDIS_URL, socket: { connectTimeout: 5000, reconnectStrategy: (attempt) => Math.min(attempt * 250, 5000) } });
    client.on('error', (error) => console.error('redis_error', { message: error.message }));
    connection = client.connect().then(() => client).catch((error) => { connection = null; throw error; });
  }
  return connection;
}

function memoryHit(key, windowMs) {
  const now = Date.now();
  let item = local.get(key);
  if (!item || item.resetAt <= now) item = { count: 0, resetAt: now + windowMs };
  item.count += 1;
  local.set(key, item);
  if (local.size > 5000) for (const [entry, value] of local) if (value.resetAt <= now) local.delete(entry);
  return item;
}

function distributedRateLimit({ windowMs, max, name, keyGenerator }) {
  return async (req, res, next) => {
    if (process.env.DISABLE_RATE_LIMITS === 'true') return next();
    let identity;
    try { identity = typeof keyGenerator === 'function' ? keyGenerator(req) : ''; }
    catch (error) { return next(error); }
    identity = String(identity || req.ip || req.socket.remoteAddress || 'unknown').slice(0, 180);
    const bucket = Math.floor(Date.now() / windowMs);
    const key = `pamet:limit:${name}:${identity}:${bucket}`;
    let count;
    let resetAt = (bucket + 1) * windowMs;
    try {
      const store = await redis();
      if (store) {
        count = await store.incr(key);
        if (count === 1) await store.pExpire(key, windowMs + 1000);
      } else if (distributedFallback) {
        const item = await distributedFallback.hit(key, windowMs); count = item.count; resetAt = item.resetAt;
      } else {
        const item = memoryHit(key, windowMs); count = item.count; resetAt = item.resetAt;
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'production') return next(Object.assign(new Error('Distributed rate limiting is unavailable.'), { status: 503 }));
      const item = memoryHit(key, windowMs); count = item.count; resetAt = item.resetAt;
    }
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - count)));
    res.setHeader('RateLimit-Reset', String(Math.ceil(resetAt / 1000)));
    if (count > max) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))));
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }
    next();
  };
}

async function rateLimitReady() {
  if (!process.env.REDIS_URL && distributedFallback) { try { await distributedFallback.ready(); return { configured: true, ready: true, store: 'mysql' }; } catch { return { configured: true, ready: false, store: 'mysql' }; } }
  if (!process.env.REDIS_URL) return { configured: false, ready: false };
  try { const store = await redis(); await store.ping(); return { configured: true, ready: true }; }
  catch { return { configured: true, ready: false }; }
}

function configureDistributedFallback(backend) { distributedFallback = backend; }

module.exports = { distributedRateLimit, rateLimitReady, configureDistributedFallback };
