-- Pamet external identity migration for Google and Sign in with Apple.
-- Apply before enabling GOOGLE_OAUTH_* or APPLE_OAUTH_* in production.
CREATE TABLE IF NOT EXISTS pamet_external_identities (
  provider VARCHAR(16) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  email VARCHAR(254) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (provider, subject),
  UNIQUE KEY uniq_user_provider (user_id, provider),
  CONSTRAINT fk_pamet_external_identity_user FOREIGN KEY (user_id) REFERENCES pamet_users(id) ON DELETE CASCADE,
  INDEX idx_external_identity_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
