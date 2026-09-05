'use strict';

const crypto = require('crypto');
const express = require('express');
const mysql = require('mysql2/promise');
const { distributedRateLimit } = require('../lib/rate-limit');
const { createVisitBriefPdf } = require('../lib/visit-brief-pdf');

const SESSION_COOKIE = 'pamet_session';
const CALENDAR_STATE_COOKIE = 'pamet_calendar_state';
const STATE_TTL_MS = 10 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
let pool;

const sha = (value) => crypto.createHash('sha256').update(String(value || '')).digest('hex');
const clean = (value, max = 1000) => String(value ?? '').trim().slice(0, max);
const readCookie = (req, name) => String(req.headers.cookie || '').split(';').map((item) => item.trim().split('=')).find(([key]) => key === name)?.[1] || '';
const readBearer = (req) => { const value = String(req.headers.authorization || ''); return value.startsWith('Bearer ') ? value.slice(7).trim() : ''; };
const keyOk = (value) => /^[a-f0-9]{64}$/i.test(String(value || ''));
const fromJson = (value, fallback) => { try { return typeof value === 'string' ? JSON.parse(value) : (value ?? fallback); } catch { return fallback; } };

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
    connectionLimit: Math.max(1, Number(process.env.DB_CONNECTION_LIMIT || 5)),
    connectTimeout: 10000,
    enableKeepAlive: true
  };
}
async function db() {
  if (pool) return pool;
  if (!process.env.DATABASE_URL && !process.env.DB_HOST) throw Object.assign(new Error('Database is not configured.'), { status: 503 });
  pool = mysql.createPool(databaseOptions());
  return pool;
}

async function requireUser(req, res, next) {
  try {
    const connection = await db();
    const session = readCookie(req, SESSION_COOKIE);
    if (keyOk(session)) {
      const [rows] = await connection.execute(`SELECT u.* FROM pamet_sessions s JOIN pamet_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>NOW() LIMIT 1`, [sha(session)]);
      if (rows.length) { req.user = rows[0]; return next(); }
    }
    const bearer = readBearer(req);
    if (!keyOk(bearer)) return res.status(401).json({ error: 'Authentication required.' });
    let rows = [];
    try { [rows] = await connection.execute(`SELECT u.* FROM pamet_devices d JOIN pamet_users u ON u.id=d.user_id WHERE d.credential_hash=? AND d.status='active' LIMIT 1`, [sha(bearer)]); }
    catch (error) { if (error.code !== 'ER_NO_SUCH_TABLE') throw error; }
    if (!rows.length) [rows] = await connection.execute('SELECT * FROM pamet_users WHERE device_key_hash=? LIMIT 1', [sha(bearer)]);
    if (!rows.length) return res.status(401).json({ error: 'Authentication required.' });
    req.user = rows[0];
    next();
  } catch (error) { next(error); }
}

function calendarConfig(appBaseUrl) {
  const stateSecret = process.env.OAUTH_STATE_SECRET || process.env.IDENTITY_ENCRYPTION_KEY || '';
  return {
    appBaseUrl: String(appBaseUrl || process.env.APP_BASE_URL || '').replace(/\/$/, ''),
    stateSecret,
    googleEnabled: !!(stateSecret.length >= 32 && process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET && (appBaseUrl || process.env.APP_BASE_URL)),
    googleClientId: process.env.GOOGLE_OAUTH_CLIENT_ID || '',
    googleClientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || ''
  };
}
function signedCalendarState(userId, appointmentId, secret) {
  const payload = Buffer.from(JSON.stringify({ provider:'google-calendar', userId:String(userId), appointmentId:String(appointmentId), nonce:crypto.randomBytes(18).toString('base64url'), issuedAt:Date.now() })).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}
