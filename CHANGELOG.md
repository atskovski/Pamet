# Pamet Change Log

This file is the repository system of record for completed product and engineering changes. It is not rendered inside the Pamet application.

## [1.2.2] — 2026-09-03

### Deployment and release identity hardening

- Bumped the stabilization patch release to **1.2.2**.
- Made the production edge serve `index.html` and inject the canonical release into the Settings footer.
- Added `X-Pamet-Version` to production responses so live release identity can be verified without relying on client JavaScript.
- Normalized `/api/health`, `/api/ready`, rendered Settings version, and browser runtime around the same `package.json` release.
- Rewrites the production JS/CSS cache-buster query strings from the current release before serving the application document.
- Moved `esbuild` into production dependencies so Wasmer can rebuild the browser bundle even if deployment installation omits devDependencies.
- Refreshed the PWA shell to `pamet-shell-v122-0` and forces network refresh for current shell assets before falling back to cache.
- Updated the browser fallback and service-worker registration to 1.2.2.
- Strengthened release checks so CI fails if server-rendered version identity, production build tooling, or 1.2.2 PWA cache/version signals drift.
- Continued the real-environment acceptance work and kept Wasmer deployment synchronization as an explicit production gate until direct live evidence matches GitHub `main`.

---

## [1.2.1] — 2026-09-03

### Stability and release discipline

- Standardized the current release as **1.2.1** under semantic versioning.
- Declared `package.json` the canonical application release version.
- Added `VERSIONING.md` rules for patch, minor, and major releases plus a required release checklist.
- Added `scripts/check-version.js` so CI fails when important release surfaces drift.
- Reworked the README into a concise current-state / future-state / production-gates dashboard.

### Security and account UX

- Centered Account Security and password-recovery dialogs in the viewport with safe-area and short-screen handling.
- Fixed the asynchronous password-reset form-reference crash.
- Preserved a visible Create Account path and added a deliberate **Use a different account** flow after logout.
- Added safe account switching that warns before clearing the previous account's browser-local journal so data is not mixed between accounts.
- Replaced the legacy-device sign-in dead end with a one-time authorized migration into normal server password/session authentication.
- Added **Sign out everywhere** to revoke all server sessions.
- Rebuilt Account Security around device review/revocation, retry/error states, MFA setup/disable, and fresh authenticator setup on each attempt.
- Added a local-only authenticator QR encoder. The TOTP secret is not sent to a third-party QR service.
- MFA activation remains confirmation-gated until a valid authenticator code is verified.

### Mobile and PWA hardening

- Added safe-area, narrow-phone, landscape, input-zoom, touch-target, settings, report, QR, and modal responsive safeguards.
- Made product-feedback confirmation prominent and auto-dismiss after five seconds.
- Moved service-worker registration into the external production JavaScript bundle so CSP hardening cannot silently prevent PWA registration.
- Refreshed the PWA shell cache to `pamet-shell-v121-0`.
- Explicitly excludes API and sensitive share paths from service-worker caching.

### Production assurance improvements

- Extended CI with MySQL-backed legacy-upgrade and all-session-revocation integration coverage.
- Retained the full account/Stripe/device/sharing/encrypted-sync production lifecycle matrix.
- Added a disposable MySQL logical backup → separate-schema restore drill and integrity assertions.
- Added/updated provider restore, staging acceptance, legacy-auth sunset, and external-assurance runbooks.
- Added a tested, disabled-by-default local journal encryption implementation framework using per-profile DEKs, AES-256-GCM, a user-held recovery root key, HKDF-derived wrapping keys, staged migration, decrypt/compare verification, and explicit review gates.
- Kept local journal encryption disabled until independent review and migration/recovery/key-loss testing are complete.
- Kept production-provider restore evidence, legacy bearer retirement, final CSP style cleanup, penetration testing, accessibility review, privacy/legal review, and production acceptance exercises open rather than self-certifying them.

### Release verification

- Quality checks, UI/security regression tests, local-crypto tests, dependency audit, MySQL integration lifecycle tests, and the backup/restore drill are release gates.
- `/api/health` on the production edge reports the canonical 1.2.1 release identity.

---

## [1.2.0] — 2026-09-02

### Production architecture

- Consolidated production assets into one minified JavaScript bundle and one minified stylesheet.
- Added cross-device email/password authentication with server-side scrypt verifiers, expiring/revocable HttpOnly sessions, same-origin mutation protections, and a legacy-device migration boundary.
- Added one-time emailed password reset, optional authenticator verification, server password replacement, session revocation, and automatic sign-in after successful reset.
- Added server-authoritative entitlements and persisted Ultra appointment records.
- Added explicit sharing/session deletion and Stripe customer cleanup.
- Added Wasmer-compatible idempotent MySQL migration handling and locked automatic production migration off after controlled migration.
- Added an atomic MySQL distributed-rate-limit fallback for deployments without Redis/Valkey.
- Added direct Grafana Cloud OTLP/HTTP logs and request metrics with readiness integration.
- Added production VAPID, metrics, cron, identity-encryption, and Ultra deployment configuration boundaries outside Git.

