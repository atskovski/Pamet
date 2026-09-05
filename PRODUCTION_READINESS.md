# Pamet v1.6.8 Production Readiness Review

Updated for the 1.6.4 production-hardening release. This is an engineering readiness record, not a compliance certification.

## Release posture

Pamet 1.6.4 keeps the 1.6.x strict-CSP and feature-owned architecture while tightening production consistency and scale controls. The release adds a canonical Free/Pro/Ultra catalog and full in-app feature matrix, clearer notification-health behavior, resilient GitHub OIDC scheduled-job verification for environments with restricted JWKS egress, scale-oriented MySQL indexes, and blocking plan/notification/database/performance release checks.

The repository has automated production/security checks, MySQL-backed lifecycle integration, dependency auditing, a disposable backup → isolated-restore drill, live Wasmer acceptance, and admin parity. Stronger production-assurance claims still depend on external/provider evidence below.

## Implemented and verified in code / CI

| Area | Production control |
|---|---|
| Runtime | Express application behind hardened secure edge; health/readiness endpoints and no-store API behavior |
| Release identity | `package.json` is canonical across server, browser, mobile contract, support surfaces and PWA controls |
| PWA delivery | Worker URL/cache/static asset identity rotates per release and version CI rejects stale cache identities |
| Plan consistency | `contracts/plan-features.json` generates display metadata; CI rejects drift from mobile/server entitlement rules |
| Notification health | Settings checks support, permission and active subscription, with visible recheck and state-specific repair feedback |
| Database scale | Scheduled-work indexes, cursor batching, explicit work limits and a documented per-instance connection budget |
| Performance | Blocking raw/gzip production JS/CSS bundle budgets prevent unbounded front-end growth |
| HTTP security | Strict CSP without script/style `unsafe-inline`, HSTS, frame denial, MIME/referrer/permissions controls and request IDs |
| Authentication | Server-side password verification, breached-password screening, HttpOnly sessions, revocation, recovery and MFA |
| Scheduled-job auth | GitHub OIDC signature + claim validation with network JWKS preference and automatically refreshed bundled public-key fallback |
| Billing | Server-owned entitlements, exact Stripe price validation, idempotent creation, signed webhooks and event deduplication |
| Sharing | Random hash-only tokens, expiry/revocation, plan enforcement, snapshot limits and failed-email rollback |
| Encrypted sync | Ultra API stores versioned browser-produced ciphertext; Pamet does not receive the recovery key |
| Working-journal encryption | Not shipped; remains independent-review gated |
| Reminders | User-consented Web Push, bounded reminder jobs, deduplication and stale-subscription disabling |
| CI | Build, CSP/version/cache/static checks, unit/security/UI tests, plan/notification/scale/performance gates, dependency audit, MySQL lifecycle and restore drill |
| Observability | Structured events, metrics, readiness, Grafana OTLP and alert integration |

## Scale posture

Pamet does not have a fixed registered-user ceiling. `pamet_users.id` is `BIGINT UNSIGNED`; practical limits are application replicas, database connections/IO/storage, workload concurrency and provider quotas.

The current theoretical default MySQL pool budget is 14 connections per application instance. Production replicas must be sized against the provider's real `max_connections` with reserve capacity. Do not blindly raise connection pools as traffic grows. See `docs/SCALING_AND_CAPACITY.md` and the blocking `scripts/check-db-capacity.js` gate.

A numeric concurrent-user claim requires a production-like load test with p95/p99 latency, error rate, DB connection wait/utilization, CPU/memory/IOPS, and scheduled-job duration. Repository review alone cannot establish that number.

## Automated lifecycle integration gate

GitHub Actions starts MySQL 8.4 and launches the same `secure-server.js` production entry point used in deployment. Synthetic data/test network interception are used; production credentials, customer data, real charges and real email delivery are not used.

Coverage includes authentication/session lifecycle, password changes, legacy migration, logout-all, Stripe entitlement transitions/webhook idempotency, device revocation, sharing create/open/revoke, encrypted-sync revision conflicts, paid-capability closure after downgrade, and logical backup → isolated restore.

## Deployment configuration required

Configure secrets outside Git. Production integrations include MySQL, Stripe, Resend, Redis/Valkey where used, VAPID, identity encryption, observability, metrics protection and alerting. Scheduled GitHub jobs prefer OIDC and do not require a new long-lived GitHub-to-Pamet secret. Bundled OIDC verification material contains only public GitHub signing keys and is refreshed automatically.

Run controlled database migrations separately from ordinary request startup. For 1.6.4, apply `db/migrations/2026-09-04-scale-indexes.sql` to an existing production schema and verify the indexes before declaring database scale acceptance.

Approved Stripe catalog:

| Plan | Monthly | Annual |
|---|---:|---:|
| Pro | $6.99 | $59.99 |
| Ultra | $12.99 | $99.99 |

## External and environment-specific launch gates

Repository CI cannot honestly mark these complete:

1. provider production PITR/full restore with measured RPO/RTO (#47);
2. controlled production Stripe lifecycle acceptance (#46);
3. deployed dependency/provider acceptance including alert receipt/escalation (#49);
4. independent penetration testing and retest (#43);
5. independent WCAG 2.2 AA review and retest (#44);
6. independent cryptographic review before encrypted working-journal storage (#48);
7. qualified privacy/legal/vendor review (#45);
8. legacy authentication sunset after production migration telemetry (#8).

## Release decision

Pamet 1.6.4 is merge-ready only after exact-head CI is green. It is production-green only after the merged SHA also passes live Wasmer version/readiness, scheduled-job OIDC acceptance and admin parity. Provider/independent gates remain explicitly open until real evidence exists.
