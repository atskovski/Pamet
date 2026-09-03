# Pamet v1.2.0 Production Readiness Review

Reviewed 2026-09-02. Updated after the production-lifecycle integration gate was merged. This is an engineering readiness record, not a compliance certification.

## Implemented and verified

| Area | Production control |
|---|---|
| Runtime | One Express application; thin process entry point; explicit health and database-readiness handlers |
| Public files | Only the application shell, share page, manifest, service worker, and asset directories are served |
| HTTP security | CSP, HSTS in production, frame denial, MIME sniffing prevention, referrer policy, permissions policy, request IDs, no-store API/share responses |
| Input/abuse controls | Strict JSON/body limits, route validation, generic production errors, distributed endpoint limits, plus account-keyed login throttling; a configured-but-unavailable shared limiter fails closed in production |
| Authentication | Server-side scrypt password verification, breached-password screening, expiring HttpOnly sessions, cross-device login, legacy device migration, remote revocation, one-time recovery, and encrypted TOTP secrets |
| Billing | Server-owned entitlements, exact price validation, idempotent customer/subscription creation, raw-body webhook signatures, database webhook deduplication |
| Data lifecycle | All-profile CSV/JSON export; backend-first account deletion; explicit share/session cleanup; active subscription cancellation; Stripe customer deletion |
| Sharing | Random hash-only tokens, expiry, revocation, plan enforcement, view/download permissions, snapshot size limits, failed-email rollback |
| Encrypted sync | Ultra API stores versioned AES-256-GCM ciphertext created in the browser; recovery keys are never transmitted to Pamet |
| Closed-app reminders | User-consented Web Push subscriptions, VAPID delivery, timezone-aware deduplication, stale-subscription disabling, hourly scheduler |
| Privacy claims | No claim that local browser storage is encrypted; no diagnosis, emergency monitoring, drug interaction, live portal, or treatment claim |
| Quality gates | Bundled/minified production assets, syntax checks, production/security assertions, dependency audit, continuous dependency monitoring, unit/HTTP tests, and a MySQL-backed full lifecycle integration job on every PR and main push |
| Observability hooks | Structured events, authenticated log drain, protected Prometheus counters, alert webhook, OTLP export, and readiness visibility for required launch integrations |
| Encryption design gate | `LOCAL_ENCRYPTION_THREAT_MODEL.md` separates account authentication from content encryption and defines recovery, key loss, migration, rotation, and independent-review requirements before working-journal encryption can ship |

## Automated lifecycle integration gate

GitHub Actions now starts a disposable MySQL 8.4 service and launches the same `secure-server.js` entry point used in deployment. The integration test uses synthetic data and test-only network interception; it does not use production credentials, production customer records, real Stripe charges, or real email delivery.

The gate proves these behaviors together rather than as isolated unit tests:

- register → authenticated session → second login → logout → revoked session denial;
- password change invalidates other sessions while preserving the active changing session, and the old password stops authenticating;
- locally signed Stripe webhook → server-owned Free-to-Ultra entitlement transition → replay idempotency → canceled subscription back to Free;
- device inventory and revocation → revoked bearer credential stops authenticating;
- sharing invite creation → delivered-token retrieval → public snapshot access → revocation → post-revocation 404;
- encrypted-sync first write → read-back of opaque ciphertext → stale `expectedRevision` conflict → correct next revision;
- Ultra-only sharing/sync capabilities close again after entitlement downgrade.

`scripts/check-production.js` also asserts that this CI job and its core lifecycle coverage remain present, so removing the integration gate accidentally will fail the normal production hardening check.

## Local encryption and recovery decision

Pamet still does **not** claim that the working browser journal is encrypted at rest. Before implementation, `LOCAL_ENCRYPTION_THREAT_MODEL.md` now establishes the approved design direction: a random per-profile data-encryption key, user-held recovery-root-key wrapping, and a separate device-local wrapper where browser support is verified. The resettable Pamet account password is deliberately not the journal encryption key.

Account/password recovery must not become a decryption backdoor. A trusted device or the user-held recovery key can restore encrypted journal access; if every valid key source is lost, historical encrypted content is intentionally unrecoverable by Pamet. Plaintext-to-encrypted migration must use a copy → verify → switch sequence that preserves at least one verified copy through interruptions. The current Ultra sync format remains unchanged until a separately reviewed, versioned migration exists.

This document records the design gate only. Do not market the working journal as encrypted at rest until the implementation, migration, browser persistence, recovery UX, failure-injection tests, and independent cryptographic/security review defined in that threat model are complete.

## Deployment configuration required

