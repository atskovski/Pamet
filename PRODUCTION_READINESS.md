# Pamet v1.2.0 Production Readiness Review

Reviewed 2026-09-02. This is an engineering readiness record, not a compliance certification.

## Implemented and verified

| Area | Production control |
|---|---|
| Runtime | One Express application; thin process entry point; explicit health and database-readiness handlers |
| Public files | Only the application shell, share page, manifest, service worker, and asset directories are served |
| HTTP security | CSP, HSTS in production, frame denial, MIME sniffing prevention, referrer policy, permissions policy, request IDs, no-store API/share responses |
| Input/abuse controls | Strict JSON/body limits, route validation, generic production errors, and Redis/Valkey-backed endpoint limits; a configured-but-unavailable shared store fails closed |
| Authentication | Server-side scrypt password verification, expiring HttpOnly sessions, cross-device login, legacy device migration, remote revocation, one-time recovery, and encrypted TOTP secrets |
| Billing | Server-owned entitlements, exact price validation, idempotent customer/subscription creation, raw-body webhook signatures, database webhook deduplication |
| Data lifecycle | All-profile CSV/JSON export; backend-first account deletion; explicit share/session cleanup; active subscription cancellation; Stripe customer deletion |
| Sharing | Random hash-only tokens, expiry, revocation, plan enforcement, view/download permissions, snapshot size limits, failed-email rollback |
| Encrypted sync | Ultra API stores versioned AES-256-GCM ciphertext created in the browser; recovery keys are never transmitted to Pamet |
| Closed-app reminders | User-consented Web Push subscriptions, VAPID delivery, timezone-aware deduplication, stale-subscription disabling, hourly scheduler |
| Privacy claims | No claim that local browser storage is encrypted; no diagnosis, emergency monitoring, drug interaction, live portal, or treatment claim |
| Quality gates | Bundled/minified production assets, syntax checks, store/advanced-feature assertions, Node HTTP behavior tests, production security assertions, dependency audit on every PR and main push |
| Observability hooks | Structured events, authenticated log drain, protected Prometheus counters, alert webhook, and readiness visibility for every required integration |

## Deployment configuration required

Pamet fails safely when a required service is absent. Configure these as deployment secrets, never in Git:

- MySQL: `DATABASE_URL`, or `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`; use `DB_SSL=true` and keep certificate validation enabled.
- Apply `db/schema.sql` during deployment. Keep `AUTO_MIGRATE=false` in production so request cold starts never execute DDL.
- Stripe: publishable/secret/webhook keys and the four price IDs. Each tier is exposed only when both IDs are active live USD recurring prices with the exact approved amount and interval. `ULTRA_ENABLED` is intentionally not used.
- Email: `RESEND_API_KEY` and a verified `EMAIL_FROM`.
- Password reset intentionally returns HTTP 503 when email delivery is not configured; readiness requires email configuration so the UI cannot claim a link was sent when delivery is impossible.
- Scheduler: a high-entropy `CRON_SECRET` sent as a Bearer token.
- Distributed limits: `REDIS_URL` for a TLS-protected Redis/Valkey service.
- Web Push: `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, and `VAPID_PRIVATE_KEY`.
- Identity: a randomly generated 32-byte `IDENTITY_ENCRYPTION_KEY` encoded as 64 hex characters.
- Observability: `METRICS_SECRET`, `LOG_DRAIN_URL`, `LOG_DRAIN_TOKEN`, `ALERT_WEBHOOK_URL`, and optional `ALERT_WEBHOOK_TOKEN`.

Approved Stripe catalog:

| Plan | Monthly | Annual |
|---|---:|---:|
| Pro | $6.99 | $59.99 |
| Ultra | $12.99 | $99.99 |

After deployment, require `/api/health` to return HTTP 200 and `/api/ready` to return HTTP 200 before routing production traffic. Register the Stripe webhook at `/api/stripe/webhook` for `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`.

## External launch gates

These cannot be completed solely in this repository:

- Confirm live Stripe checkout, seven-day trial transition, cancellation, failed payment, billing portal, webhook retry, and the daily entitlement reconciliation job using a controlled production account before broad launch.
- Run database backup and point-in-time restore drills; document retention and deletion timelines.
- Provision the Redis/Valkey, Web Push, log, metrics, and paging destinations. `/api/ready` stays unhealthy until they are configured and reachable where applicable.
- Exercise recovery, MFA enrollment/removal, device revocation, encrypted-sync conflict handling, push delivery, and key-loss scenarios in staging.
- Obtain independent penetration, privacy, accessibility, and applicable legal/regulatory reviews plus vendor agreements.
- Have the new identity and encrypted-sync design independently reviewed before marketing either as audited or certified.
- Decide whether readable local browser journal storage meets the intended threat model. Encrypted sync does not encrypt the working local copy.

## Release commands

```sh
npm ci
npm audit --omit=dev
npm run check
# Apply db/schema.sql with the deployment's MySQL migration mechanism.
NODE_ENV=production npm start
```
