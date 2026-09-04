'use strict';

const express = require('express');
const mysql = require('mysql2/promise');
const Stripe = require('stripe');
const push = require('../lib/push');
const { distributedRateLimit } = require('../lib/rate-limit');
const { createJobAuthorizer, githubOidcJwksReady } = require('../lib/job-auth');
const { runPushReminders, runWeeklyDigest, runStripeReconcile } = require('../lib/operations-jobs');

let pool;
let poolInitialization;

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
    connectionLimit: Math.max(1, Math.min(4, Number(process.env.JOB_DB_CONNECTION_LIMIT || 2))),
    connectTimeout: 10000,
    enableKeepAlive: true
  };
}
async function database() {
  if (pool) return pool;
  if (poolInitialization) return poolInitialization;
  if (!process.env.DATABASE_URL && !process.env.DB_HOST) throw new Error('Database is not configured.');
  poolInitialization = (async () => {
    const candidate = mysql.createPool(databaseOptions());
    try {
      await candidate.query('SELECT 1');
      pool = candidate;
      return pool;
    } catch (error) {
      await candidate.end().catch(() => {});
      throw error;
    } finally {
      poolInitialization = null;
    }
  })();
  return poolInitialization;
}

async function sendMail(to, subject, body) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return false;
  const shell = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#17342b;background:#f6f8f7;padding:24px"><div style="max-width:620px;margin:auto;background:white;border-radius:18px;padding:24px">${body}<hr style="border:0;border-top:1px solid #dfe6e3;margin:24px 0"><p style="font-size:12px;color:#66736f">Pamet · Your health history, finally useful.</p></div></body></html>`;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, html: shell }),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`Email provider returned ${response.status}.`);
  return true;
}

function priceToPlan(id) {
  if ([process.env.STRIPE_PRICE_PRO_MONTHLY, process.env.STRIPE_PRICE_PRO_ANNUAL].filter(Boolean).includes(id)) return 'pro';
  if ([process.env.STRIPE_PRICE_ULTRA_MONTHLY, process.env.STRIPE_PRICE_ULTRA_ANNUAL].filter(Boolean).includes(id)) return 'ultra';
  return 'free';
}

function createOperationsJobsRouter({ appBaseUrl, operationalLog = console.log } = {}) {
  const router = express.Router();
  const cronLimit = distributedRateLimit({ windowMs: 15 * 60 * 1000, max: 10, name: 'ops-cron' });
  const batchSize = Number(process.env.PAMET_JOB_BATCH_SIZE || 250);
  const authCheck = createJobAuthorizer({ allowedWorkflows: ['job-auth-acceptance.yml'], allowedEvents: ['push', 'workflow_dispatch'] });
  const reminderAuth = createJobAuthorizer({ allowedWorkflows: ['push-reminders.yml'] });
  const digestAuth = createJobAuthorizer({ allowedWorkflows: ['weekly-digest.yml'] });
  const stripeAuth = createJobAuthorizer({ allowedWorkflows: ['stripe-reconcile.yml'] });

  const log = (event) => {
    try { operationalLog(JSON.stringify({ service: 'pamet', at: new Date().toISOString(), ...event })); } catch { /* telemetry must not break jobs */ }
  };

  router.get('/api/jobs/oidc-ready', async (req, res) => {
    const ok = await githubOidcJwksReady();
    res.status(ok ? 200 : 503).json({ ok });
  });

  router.post('/api/jobs/auth-check', cronLimit, authCheck, (req, res) => {
    res.json({ authorized: true, source: req.jobAuth && req.jobAuth.source || 'unknown' });
  });

  router.post('/api/jobs/push-reminders', cronLimit, reminderAuth, async (req, res, next) => {
    try {
      if (!push.configured()) return res.status(503).json({ error: 'Web Push is not configured.' });
      const connection = await database();
      const result = await runPushReminders({ connection, push, appBaseUrl, batchSize, log });
      log({ event: 'job.push_reminders_completed', ...result });
      res.json(result);
    } catch (error) { next(error); }
  });

  router.post('/api/jobs/weekly-digest', cronLimit, digestAuth, async (req, res, next) => {
    try {
      if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return res.status(503).json({ error: 'Weekly email is not configured.' });
      const connection = await database();
      const result = await runWeeklyDigest({ connection, sendMail, appBaseUrl, batchSize, log });
      log({ event: 'job.weekly_digest_completed', ...result });
      res.json(result);
    } catch (error) { next(error); }
  });

  router.post('/api/jobs/stripe-reconcile', cronLimit, stripeAuth, async (req, res, next) => {
    try {
      if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ error: 'Stripe is not configured.' });
      const connection = await database();
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      const result = await runStripeReconcile({ connection, stripe, priceToPlan, batchSize: Math.min(batchSize, 100), log });
      log({ event: 'job.stripe_reconcile_completed', ...result, failures: undefined });
      res.json(result);
    } catch (error) { next(error); }
  });

  return router;
}

module.exports = { createOperationsJobsRouter, databaseOptions, priceToPlan };