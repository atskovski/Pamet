# Pamet v1.2.1 Production Readiness Review

Updated for the 1.2.1 stabilization release. This is an engineering readiness record, not a compliance certification.

## Release posture

Version 1.2.1 is a patch-level stability and hardening release. The repository has automated production/security checks, MySQL-backed lifecycle integration coverage, dependency auditing, and a disposable backup → isolated-restore drill. It is suitable for a **scoped beta/staged production rollout** when deployed readiness checks are healthy. It is not yet appropriate to describe as broadly production-assured for sensitive health workflows until the external and production-only gates below have evidence.

## Implemented and verified

| Area | Production control |
|---|---|
| Runtime | One reviewed Express application behind a thin hardened production edge; explicit health and database-readiness handlers |
| Release identity | `package.json` is canonical; production edge `/api/health`, browser runtime, feedback metadata, and PWA release controls are checked for version consistency |
| Public files | Only the application shell, share page, manifest, service worker, and approved asset/bundle directories are served |
| HTTP security | CSP, production HSTS, frame denial, MIME-sniffing prevention, referrer/permissions policies, request IDs, and no-store API/share responses |
| CSP | Executable inline-script permission is removed and script attributes are blocked; remaining inline styles are tracked for later migration |
| Input/abuse controls | Strict JSON/body limits, route validation, generic production errors, distributed endpoint limits, account-keyed login throttling, and production fail-closed behavior when a configured shared limiter is unavailable |
| Authentication | Server-side scrypt password verification, breached-password screening, expiring HttpOnly sessions, cross-device login, one-time authorized legacy migration, remote device/session revocation, password recovery, and encrypted TOTP secrets |
| Security UX | Centered/scroll-safe security and recovery dialogs, Sign out everywhere, safe account switching, locally rendered authenticator QR, and confirmation-gated MFA setup |
| Billing | Server-owned entitlements, exact Stripe price validation, idempotent customer/subscription creation, raw-body webhook signatures, and database webhook deduplication |
| Data lifecycle | All-profile CSV/JSON export, backend-first account deletion, explicit share/session cleanup, active subscription cancellation, and Stripe customer deletion |
| Sharing | Random hash-only tokens, expiry, revocation, plan enforcement, view/download permissions, snapshot limits, and failed-email rollback |
| Encrypted sync | Ultra API stores versioned AES-256-GCM ciphertext produced in the browser; recovery keys are never transmitted to Pamet |
| Local encryption | A tested implementation/migration framework exists but remains disabled and review-gated; Pamet does not claim the working local journal is encrypted at rest |
| Closed-app reminders | User-consented Web Push subscriptions, VAPID delivery, timezone-aware deduplication, stale-subscription disabling, and scheduler infrastructure |
| PWA | Service-worker registration executes from the external production bundle so CSP hardening does not silently disable registration; API/share routes are excluded from caching |
| Privacy claims | No diagnosis, emergency monitoring, drug interaction, treatment, live caregiver monitoring, or live clinician-portal claim |
| Quality gates | Bundled assets, syntax/release/version checks, production/security assertions, dependency audit, unit/HTTP/UI/crypto tests, and MySQL-backed lifecycle integration on PRs and main |
| Recovery gate | CI performs a logical database backup and restores it into a separate schema with structural/integrity checks |
| Observability | Structured events, protected metrics, alert integration, Grafana Cloud OTLP logs/metrics, and readiness visibility |
| Encryption design | Threat model defines per-profile DEKs, user-held recovery-root-key wrapping, key-loss behavior, staged migration, rotation, and independent-review requirements |

## Automated lifecycle integration gate

GitHub Actions starts a disposable MySQL 8.4 service and launches the same `secure-server.js` production entry point used in deployment. Synthetic/test data and test-only network interception are used; production credentials, customer data, real charges, and real email delivery are not used.

The gate covers:

- registration → authenticated session → second login → logout → revoked-session denial;
- password change invalidating other sessions while preserving the active changing session;
- legacy-device authorization → one-time password/session migration;
- Sign out everywhere → revocation of all server sessions;
- locally signed Stripe webhook → server-owned entitlement transition → replay idempotency → downgrade closure;
- device inventory/revocation and revoked-credential denial;
- sharing creation → public snapshot retrieval → revocation → post-revocation denial;
- encrypted-sync first write → opaque read-back → stale revision conflict → correct next revision;
- paid capabilities closing after entitlement downgrade.

The CI integration job is followed by a logical MySQL backup → separate-schema restore drill. This proves automated recoverability of the tested schema, not the production provider's backup/PITR service.

