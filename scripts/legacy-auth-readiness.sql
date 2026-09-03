-- Pamet legacy device-auth retirement readiness report.
-- Run read-only against production before removing legacy bearer fallback.

SELECT
  COUNT(*) AS total_accounts,
  SUM(password_hash IS NOT NULL AND password_salt IS NOT NULL) AS password_session_ready,
  SUM(password_hash IS NULL OR password_salt IS NULL) AS legacy_password_missing,
  ROUND(100 * SUM(password_hash IS NOT NULL AND password_salt IS NOT NULL) / NULLIF(COUNT(*),0), 2) AS percent_session_ready
FROM pamet_users;

SELECT
  COUNT(*) AS active_device_credentials,
  COUNT(DISTINCT user_id) AS accounts_with_active_device_credentials
FROM pamet_devices
WHERE status='active';

SELECT
  DATE(created_at) AS migration_date,
  COUNT(*) AS legacy_password_upgrades
FROM pamet_audit_log
WHERE event_type='identity.legacy_password_upgraded'
GROUP BY DATE(created_at)
ORDER BY migration_date DESC
LIMIT 30;

SELECT
  DATE(created_at) AS event_date,
  COUNT(*) AS logout_all_events
FROM pamet_audit_log
WHERE event_type='identity.all_sessions_revoked'
GROUP BY DATE(created_at)
ORDER BY event_date DESC
LIMIT 30;
