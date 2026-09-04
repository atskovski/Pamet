'use strict';

const mysql = require('mysql2/promise');
const push = require('./push');
const { createJobAuthorizer } = require('./job-auth');

const APP = String(process.env.APP_BASE_URL || '').replace(/\/$/, '');
let pool;

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

function parse(value, fallback = {}) {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

const authorizeAppointmentReminder = createJobAuthorizer({ allowedWorkflows: ['push-reminders.yml'] });

async function runAppointmentReminderJob(req, res, next) {
  let connection;
  try {
    if (!push.configured()) return res.status(503).json({ error: 'Web Push is not configured.' });
    const database = await db();
    connection = await database.getConnection();
    const [[lock]] = await connection.query("SELECT GET_LOCK('pamet_appointment_reminders',0) acquired");
    if (!Number(lock?.acquired)) return res.json({ checked: 0, sent: 0, skipped: 0, disabled: 0, locked: true });

    const [appointments] = await connection.execute(`
      SELECT a.id,a.user_id,a.profile_id,a.clinician,a.starts_at,a.reminder_minutes
      FROM pamet_appointments a
      WHERE a.status='scheduled'
        AND a.starts_at > NOW()
        AND a.starts_at <= DATE_ADD(NOW(), INTERVAL 31 DAY)
        AND TIMESTAMPDIFF(MINUTE,NOW(),a.starts_at) <= a.reminder_minutes
      ORDER BY a.starts_at ASC
      LIMIT 250`);

    let sent = 0;
    let skipped = 0;
    let disabled = 0;
    for (const appointment of appointments) {
      const [already] = await connection.execute(
        `SELECT 1 FROM pamet_audit_log WHERE user_id=? AND event_type='appointment.reminder_sent' AND JSON_UNQUOTE(JSON_EXTRACT(event_json,'$.appointmentId'))=? LIMIT 1`,
        [appointment.user_id, appointment.id]
      );
      if (already.length) { skipped += 1; continue; }

      const [subscriptions] = await connection.execute(
        'SELECT id,subscription_json FROM pamet_push_subscriptions WHERE user_id=? AND enabled=TRUE AND failure_count<5',
        [appointment.user_id]
      );
      if (!subscriptions.length) { skipped += 1; continue; }

      let delivered = 0;
      for (const subscription of subscriptions) {
        try {
          await push.send(parse(subscription.subscription_json), {
            title: 'Upcoming Pamet visit',
            body: 'You have a visit coming up. Open Pamet to review your discussion guide and questions.',
            url: APP || '/',
            tag: `pamet-appointment-${appointment.id}`
          });
          await connection.execute('UPDATE pamet_push_subscriptions SET last_success_at=NOW(),failure_count=0 WHERE id=?', [subscription.id]);
          delivered += 1;
        } catch (error) {
          const terminal = error.statusCode === 404 || error.statusCode === 410;
          await connection.execute('UPDATE pamet_push_subscriptions SET failure_count=failure_count+1,enabled=? WHERE id=?', [!terminal, subscription.id]);
          if (terminal) disabled += 1;
        }
      }

      if (delivered) {
        await connection.execute(
          `INSERT INTO pamet_audit_log(user_id,event_type,event_json) VALUES(?,?,?)`,
          [appointment.user_id, 'appointment.reminder_sent', JSON.stringify({ appointmentId: appointment.id, profileId: appointment.profile_id, reminderMinutes: Number(appointment.reminder_minutes), delivered })]
        );
        sent += 1;
      } else skipped += 1;
    }

    await connection.query("SELECT RELEASE_LOCK('pamet_appointment_reminders')");
    res.json({ checked: appointments.length, sent, skipped, disabled, cadenceMinutes: 15 });
  } catch (error) {
    if (connection) await connection.query("SELECT RELEASE_LOCK('pamet_appointment_reminders')").catch(() => {});
    next(error);
  } finally {
    connection?.release();
  }
}

async function appointmentReminderJob(req, res, next) {
  return authorizeAppointmentReminder(req, res, (error) => {
    if (error) return next(error);
    return runAppointmentReminderJob(req, res, next);
  });
}

module.exports = { appointmentReminderJob };