## Local encryption and recovery decision

Pamet still does **not** claim that the browser working journal is encrypted at rest.

The implementation framework follows the approved direction in `LOCAL_ENCRYPTION_THREAT_MODEL.md` and `LOCAL_ENCRYPTION_IMPLEMENTATION_PLAN.md`: random per-profile data-encryption keys, AES-256-GCM content encryption, a user-held recovery root key, HKDF-derived wrapping keys, and staged copy → decrypt/compare → switch migration semantics.

The resettable Pamet account password is deliberately not the journal encryption key. A trusted device or user-held recovery material may restore encrypted journal access; if every valid key source is lost, historical encrypted content is intentionally unrecoverable by Pamet.

The framework remains disabled until independent cryptographic/security review plus browser persistence, interruption, recovery, migration, rotation, and lost-key acceptance are complete.

## Deployment configuration required

Configure production secrets outside Git:

- MySQL: `DATABASE_URL`, or `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`; use TLS and certificate validation.
- Apply `db/schema.sql` through the deployment migration process. Keep `AUTO_MIGRATE=false` after controlled production migration.
- Stripe: publishable/secret/webhook keys plus four approved price IDs.
- Email: `RESEND_API_KEY` and a verified `EMAIL_FROM`.
- Scheduler: high-entropy `CRON_SECRET`.
- Distributed limits: TLS-protected `REDIS_URL`/Valkey where production scale requires it; atomic MySQL fallback remains a resilience path.
- Web Push: `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`.
- Identity: random 32-byte `IDENTITY_ENCRYPTION_KEY` encoded as 64 hex characters.
- Observability: Grafana Cloud OTLP endpoint/username/least-privilege token or the documented generic log/alert integrations; retain `METRICS_SECRET` for protected diagnostics.

Approved Stripe catalog:

| Plan | Monthly | Annual |
|---|---:|---:|
| Pro | $6.99 | $59.99 |
| Ultra | $12.99 | $99.99 |

After deployment, require `/api/health` HTTP 200 reporting the intended release and `/api/ready` HTTP 200 before treating the deployment as ready.

## External and environment-specific launch gates

These cannot honestly be marked complete by repository CI alone:

1. **Provider backup/restore:** perform a real production-provider backup/PITR or isolated full restore; record backup frequency, retention/encryption, achieved RPO/RTO, date, evidence, and deletion behavior.
2. **Controlled live billing:** exercise checkout, seven-day trial, cancellation, failed payment, billing portal, webhook retry, and entitlement reconciliation with a controlled deployed account.
3. **Deployed dependencies:** verify database TLS, cache/rate limiting as applicable, email, Web Push, logs/metrics, alert/paging destinations, and `/api/ready` results.
4. **User-security acceptance:** deployed password recovery, MFA enrollment/removal/recovery, two-device sessions, logout-all, and device revocation.
5. **Sync/key acceptance:** deployed encrypted-sync conflict, recovery-key restoration, and lost-all-key behavior.
6. **Independent security assurance:** penetration testing plus remediation/retest evidence.
7. **Independent accessibility assurance:** WCAG 2.2 AA, keyboard, screen reader, zoom/reflow, touch-target, modal, light/dark, and mobile testing.
8. **Privacy/legal/vendor posture:** review actual deployed data flows, product claims, caregiver/provider sharing, and required BAA/DPA/vendor agreements. Do not claim HIPAA/SOC 2/clinical validation without applicable completed evidence.
9. **Legacy auth sunset:** measure compatibility-credential use and retire the bearer path after documented migration/sunset criteria are satisfied.
10. **Final CSP cleanup:** migrate remaining inline style usage before removing `style-src 'unsafe-inline'`.
11. **Working-journal encryption:** complete independent review and migration/recovery/key-loss acceptance before enabling or marketing encrypted local journal storage.

See `RELEASE_STATUS.md`, `STAGING_ACCEPTANCE.md`, `BACKUP_RESTORE_RUNBOOK.md`, `ASSURANCE_HANDOFF.md`, and `LEGACY_AUTH_SUNSET.md` for evidence/runbook details.

## Release commands

```sh
npm ci
npm audit --omit=dev
npm run check
npm test
# MySQL-backed integration CI runs with PAMET_INTEGRATION_TESTS=true.
NODE_ENV=production npm start
```

## Release decision

The 1.2.1 repository should be considered a **stabilized scoped-beta candidate**, contingent on green CI and a successful post-deployment smoke check. The open external/production gates above remain visible prerequisites for stronger production-assurance claims.