function readCalendarState(value, secret) {
  const [payload, signature] = String(value || '').split('.');
  if (!payload || !signature || !secret) throw Object.assign(new Error('Invalid calendar authorization state.'), { status: 400 });
  const expected = crypto.createHmac('sha256', secret).update(payload).digest();
  const received = Buffer.from(signature, 'base64url');
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) throw Object.assign(new Error('Invalid calendar authorization state.'), { status: 400 });
  let parsed;
  try { parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { throw Object.assign(new Error('Invalid calendar authorization state.'), { status: 400 }); }
  if (parsed.provider !== 'google-calendar' || !parsed.userId || !parsed.appointmentId || !Number.isFinite(parsed.issuedAt) || Date.now() - parsed.issuedAt > STATE_TTL_MS || parsed.issuedAt > Date.now() + 30000) throw Object.assign(new Error('Expired calendar authorization state.'), { status: 400 });
  return parsed;
}
function stateCookieValue(state) { return sha(state); }
function setStateCookie(res, state) {
  const secure = (process.env.NODE_ENV || 'development') === 'production' ? '; Secure' : '';
  res.append('Set-Cookie', `${CALENDAR_STATE_COOKIE}=${stateCookieValue(state)}; Path=/api/calendar/google/; HttpOnly; SameSite=Lax; Max-Age=${Math.ceil(STATE_TTL_MS / 1000)}${secure}`);
}
function clearStateCookie(res) {
  const secure = (process.env.NODE_ENV || 'development') === 'production' ? '; Secure' : '';
  res.append('Set-Cookie', `${CALENDAR_STATE_COOKIE}=; Path=/api/calendar/google/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}
function requireStateCookie(req, state) {
  const expected = Buffer.from(stateCookieValue(state));
  const received = Buffer.from(readCookie(req, CALENDAR_STATE_COOKIE));
  if (!received.length || expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) throw Object.assign(new Error('Calendar authorization is not bound to this browser.'), { status: 400 });
}

async function appointmentForUser(userId, appointmentId) {
  const connection = await db();
  const [rows] = await connection.execute('SELECT id,user_id,profile_id,clinician,starts_at,reason,questions_json,reminder_minutes,status FROM pamet_appointments WHERE id=? AND user_id=? LIMIT 1', [String(appointmentId), userId]);
  if (!rows.length) throw Object.assign(new Error('Appointment not found.'), { status: 404 });
  const row = rows[0];
  return { id:row.id, profileId:row.profile_id, clinician:row.clinician, startsAt:row.starts_at, reason:row.reason, questions:fromJson(row.questions_json, []), reminderMinutes:Number(row.reminder_minutes || 1440), status:row.status };
}
function appointmentDescription(appointment) {
  const parts = [];
  if (appointment.reason) parts.push(`Reason for visit: ${clean(appointment.reason, 700)}`);
  if (Array.isArray(appointment.questions) && appointment.questions.length) parts.push(`Questions to discuss:\n${appointment.questions.slice(0, 10).map((item) => `- ${clean(item, 400)}`).join('\n')}`);
  parts.push('Prepared in Pamet Appointment Workspace. Review and edit this calendar event as needed.');
  return parts.join('\n\n');
}
function googleEvent(appointment) {
  const start = new Date(appointment.startsAt);
  if (Number.isNaN(+start)) throw Object.assign(new Error('Appointment date is invalid.'), { status: 400 });
  const end = new Date(+start + 60 * 60 * 1000);
  return {
    id: `pamet${sha(appointment.id).slice(0, 40)}`,
    summary: appointment.clinician ? `Appointment with ${clean(appointment.clinician, 120)}` : 'Medical appointment',
    description: appointmentDescription(appointment),
    start: { dateTime:start.toISOString() },
    end: { dateTime:end.toISOString() },
    visibility: 'private',
    reminders: { useDefault:false, overrides:[{ method:'popup', minutes:Math.max(0, Math.min(40320, Number(appointment.reminderMinutes || 1440))) }] },
    extendedProperties: { private:{ pametAppointmentId:String(appointment.id) } }
  };
}
function googleTemplateUrl(appointment) {
  const event = googleEvent(appointment);
  const compact = (iso) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const url = new URL('https://calendar.google.com/calendar/render');
  url.search = new URLSearchParams({ action:'TEMPLATE', text:event.summary, dates:`${compact(event.start.dateTime)}/${compact(event.end.dateTime)}`, details:event.description }).toString();
  return url.toString();
}
function icsEscape(value) { return clean(value, 4000).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;'); }
function icsDate(value) { return new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z'); }
function buildIcs(appointment, host = 'pamet.wasmer.app') {
  const start = new Date(appointment.startsAt);
  if (Number.isNaN(+start)) throw Object.assign(new Error('Appointment date is invalid.'), { status: 400 });
  const end = new Date(+start + 60 * 60 * 1000);
  const reminder = Math.max(0, Math.min(40320, Number(appointment.reminderMinutes || 1440)));
  return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Pamet//Appointment Workspace//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH','BEGIN:VEVENT',`UID:pamet-${appointment.id}@${host}`,`DTSTAMP:${icsDate(new Date())}`,`DTSTART:${icsDate(start)}`,`DTEND:${icsDate(end)}`,`SUMMARY:${icsEscape(appointment.clinician ? `Appointment with ${appointment.clinician}` : 'Medical appointment')}`,`DESCRIPTION:${icsEscape(appointmentDescription(appointment))}`,'STATUS:CONFIRMED','BEGIN:VALARM',`TRIGGER:-PT${reminder}M`,'ACTION:DISPLAY','DESCRIPTION:Pamet appointment reminder','END:VALARM','END:VEVENT','END:VCALENDAR',''].join('\r\n');
}

async function audit(userId, type, data = {}) {
  try { const connection = await db(); await connection.execute('INSERT INTO pamet_audit_log(user_id,event_type,event_json) VALUES(?,?,?)', [userId || null, type, JSON.stringify(data)]); } catch {}
}
async function sendVisitBriefEmail({ to, subject, pdf, filename, fetchImpl = fetch }) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) throw Object.assign(new Error('Email delivery is not configured yet.'), { status: 503 });
  const html = '<!doctype html><html><body style="font-family:Arial,sans-serif;color:#263638"><h2 style="color:#0F3D3E">Pamet Visit Brief</h2><p>A Pamet user chose to send you a Visit Brief. The health summary is attached as a PDF rather than included in the email body.</p><p>Please handle the attachment according to your normal privacy and records practices.</p><p style="font-size:12px;color:#5B6B73">Pamet organizes user-recorded information and does not provide a diagnosis or clinical assessment.</p></body></html>';
  const response = await fetchImpl('https://api.resend.com/emails', {
    method:'POST',
    headers:{ Authorization:`Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type':'application/json' },
    body:JSON.stringify({ from:process.env.EMAIL_FROM, to:[to], subject, html, attachments:[{ filename, content:pdf.toString('base64') }] }),
    signal:AbortSignal.timeout(10000)
  });
  if (!response.ok) throw Object.assign(new Error('Email delivery failed.'), { status: 502 });
  return true;
}

