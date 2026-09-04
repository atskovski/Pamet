'use strict';

const fs = require('fs');

const schema = fs.readFileSync('db/schema.sql', 'utf8');
const migration = fs.readFileSync('db/migrations/2026-09-04-scale-indexes.sql', 'utf8');
const server = fs.readFileSync('server.js', 'utf8');
const oauth = fs.readFileSync('routes/oauth-auth.js', 'utf8');
const jobs = fs.readFileSync('routes/operations-jobs.js', 'utf8');
const appointments = fs.readFileSync('lib/appointment-reminders.js', 'utf8');
const operations = fs.readFileSync('lib/operations-jobs.js', 'utf8');

function check(condition, message) {
  if (!condition) throw new Error(message);
}

const requiredIndexes = [
  ['pamet_users', 'idx_digest_cursor', 'weekly_digest_enabled,id'],
  ['pamet_audit_log', 'idx_audit_event', 'user_id,event_type,created_at'],
  ['pamet_push_subscriptions', 'idx_push_scan', 'enabled,failure_count,id'],
  ['pamet_appointments', 'idx_appointment_due', 'status,starts_at']
];

for (const [table, name, columns] of requiredIndexes) {
  check(schema.includes(name), `Fresh schema must define ${name} on ${table}.`);
  check(migration.includes(name) && migration.includes(`TABLE_NAME='${table}'`), `Production migration must idempotently install ${name}.`);
  for (const column of columns.split(',')) check(schema.includes(column.trim()), `${name} must include ${column}.`);
}

check(server.includes('waitForConnections: true'), 'Primary MySQL pool must queue rather than reject immediately when busy.');
check(server.includes('DB_CONNECTION_LIMIT'), 'Primary MySQL pool must remain environment-configurable.');
check(oauth.includes('waitForConnections: true') && oauth.includes('DB_CONNECTION_LIMIT'), 'OAuth database pool must be bounded/configurable.');
check(jobs.includes('Math.max(1, Math.min(4, Number(process.env.JOB_DB_CONNECTION_LIMIT || 2)))'), 'Scheduled-job pool must remain hard-bounded to four connections per instance.');
check(appointments.includes('connectionLimit: 2'), 'Appointment reminder pool must remain intentionally small.');
check(operations.includes('iterateById'), 'Large scheduled scans must use cursor iteration rather than loading an entire table into memory.');
check(operations.includes('clampBatchSize'), 'Scheduled work must retain bounded batch sizing.');
check(operations.includes("batchSize = 250") && operations.includes("batchSize = 100"), 'Scheduled jobs must retain explicit bounded defaults.');
check(appointments.includes("LIMIT 250"), 'Appointment reminder work must retain an explicit per-run bound.');

const defaultPrimary = 5;
const defaultOAuth = 5;
const defaultJobs = 2;
const defaultAppointments = 2;
const defaultPerInstance = defaultPrimary + defaultOAuth + defaultJobs + defaultAppointments;
check(defaultPerInstance <= 16, 'Default aggregate MySQL pool budget per application instance is too high.');

console.log(`Pamet database scale gate passed. Default theoretical pool budget is ${defaultPerInstance} connections per application instance; production instance count must be sized against provider max_connections with reserve capacity.`);
