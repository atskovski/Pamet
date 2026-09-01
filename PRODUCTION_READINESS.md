# Pamet v2.0.1 Production Readiness Review

Reviewed 2026-09-01. This is an engineering readiness record, not a compliance certification.

## Implemented and verified

| Area | Production control |
|---|---|
| Runtime | One Express application; thin process entry point; explicit health and database-readiness handlers |
| Public files | Only the application shell, share page, manifest, service worker, and asset directories are served |
| HTTP security | CSP, HSTS in production, frame denial, MIME sniffing prevention, referrer policy, permissions policy, request IDs, no-store API/share responses |
| Input/abuse controls | Strict JSON and body limits, route validation, generic production errors, endpoint-specific rate limits |
| Authentication | 256-bit installation credential; hash-only backend storage; PBKDF2-HMAC-SHA-256 local passwords at 600,000 iterations |
| Billing | Server-owned entitlements, exact price validation, idempotent customer/subscription creation, raw-body webhook signatures, database webhook deduplication |
| Data lifecycle | All-profile CSV/JSON export; backend-first account deletion; active subscription cancellation; cascading share deletion |
| Sharing | Random hash-only tokens, expiry, revocation, plan enforcement, view/download permissions, snapshot size limits, failed-email rollback |
| Privacy claims | No E2E-encryption claim; no diagnosis, emergency monitoring, drug interaction, live portal, or treatment claim |
| Quality gates | Syntax checks, store/Phase 2 assertions, production security assertions, local HTTP exposure/header/error smoke tests, dependency audit |

## Deployment configuration required

Pamet fails safely when a required service is absent. Configure these as deployment secrets, never in Git:

- MySQL: `DATABASE_URL`, or `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`; use `DB_SSL=true` and keep certificate validation enabled.
- Apply `db/schema.sql` during deployment. Keep `AUTO_MIGRATE=false` in production so request cold starts never execute DDL.
- Stripe: publishable/secret/webhook keys and the four price IDs. Ultra is exposed only when both Ultra IDs exist and `ULTRA_ENABLED=true`.
- Email: `RESEND_API_KEY` and a verified `EMAIL_FROM`.
- Scheduler: a high-entropy `CRON_SECRET` sent as a Bearer token.

Approved Stripe catalog:

| Plan | Monthly | Annual |
|---|---:|---:|
| Pro | $6.99 | $59.99 |
| Ultra | $12.99 | $99.99 |

After deployment, require `/api/health` to return HTTP 200 and `/api/ready` to return HTTP 200 before routing production traffic. Register the Stripe webhook at `/api/stripe/webhook` for `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`.

## External launch gates

These cannot be completed solely in this repository:

- Create/verify the Stripe Ultra monthly and annual products/prices, place their real `price_...` IDs in deployment secrets, enable Ultra, and run test-mode purchase, trial, cancellation, failed-payment, portal, and webhook-retry scenarios.
- Run database backup and point-in-time restore drills; document retention and deletion timelines.
- Replace in-memory rate limiting with a shared store before horizontally scaling.
- Add centralized, access-controlled log/alert collection and a tested incident-response process.
- Obtain independent penetration, privacy, accessibility, and applicable legal/regulatory reviews plus vendor agreements.
- Adopt reviewed server-side identity before multi-device sign-in, recovery, MFA/passkeys, or remote session revocation.
- Decide whether browser-local unencrypted journal storage meets the intended threat model; otherwise implement audited at-rest encryption and key recovery.

## Release commands

```sh
npm ci
npm audit --omit=dev
npm run check
# Apply db/schema.sql with the deployment's MySQL migration mechanism.
NODE_ENV=production npm start
```
