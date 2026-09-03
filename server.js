'use strict';

const path = require('path');
const crypto = require('crypto');
const { promisify } = require('util');
const express = require('express');
const mysql = require('mysql2/promise');
const Stripe = require('stripe');
const { distributedRateLimit, rateLimitReady, configureDistributedFallback } = require('./lib/rate-limit');
const { totpSecret, verifyTotp, seal, open } = require('./lib/security');
const push = require('./lib/push');

const VERSION = require('./package.json').version;
const PORT = Number(process.env.PORT || 8080);
const NODE_ENV = process.env.NODE_ENV || 'development';
const APP = (process.env.APP_BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const app = express();
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const prices = {
  pro: { monthly: process.env.STRIPE_PRICE_PRO_MONTHLY || '', annual: process.env.STRIPE_PRICE_PRO_ANNUAL || '' },
  ultra: { monthly: process.env.STRIPE_PRICE_ULTRA_MONTHLY || '', annual: process.env.STRIPE_PRICE_ULTRA_ANNUAL || '' }
};
const expectedPrices = {
  pro: { monthly: { amount: 699, interval: 'month' }, annual: { amount: 5999, interval: 'year' } },
  ultra: { monthly: { amount: 1299, interval: 'month' }, annual: { amount: 9999, interval: 'year' } }
};
const priceValidationCache = new Map();
let pool;
let poolInitialization;
const metrics = new Map();
const scryptAsync = promisify(crypto.scrypt);
const SESSION_COOKIE = 'pamet_session';
const SESSION_TTL_DAYS = 30;

app.disable('x-powered-by');
app.set('trust proxy', 1);

const sha = (value) => crypto.createHash('sha256').update(Buffer.isBuffer(value) ? value : String(value)).digest('hex');
const token = () => crypto.randomBytes(32).toString('hex');
const clean = (value, max) => String(value || '').trim().slice(0, max);