### Product refinements

- Refined Ultra around appointment preparation, Advanced Visit Briefs, multi-profile care, sharing, encrypted sync, and advanced care coordination.
- Renamed “Longitudinal analysis” to **Health history over time**.
- Rebuilt shipped icon sizes from the approved folded-leaf mark.
- Restored account creation after account deletion and improved authentication guidance.

---

## [1.1.0] — 2026-09-02

- Added Redis/Valkey-backed distributed rate limiting with production fail-closed behavior and readiness reporting.
- Added closed-app Web Push subscriptions, VAPID delivery, timezone-aware reminder scheduling, click-through handling, and a delivery workflow.
- Added per-device credentials, remote device revocation, single-use email recovery, and authenticator-app MFA with encrypted TOTP seeds.
- Added Ultra browser-encrypted sync using AES-256-GCM, HKDF profile separation, optimistic revisions, and opaque server storage.
- Added centralized structured logs, metrics, and alert integration frameworks.
- Added external penetration, accessibility, and privacy/legal review scopes without claiming self-certification.

---

## [1.0.5] — 2026-09-02

- Rebuilt dark mode around neutral charcoal-teal surfaces, accessible text/control contrast, sky-blue information accents, and sage affirmative actions.
- Replaced app icon sizes with the approved folded-leaf mark.
- Added rotating Pamet landscape scenes to authentication and improved in-form login guidance.
- Added consent-based reminders and new-observation notifications with browser plus in-app fallback.
- Refined Ultra positioning to **Advanced care coordination** and simplified settings/plan presentation.

---

## [1.0.4] — 2026-09-01

### Production hardening

- Normalized the release line and adopted semantic versioning.
- Consolidated the runtime into one Express application and removed duplicate billing/webhook implementations.
- Replaced repository-root static serving with explicit app-asset routes.
- Added CSP, HSTS, frame/content-type/referrer/permissions protections, request IDs, no-store API responses, strict JSON/body limits, safe production errors, and endpoint rate limits.
- Added dependency readiness, live Stripe price-catalog validation, checkout/customer idempotency, webhook event idempotency, and entitlement verification.
- Removed browser self-upgrade paths; paid entitlements became backend-authoritative.
- Made backend account deletion authoritative before local erasure.
- Upgraded local password derivation and automatic legacy-hash migration.
- Expanded CSV/JSON portability and protected CSV output against formula execution.
- Removed the inaccurate end-to-end-encryption setting.
- Added strict share validation, revocation auditing, production assertions, HTTP security smoke tests, service-worker release isolation, and database cold-start hardening.

### Advanced capabilities

- Added expanded starter logging choices and custom-field removal controls.
- Added Ultra multi-profile management with separate local entry storage.
- Added Ultra appointment preparation, 90-day comparisons with data-strength context, Advanced Visit Briefs, and advanced sharing metadata.
- Added complete authenticated backend account deletion with Stripe subscription/customer cleanup.

---

## [1.0.3] — 2026-09-01

- Added truthful first-use Home state with no sample entries, fake metrics, observations, streaks, or recent-entry content.
- Added **No symptoms today** and required a valid symptom state, mood, and activity before save.
- Added privacy-minimal **Help improve Pamet** feedback storage without account or health fields.
- Replaced AI-first labels with **Pamet pattern detection**, **Pamet observations**, and **Pamet pattern summary**.
- Added complete PWA icon/manifest/offline-shell foundations.

---

## [1.0.2] — 2026-08-31

- Added the **Warm Clinical Minimalism** visual system and approved Pamet mark.
- Added the Free — Track / Pro — Understand / Ultra — Prepare product hierarchy.
- Added persistent sign-in, deliberate account creation, What Changed?, caregiver access, Primary Care Access, weekly digest email, registration email, sharing links, and Stripe subscription foundations.
- Removed visible Custom symptoms from Settings, removed “No ads” as a paid benefit, and confirmed no advertising on any plan.
- Removed unsupported end-to-end-encryption claims and live caregiver/emergency/live-doctor-portal expectations.

---

## [1.0.1]

- Initial browser-based account gate.
- Home, Log, Calendar, Patterns, Report, and Settings foundations.
- Local symptom/mood/activity/medication custom fields.
- Local pattern detection and metrics.
- CSV/JSON export and print-to-PDF report.
- PWA manifest/service-worker foundations.