Pamet fails safely when a required service is absent. Configure these as deployment secrets, never in Git:

- MySQL: `DATABASE_URL`, or `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`; use `DB_SSL=true` and keep certificate validation enabled.
- Apply `db/schema.sql` during deployment. Keep `AUTO_MIGRATE=false` in production so request cold starts never execute DDL.
- Stripe: publishable/secret/webhook keys and the four price IDs. Each tier is exposed only when both IDs are active live USD recurring prices with the exact approved amount and interval. `ULTRA_ENABLED` is intentionally not used.
- Email: `RESEND_API_KEY` and a verified `EMAIL_FROM`.
- Password reset intentionally returns HTTP 503 when email delivery is not configured; readiness requires email configuration so the UI cannot claim a link was sent when delivery is impossible.
- Scheduler: a high-entropy `CRON_SECRET` sent as a Bearer token.
- Distributed limits: `REDIS_URL` for a TLS-protected Redis/Valkey service. The database fallback remains a resilience path, not a reason to skip the dedicated shared store for production scale.
- Web Push: `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, and `VAPID_PRIVATE_KEY`.
- Identity: a randomly generated 32-byte `IDENTITY_ENCRYPTION_KEY` encoded as 64 hex characters.
- Observability: either Grafana Cloud OTLP (`GRAFANA_OTLP_ENDPOINT`, `GRAFANA_OTLP_USERNAME`, and a least-privilege `GRAFANA_OTLP_TOKEN` with `logs:write` and `metrics:write`) or the generic drain/webhook variables (`LOG_DRAIN_URL`, `LOG_DRAIN_TOKEN`, `ALERT_WEBHOOK_URL`, and optional `ALERT_WEBHOOK_TOKEN`). Keep `METRICS_SECRET` for the protected Prometheus-compatible diagnostics endpoint.

Approved Stripe catalog:

| Plan | Monthly | Annual |
|---|---:|---:|
| Pro | $6.99 | $59.99 |
| Ultra | $12.99 | $99.99 |

After deployment, require `/api/health` to return HTTP 200 and `/api/ready` to return HTTP 200 before routing production traffic. Register the Stripe webhook at `/api/stripe/webhook` for `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`.

## External and environment-specific launch gates

The repository is materially better protected by automated tests now, but these gates cannot honestly be marked complete by CI alone:

- **Backup and restore:** run a database backup plus isolated point-in-time/full restore drill; document backup frequency, encryption, retention, deletion timelines, achieved RPO/RTO, and the date/evidence of the last successful restore. This remains a broad-launch gate.
- **Controlled live billing exercise:** confirm live Stripe checkout, seven-day trial transition, cancellation, failed payment, billing portal, webhook retry, and daily entitlement reconciliation with a controlled production account before broad launch.
- **Production dependencies:** provision and verify Redis/Valkey, Web Push, email, database TLS, logging/metrics, and paging destinations. `/api/ready` must report the required launch integrations healthy.
- **Staging user-security exercise:** exercise account recovery, MFA enrollment/removal, device revocation, encrypted-sync conflict handling, push delivery, and key-loss UX in a staging environment even though the underlying auth/device/sync lifecycle is now covered automatically.
- **Independent assurance:** obtain penetration, privacy, accessibility, and applicable legal/regulatory reviews plus required vendor agreements. Do not claim independent audit, HIPAA compliance, SOC 2 compliance, or clinical validation without the applicable completed work.
- **Sharing/legal posture:** decide and document BAA/DPA posture before positioning caregiver/provider sharing for clinical workflows.
- **Working-journal encryption:** implement and satisfy the gates in `LOCAL_ENCRYPTION_THREAT_MODEL.md` before claiming encrypted local storage; current encrypted sync does not encrypt the browser's working copy.
- **CSP/legacy cleanup:** complete the planned nonce/strict-CSP migration and measure/retire pre-1.0.2 legacy bearer-device authentication when migration telemetry supports safe removal.

## Release commands

```sh
npm ci
npm audit --omit=dev
npm run check
npm test
# Integration CI runs separately with a disposable MySQL service:
# PAMET_INTEGRATION_TESTS=true npm run test:integration
# Apply db/schema.sql with the deployment's MySQL migration mechanism.
NODE_ENV=production npm start
```

## Release decision

The repository is now suitable for a **scoped beta/staged production rollout** once the deployed `/api/ready` dependencies are healthy. It should not yet be represented as broadly production-assured for sensitive health workflows until the backup/restore drill and independent security/privacy/accessibility/legal gates above are completed. Feature breadth should remain secondary to proving recovery, durability, and trust controls.