function createVisitWorkflowRouter({ appBaseUrl } = {}) {
  const router = express.Router();
  const json = express.json({ limit:'160kb', strict:true });
  const limit = distributedRateLimit({ windowMs:60 * 60 * 1000, max:30, name:'visit-workflow' });
  const config = calendarConfig(appBaseUrl);

  router.get('/api/visit-workflow/config', requireUser, (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ googleCalendarEnabled:config.googleEnabled, googleCalendarFallback:true, appleCalendarEnabled:true, emailEnabled:!!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM) });
  });

  router.post('/api/visit-brief/email', limit, requireUser, json, async (req, res, next) => {
    try {
      const to = clean(req.body?.to, 254).toLowerCase();
      const mode = req.body?.mode === 'advanced' ? 'advanced' : 'standard';
      if (!EMAIL_RE.test(to)) return res.status(400).json({ error:'Enter a valid recipient email address.' });
      if (mode === 'advanced' && req.user.plan !== 'ultra') return res.status(403).json({ error:'Advanced Visit Brief requires Pamet Ultra.' });
      const snapshot = req.body?.snapshot && typeof req.body.snapshot === 'object' ? req.body.snapshot : {};
      const pdf = createVisitBriefPdf(snapshot, mode);
      if (pdf.length > 4 * 1024 * 1024) return res.status(413).json({ error:'Visit Brief PDF is too large to email.' });
      const profile = clean(snapshot.profileName || 'Pamet', 80).replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'Pamet';
      const filename = `Pamet-${mode === 'advanced' ? 'Advanced-' : ''}Visit-Brief-${profile}.pdf`;
      const subject = mode === 'advanced' ? `Pamet Advanced Visit Brief - ${clean(snapshot.profileName || 'Patient', 80)}` : `Pamet Visit Brief - ${clean(snapshot.profileName || 'Patient', 80)}`;
      await sendVisitBriefEmail({ to, subject, pdf, filename });
      await audit(req.user.id, 'visit_brief.email_sent', { mode, recipientHash:sha(to), pdfBytes:pdf.length });
      res.status(202).json({ sent:true, filename });
    } catch (error) { next(error); }
  });

  router.get('/api/calendar/apple.ics', limit, requireUser, async (req, res, next) => {
    try {
      if (req.user.plan !== 'ultra') return res.status(403).json({ error:'Appointment workspace requires Pamet Ultra.' });
      const appointment = await appointmentForUser(req.user.id, req.query.appointmentId);
      const host = (() => { try { return new URL(config.appBaseUrl || 'https://pamet.wasmer.app').hostname; } catch { return 'pamet.wasmer.app'; } })();
      const ics = buildIcs(appointment, host);
      await audit(req.user.id, 'appointment.calendar_exported', { provider:'apple', appointmentId:appointment.id });
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="pamet-appointment-${appointment.id}.ics"`);
      res.send(ics);
    } catch (error) { next(error); }
  });

  router.get('/api/calendar/google/template', limit, requireUser, async (req, res, next) => {
    try {
      if (req.user.plan !== 'ultra') return res.status(403).json({ error:'Appointment workspace requires Pamet Ultra.' });
      const appointment = await appointmentForUser(req.user.id, req.query.appointmentId);
      await audit(req.user.id, 'appointment.calendar_opened', { provider:'google-template', appointmentId:appointment.id });
      res.redirect(302, googleTemplateUrl(appointment));
    } catch (error) { next(error); }
  });

  router.get('/api/calendar/google/start', limit, requireUser, async (req, res, next) => {
    try {
      if (req.user.plan !== 'ultra') return res.status(403).json({ error:'Appointment workspace requires Pamet Ultra.' });
      if (!config.googleEnabled) return res.redirect(302, `/api/calendar/google/template?appointmentId=${encodeURIComponent(String(req.query.appointmentId || ''))}`);
      const appointment = await appointmentForUser(req.user.id, req.query.appointmentId);
      const state = signedCalendarState(req.user.id, appointment.id, config.stateSecret);
      setStateCookie(res, state);
      const callback = `${config.appBaseUrl}/api/calendar/google/callback`;
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.search = new URLSearchParams({ client_id:config.googleClientId, redirect_uri:callback, response_type:'code', scope:'https://www.googleapis.com/auth/calendar.events', state, access_type:'online', include_granted_scopes:'true', prompt:'select_account' }).toString();
      res.redirect(302, url.toString());
    } catch (error) { next(error); }
  });

  router.get('/api/calendar/google/callback', async (req, res) => {
    const fail = (code = 'provider_error') => { clearStateCookie(res); res.redirect(303, `/?calendar=google-error&reason=${encodeURIComponent(code)}`); };
    try {
      if (!config.googleEnabled || req.query.error || !req.query.code || !req.query.state) return fail(req.query.error || 'not_completed');
      requireStateCookie(req, req.query.state);
      const state = readCalendarState(req.query.state, config.stateSecret);
      const connection = await db();
      const [users] = await connection.execute('SELECT id,plan FROM pamet_users WHERE id=? LIMIT 1', [state.userId]);
      if (!users.length || users[0].plan !== 'ultra') return fail('plan_required');
      const appointment = await appointmentForUser(users[0].id, state.appointmentId);
      const callback = `${config.appBaseUrl}/api/calendar/google/callback`;
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method:'POST', headers:{ 'Content-Type':'application/x-www-form-urlencoded', Accept:'application/json' }, body:new URLSearchParams({ code:String(req.query.code), client_id:config.googleClientId, client_secret:config.googleClientSecret, redirect_uri:callback, grant_type:'authorization_code' }), signal:AbortSignal.timeout(10000) });
      const tokens = await tokenResponse.json().catch(() => ({}));
      if (!tokenResponse.ok || !tokens.access_token) throw Object.assign(new Error('Google Calendar authorization failed.'), { status:502 });
      const insert = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', { method:'POST', headers:{ Authorization:`Bearer ${tokens.access_token}`, 'Content-Type':'application/json', Accept:'application/json' }, body:JSON.stringify(googleEvent(appointment)), signal:AbortSignal.timeout(10000) });
      if (!insert.ok && insert.status !== 409) throw Object.assign(new Error('Google Calendar could not add the appointment.'), { status:502 });
      clearStateCookie(res);
      await audit(users[0].id, 'appointment.calendar_added', { provider:'google', appointmentId:appointment.id });
      res.redirect(303, '/?calendar=google-added');
    } catch (error) { fail(error.status === 502 ? 'calendar_api' : 'provider_error'); }
  });

  router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    res.status(Number(error.status || 500)).json({ error:error.status && error.status < 500 ? error.message : 'Visit workflow request failed.' });
  });
  return router;
}

module.exports = { createVisitWorkflowRouter, buildIcs, googleEvent, googleTemplateUrl, readCalendarState, signedCalendarState, sendVisitBriefEmail };
