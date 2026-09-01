-- Pamet v1.0.3 database schema. server.js also creates these tables automatically.
CREATE TABLE IF NOT EXISTS pamet_users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  local_user_id VARCHAR(128) NOT NULL UNIQUE,
  device_key_hash CHAR(64) NOT NULL UNIQUE,
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

CREATE TABLE IF NOT EXISTS pamet_sharing_invites (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  kind VARCHAR(20) NOT NULL,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(254) NOT NULL,
  organization VARCHAR(120) NOT NULL DEFAULT '',
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
