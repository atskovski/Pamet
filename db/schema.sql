-- Pamet v1.2.0 database schema. Run as a controlled migration before deploying production.
CREATE TABLE IF NOT EXISTS pamet_users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  local_user_id VARCHAR(128) NOT NULL UNIQUE,
  device_key_hash CHAR(64) NOT NULL UNIQUE,
  password_hash CHAR(128) NULL,
  password_salt CHAR(32) NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  first_name VARCHAR(100) NOT NULL DEFAULT '',
  last_name VARCHAR(100) NOT NULL DEFAULT '',
  timezone VARCHAR(100) NOT NULL DEFAULT 'UTC',
  plan VARCHAR(16) NOT NULL DEFAULT 'free',
  subscription_status VARCHAR(32) NOT NULL DEFAULT 'none',
  stripe_customer_id VARCHAR(128) NULL UNIQUE,
  stripe_subscription_id VARCHAR(128) NULL UNIQUE,
  weekly_digest_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  latest_digest_json JSON NULL,
  confirmation_email_sent_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_digest (weekly_digest_enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pamet_sessions (
  id CHAR(36) PRIMARY KEY, user_id BIGINT UNSIGNED NOT NULL, token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL, last_used_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at DATETIME NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pamet_session_user FOREIGN KEY (user_id) REFERENCES pamet_users(id) ON DELETE CASCADE,
  INDEX idx_session (token_hash,expires_at), INDEX idx_session_user (user_id,revoked_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pamet_sharing_invites (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  kind VARCHAR(20) NOT NULL,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(254) NOT NULL,
  organization VARCHAR(120) NOT NULL DEFAULT '',
  permission_level VARCHAR(24) NOT NULL DEFAULT 'view',
  profile_name VARCHAR(80) NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  share_token_hash CHAR(64) NOT NULL UNIQUE,
  snapshot_json JSON NOT NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pamet_share_user FOREIGN KEY (user_id) REFERENCES pamet_users(id) ON DELETE CASCADE,
  INDEX idx_share (user_id, kind, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pamet_audit_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NULL,
  event_type VARCHAR(80) NOT NULL,
  event_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Webhook events are recorded before processing so Stripe retries cannot apply twice.
CREATE TABLE IF NOT EXISTS pamet_stripe_events (
  event_id VARCHAR(128) NOT NULL PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,
  processed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_stripe_event_processed (processed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Product feedback is intentionally detached from account and health data.
CREATE TABLE IF NOT EXISTS pamet_feedback (
  id CHAR(36) NOT NULL PRIMARY KEY,
  category VARCHAR(24) NOT NULL,
  rating TINYINT UNSIGNED NULL,
  message VARCHAR(1000) NOT NULL,
  app_version VARCHAR(16) NOT NULL,
  screen VARCHAR(40) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_feedback_created (created_at),
  INDEX idx_feedback_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pamet_devices (
  id CHAR(36) PRIMARY KEY, user_id BIGINT UNSIGNED NOT NULL, credential_hash CHAR(64) NOT NULL UNIQUE,
  label VARCHAR(80) NOT NULL DEFAULT 'Pamet device', status VARCHAR(16) NOT NULL DEFAULT 'active',
  last_used_at DATETIME NULL, revoked_at DATETIME NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pamet_device_user FOREIGN KEY (user_id) REFERENCES pamet_users(id) ON DELETE CASCADE,
  INDEX idx_device_user (user_id,status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pamet_recovery_tokens (
  id CHAR(36) PRIMARY KEY, user_id BIGINT UNSIGNED NOT NULL, token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL, used_at DATETIME NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pamet_recovery_user FOREIGN KEY (user_id) REFERENCES pamet_users(id) ON DELETE CASCADE,
  INDEX idx_recovery (token_hash,expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pamet_mfa (
  user_id BIGINT UNSIGNED PRIMARY KEY, secret_encrypted TEXT NOT NULL, enabled BOOLEAN NOT NULL DEFAULT FALSE,
  verified_at DATETIME NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_pamet_mfa_user FOREIGN KEY (user_id) REFERENCES pamet_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pamet_push_subscriptions (
  id CHAR(36) PRIMARY KEY, user_id BIGINT UNSIGNED NOT NULL, device_id CHAR(36) NULL,
  endpoint_hash CHAR(64) NOT NULL UNIQUE, subscription_json JSON NOT NULL, timezone VARCHAR(100) NOT NULL DEFAULT 'UTC',
  reminder_hour TINYINT UNSIGNED NOT NULL DEFAULT 20, enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_sent_local_date DATE NULL, last_success_at DATETIME NULL, failure_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_pamet_push_user FOREIGN KEY (user_id) REFERENCES pamet_users(id) ON DELETE CASCADE,
  CONSTRAINT fk_pamet_push_device FOREIGN KEY (device_id) REFERENCES pamet_devices(id) ON DELETE SET NULL,
  INDEX idx_push_due (enabled,reminder_hour)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pamet_sync_blobs (
  user_id BIGINT UNSIGNED NOT NULL, profile_id VARCHAR(128) NOT NULL, ciphertext LONGBLOB NOT NULL,
  nonce VARBINARY(32) NOT NULL, key_version INT UNSIGNED NOT NULL, revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
  content_hash CHAR(64) NOT NULL, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id,profile_id), CONSTRAINT fk_pamet_sync_user FOREIGN KEY (user_id) REFERENCES pamet_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pamet_appointments (
  id CHAR(36) PRIMARY KEY, user_id BIGINT UNSIGNED NOT NULL, profile_id VARCHAR(128) NOT NULL,
  clinician VARCHAR(120) NOT NULL DEFAULT '', starts_at DATETIME NOT NULL, reason VARCHAR(500) NOT NULL DEFAULT '',
  concerns_json JSON NOT NULL, questions_json JSON NOT NULL, reminder_minutes INT UNSIGNED NOT NULL DEFAULT 1440,
  status VARCHAR(20) NOT NULL DEFAULT 'scheduled', created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_pamet_appointment_user FOREIGN KEY (user_id) REFERENCES pamet_users(id) ON DELETE CASCADE,
  INDEX idx_appointment (user_id,starts_at,status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pamet_rate_limits (
  bucket_key VARCHAR(255) PRIMARY KEY, count INT UNSIGNED NOT NULL, expires_at DATETIME(3) NOT NULL,
  INDEX idx_rate_limit_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
