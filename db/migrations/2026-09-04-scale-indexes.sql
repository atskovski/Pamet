-- Pamet scale indexes for existing production databases.
-- Safe to re-run: each ALTER executes only when the named index is absent.

SET @schema_name = DATABASE();

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='pamet_users' AND INDEX_NAME='idx_digest_cursor') = 0,
  'ALTER TABLE pamet_users ADD INDEX idx_digest_cursor (weekly_digest_enabled,id)',
  'SELECT ''idx_digest_cursor already present'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='pamet_audit_log' AND INDEX_NAME='idx_audit_event') = 0,
  'ALTER TABLE pamet_audit_log ADD INDEX idx_audit_event (user_id,event_type,created_at)',
  'SELECT ''idx_audit_event already present'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='pamet_push_subscriptions' AND INDEX_NAME='idx_push_scan') = 0,
  'ALTER TABLE pamet_push_subscriptions ADD INDEX idx_push_scan (enabled,failure_count,id)',
  'SELECT ''idx_push_scan already present'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='pamet_appointments' AND INDEX_NAME='idx_appointment_due') = 0,
  'ALTER TABLE pamet_appointments ADD INDEX idx_appointment_due (status,starts_at)',
  'SELECT ''idx_appointment_due already present'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
