# Pamet v1.6.3 Production Readiness Review

Updated for the 1.6.3 brand, care-workflow, history-comparison, responsive-UI, and release-delivery patch. This is an engineering readiness record, not a compliance certification.

## Release posture

Pamet 1.6.3 is a patch release that keeps the 1.6.x strict-CSP and feature-owned frontend architecture while promoting the refreshed Pamet icon system, quick profile switching, more consistent sentence-case UI copy, deeper Health history over time comparisons, local PDF care-summary output, one consolidated Primary care visit-brief flow, and responsive Appointment Workspace fixes. The release also rotates PWA worker/cache identities so installed clients request the new visual and functional bundle.

The repository has automated production/security checks, MySQL-backed lifecycle integration coverage, dependency auditing, and a disposable backup → isolated-restore drill. Stronger production-assurance claims still depend on the external and provider-specific evidence listed below.

## Implemented and verified in code / CI

| Area | Production control |
|---|---|
| Runtime | One reviewed Express application behind a thin hardened production edge; explicit health and database-readiness handlers |
| Release identity | `package.json` is canonical; server, browser runtime, Settings footer, Privacy/Safety support, mobile contract, and PWA release controls are checked for version consistency |
| PWA release delivery | Worker URL, worker HTTP-cache behavior, shell cache name, and JS/CSS asset query tokens rotate with each release; versioned assets are not matched with `ignoreSearch` |
| Brand / app icon | Refreshed green/teal/blue Pamet mark is used by in-app branding and PWA install assets, including 192 px, 512 px, and maskable icon variants |
| Health history comparisons | 30/90/180-day comparisons normalize symptom frequency by logged days and summarize severity, sleep, stress, activity, data strength, and user-entered-data limitations |
| Care summary portability | Health-history, caregiver, and primary-care outputs can be printed/saved as PDF locally; email sharing remains available when configured |
| Appointment Workspace | Responsive constraints are applied to reduce overlapping, clipped, and cramped content across desktop/mobile viewport sizes |
| Dark mode | Unified near-black/surface/elevated-surface system; dark mode is the final stylesheet override layer; Insights completeness/empty states, controls, forms, and common cards use readable dark surfaces and text |
| Public files | Only the application shell, share page, manifest, service worker, and approved asset/bundle directories are served |
| HTTP security | Strict CSP without script/style `unsafe-inline`, `script-src-attr 'none'`, `style-src-attr 'none'`, HSTS in production, frame denial, MIME-sniffing prevention, referrer/permissions policies, request IDs, and no-store API/share responses |
| Authentication | Server-side password verification, breached-password screening, expiring HttpOnly sessions, cross-device login, legacy migration, remote session/device revocation, password recovery, and authenticator MFA |
| Billing | Server-owned entitlements, exact Stripe price validation, idempotent subscription/customer creation, signed webhooks, and database webhook deduplication |
| Sharing | Random hash-only tokens, expiry, revocation, plan enforcement, view/download permissions, snapshot limits, and failed-email rollback |
| Encrypted sync | Ultra API stores versioned AES-256-GCM ciphertext produced in the browser; recovery keys are not transmitted to Pamet |
| Local working-journal encryption | Not shipped; implementation remains review-gated and Pamet does not claim the working browser journal is encrypted at rest |
| Reminders | User-consented Web Push subscriptions, VAPID delivery, appointment reminder scheduling, deduplication, and stale-subscription disabling |
| CI | Production build, release/version/CSP/cache checks, unit/security/UI tests, dependency audit, MySQL-backed lifecycle integration, and disposable backup/restore drill |
| Observability | Structured events, protected metrics, alert integration, Grafana Cloud OTLP logs/metrics, and readiness visibility |

## Automated lifecycle integration gate

GitHub Actions starts a disposable MySQL 8.4 service and launches the same `secure-server.js` production entry point used in deployment. Synthetic/test data and test-only network interception are used; production credentials, customer data, real charges, and real email delivery are not used.

The gate covers authentication/session lifecycle, password changes, legacy migration, logout-all, Stripe entitlement transitions and webhook idempotency, device revocation, sharing create/open/revoke, encrypted-sync revision conflicts, and paid-capability closure after downgrade. CI then performs a logical database backup and restores it into a separate schema with integrity checks.

## Deployment configuration required

Configure production secrets outside Git. Required integrations include MySQL, Stripe, Resend, scheduler secret, Redis/Valkey where used, VAPID, identity encryption, observability, metrics protection, and alerting. Keep controlled migrations separate from normal request startup and verify `/api/health` and `/api/ready` after each deployment.

Approved Stripe catalog:

| Plan | Monthly | Annual |
|---|---:|---:|
| Pro | $6.99 | $59.99 |
| Ultra | $12.99 | $99.99 |

## External and environment-specific launch gates

These cannot honestly be marked complete by repository CI alone:

1. **Provider backup/restore:** perform a real production-provider PITR or isolated full restore and record achieved RPO/RTO, retention, encryption, and evidence.
2. **Controlled live billing:** exercise production checkout, trial, cancellation, failed payment, billing portal, webhook retry, and entitlement reconciliation with controlled accounts.
3. **Deployed dependency acceptance:** verify database TLS, rate limiting/cache as applicable, email, Web Push, logs/metrics, alerts, and `/api/ready` in the actual environment.
4. **Independent security assurance:** penetration testing plus remediation/retest evidence.
5. **Independent accessibility assurance:** WCAG 2.2 AA review covering keyboard, screen reader, zoom/reflow, touch, modals, light/dark, and mobile states.
6. **Independent cryptographic review:** required before enabling or marketing encrypted working-journal storage.
7. **Privacy/legal/vendor posture:** qualified review of actual data flows, HIPAA applicability, BAA/DPA requirements, consumer-health-data obligations, retention/deletion, and product claims.
8. **Legacy authentication sunset:** retire compatibility credentials only after measured migration/sunset criteria are satisfied.

## Release decision

Pamet 1.6.3 should be treated as release-ready only after exact-head CI is green and the deployed environment confirms the same 1.6.3 release identity and current visual/functional bundle. Independent/provider gates remain open until actual evidence exists.
