# Pamet Change Log

This file is the repository-only system of record for product and engineering changes. It is **not rendered inside the Pamet application**.

## [1.0.4] — 2026-09-01

This release normalizes the advanced-plan work that was temporarily labeled 2.0.x into the compatible v1 release line. The next release begins at v1.0.5.

### Production hardening

- Normalized the release line to v1.0.4 and documented semantic versioning beginning with v1.0.5.
- Removed the redundant Ultra feature flag; Pro and Ultra availability now depends on their own monthly/annual price IDs passing live Stripe catalog validation.
- Added daily Stripe entitlement reconciliation for recovery from missed or delayed webhook delivery.
- Added behavior-level HTTP tests and dependency auditing to the pull-request/main CI workflow.
- Added optional privacy-minimal feedback webhook routing and explicit browser-data, insight-safety, and production-readiness documentation.
- Reworked the plan comparison into a concise, scroll-safe Pro/Ultra view with five clearly separated features and Pro positioned as the recommended tier.
- Consolidated the runtime into one Express application and removed duplicate billing/webhook implementations.
- Replaced repository-root static serving with explicit app-asset routes, preventing source, schema, lockfile, and configuration-example disclosure.
- Added CSP, HSTS, frame/content-type/referrer/permissions protections, request IDs, no-store API responses, strict JSON/body limits, safe production errors, and endpoint rate limits.
- Added dependency readiness, Stripe price-catalog validation, checkout/customer idempotency, concurrency-safe webhook event processing, and trial entitlement verification.
- Removed the browser self-upgrade path; paid entitlements now come from backend-verified Stripe state.
- Made backend account deletion authoritative before local erasure so failed Stripe/cloud cleanup cannot strand remote data.
- Upgraded local password derivation to PBKDF2-HMAC-SHA-256 with 600,000 iterations and automatic legacy-hash migration.
- Expanded CSV/JSON portability across all profiles and protected CSV exports against formula execution.
- Removed the inaccurate end-to-end-encryption setting and clarified local-storage boundaries.
- Added implemented view/download share behavior, strict share validation, invitation rollback on email failure, and revocation auditing.
- Added production static assertions and HTTP security smoke tests.
- Disabled immutable caching for unversioned application assets and refreshed the service-worker shell cache so deployments cannot strand clients on mixed releases.
- Added release-specific asset URLs and versioned worker registration to prevent an existing worker from replaying an earlier application bundle during rollout.
- Made database initialization single-flight with a safe cold-start retry and failed-pool cleanup.
- Separated production schema migration from request startup; production readiness now performs a connection check instead of DDL.

### Advanced plan capabilities

### Added

- Added ten researched, broadly recognizable starter options in each Log category: symptoms, emotional feelings, physical activity, and medication types.
- Added a **minus (−)** action beside every custom-field plus action. The removal dialog identifies the selected custom item and requires confirmation before deletion.
- Added Ultra multi-profile management. Each profile has separately keyed, device-local journal storage; v1 entries migrate into the primary profile.
- Added Ultra appointment preparation, 90-day longitudinal comparisons with visible data-strength context, and Advanced Visit Brief generation.
- Added Ultra advanced sharing with profile scope, view/download permissions, configurable expiration, optional notes, revocation, and backend permission metadata.
- Added a complete authenticated backend account-deletion endpoint that cancels an active Stripe subscription and deletes account, audit, and cascade-linked sharing data.
- Added automated v1.0.4 assertions for defaults, removal controls, profiles, advanced tools, account deletion, permission persistence, service-worker versioning, and dark-mode contrast.

### Changed

- Version changed incrementally from **v1.0.3** to **v1.0.4** for this compatible feature and hardening release.
- Reworked dark mode into layered teal surfaces with 9.47:1 primary-text contrast, 7.70:1 secondary-text contrast, and at least 3:1 meaningful control-boundary contrast.
- Settings help controls now prevent accidental toggle changes, support keyboard activation, expose expanded state, and close when users click elsewhere.
- CSV and JSON export are available to every plan as a data-portability and trust requirement.
- Password changes now require at least ten characters and use a dedicated confirmation form.
- Free history is a 90-day rolling view while export continues to include the user's complete locally stored history.
- Pro is presented as **Most popular** and remains the recommended individual tier; Ultra is labeled for families and care teams.

### Pricing decision

- Retained Pro at **$6.99/month or $59.99/year** and Ultra at **$12.99/month or $99.99/year**.
- Pro remains the value anchor for individual users. Ultra is intentionally a stretch tier based on multi-profile, care-coordination, and appointment-preparation value rather than additional logging limits.

### Preserved exclusions

- No live caregiver alerts, missed-log escalation, drug-interaction warnings, emergency detection, live doctor portal, or diagnostic/treatment claims were added.

## [1.0.3] — 2026-09-01

### Added

- Added a first-use Home state: “Your health history starts here. Entries and observations will appear here once you track your details.”
- Added an explicit **No symptoms today** logging choice and required symptom status, mood, and activity before an entry can be saved.
- Added a privacy-minimal **Help improve Pamet** form. It stores category, optional 1–5 rating, message, app version, screen, and timestamp in `pamet_feedback`; it stores no account identifier or health entry.
- Added automated checks for fresh-store emptiness, migration of legacy sample entries, auth form visibility, empty dashboard state, feedback storage boundaries, and PWA installability.
- Added complete PWA icon sizes, a maskable icon, app shortcut, and a v1.0.3 static-shell cache.

### Changed

- Version changed incrementally from **v1.0.2** to **v1.0.3**.
- First-time users no longer receive sample health entries, counts, streaks, symptoms, observations, or recent-entry content. Legacy `seed-*` sample records are removed while real entries are preserved.
- Dashboard metrics, the observation banner, and the Recent entries section remain hidden until the user has recorded an entry.
- Replaced user-facing AI-first language with **Pamet pattern detection**, **Pamet observations**, and **Pamet pattern summary**.
- Entry confirmation now reads: “Entry saved! Pamet is updating your patterns.” and remains hidden until a valid entry is saved.
- The account-creation form remains hidden until **Don’t have an account? Create one** is selected; name fields no longer show sample names.
- Refined the Pamet mark for clear reproduction from 16 px through install-icon sizes and regenerated 192 px, 512 px, and maskable assets.

### Privacy / Data handling

- Feedback submission requires a valid Pamet device credential in transit to reduce abuse, but the credential, user ID, email, IP address, journal entries, symptoms, medications, and notes are not written to `pamet_feedback`.
- The feedback table has no foreign key to `pamet_users` and no account column.
- Service-worker caching remains limited to static assets and bypasses all `/api/` requests.

## [1.0.2] — 2026-08-31

### Added

- Added the Pamet Product Strategy v3.0 foundations to the repository README: Executive Summary, Product Vision, Product Promise, Product Principles, Core Product Architecture, Free/Pro/Ultra hierarchy, privacy boundaries, and roadmap.
- Added **Warm Clinical Minimalism** visual system using Deep Teal `#0F3D3E`, Sage `#4CAF7A`, Sky Blue `#6EA8D8`, Warm Gray `#F4F5F2`, Soft Sand `#F5EDE4`, Slate `#5B6B73`, Charcoal `#263638`, Terracotta `#C1633D`, Ochre `#D9A441`, and Muted Berry `#8E3B4F`.
- Added Inter as the primary UI typeface and a new organic Pamet mark.
- Added **What Changed?** as a Pro experience comparing recent and previous periods.
- Added Pro/Ultra-gated **Caregiver access** with name/email capture, read-only sharing, expiring invitation links, and revocation.
- Added Pro/Ultra-gated **Primary Care Access** as a read-only Visit Brief share rather than a live doctor portal.
- Added `share.html` for secure read-only caregiver/provider summaries.
- Added explicit-opt-in **Weekly digest email** support using the account email.
- Added registration confirmation email support with the message “Thanks for registering with Pamet.”
- Added Node.js/Express backend support for billing, email, digest preferences, and sharing.
- Added MySQL schema for minimal account metadata, Stripe entitlements, sharing invitations, digest preferences, and audit events.
- Added Stripe web subscription integration using Stripe Payment Element, server-side entitlement verification, webhook signature validation, seven-day trial support, and Stripe customer billing portal.
- Added `.env.example` with secret placeholders only.
- Added repository-only change tracking through this file.

### Changed

- Version changed from **v1.0.1** to **v1.0.2**.
- The v1.0.2 brand stylesheet and runtime are now loaded directly so the production UI cannot remain on the v1.0.1 fallback experience.
- Hidden authentication forms now remain hidden even when the shared form layout declares `display: flex`.
- Authentication sessions changed from `sessionStorage` to persistent `localStorage`; users remain signed in until explicit logout.
- Existing v1.0.1 session state is migrated when possible.
- PBKDF2 iterations increased for new/changed local passwords.
- “Create your account” is hidden on devices where a Pamet account already exists.
- **Your plan** now follows the product architecture: Free — Track, Pro — Understand, Ultra — Prepare.
- Pro pricing changed to **$6.99/month** and **$59.99/year**; annual is preferred and communicates approximately 28% savings.
- Ultra pricing is **$12.99/month** and **$99.99/year**. Checkout is available only when both live Stripe price IDs pass server-side catalog validation.
- Caregiver Access and Primary Care Access now require a paid entitlement before configuration.
- Weekly digest changed from an unimplemented local-only preference to an explicit server-backed opt-in.
- Existing v1.0.1 users with the old default-on weekly digest are migrated to off until they affirmatively opt in.
- “AI Patterns” is presented as **Insights** so AI remains a supporting capability rather than the product identity.
- “Doctor Report” is presented as **Visit Brief**.
- Health-history accumulation language replaces streak/gamification language.
- Pattern text is rewritten to avoid causal or prescriptive claims and remain observational.
- Service worker caching is limited to the static app shell and explicitly bypasses `/api/` requests.

### Removed

- Removed the visible **Custom symptoms** card from Settings. Custom symptoms/fields remain managed from the Log flow.
- Removed **“No ads”** as a paid-plan benefit. Pamet has no advertising on Free, Pro, or Ultra.
- Removed visible streak-reminder/gamification controls from the v1.0.2 experience.
- Removed the unsupported **End-to-end encryption** toggle. v1.0.1 stored entries in browser storage and did not implement true end-to-end encryption.
- Removed live caregiver alert expectations, missed-log caregiver notifications, and automated symptom escalation from the product direction.
- Removed live doctor-portal claims from the current product experience.
- Removed the **Stripe Setup** section from the public README; operational billing configuration remains outside the product-facing repository overview.

### Privacy / Security

- Passwords remain device-local and are not sent to the Pamet backend.
- Optional backend services use a random per-installation credential; the backend stores only its SHA-256 hash.
- Stripe secret keys and webhook secrets are server-only environment variables.
- Stripe subscription access is verified server-side; the browser cannot self-upgrade a plan.
- Sharing tokens use cryptographically secure randomness, are stored only as hashes, expire, and can be revoked.
- Weekly digest email subjects contain no symptom details.
- Weekly digest data is aggregate and excludes free-text notes by default.
- API responses are excluded from service-worker caching.

### Deployment / Configuration Required

Production activation of external services requires deployment configuration; no credentials are committed to GitHub:

- MySQL: `DATABASE_URL` or `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- Stripe: publishable key, secret key, webhook secret, and Pro price IDs
- Resend: API key and verified `EMAIL_FROM`
- Weekly scheduler: `CRON_SECRET`
- GitHub Actions scheduler: `PAMET_APP_URL` and `PAMET_CRON_SECRET`

### Intentionally Deferred

These are product-roadmap items, not v1.0.2 defects:

- Multi-profile management
- Multiple caregivers and View / Log / Edit roles
- AI appointment preparation
- Longitudinal AI analysis
- Advanced Visit Briefs
- Secure clinician portal
- Healthcare integrations
- Medication-interaction services
- Wearables
- Emergency detection or automated clinical escalation

## [1.0.1]

### Added

- Initial browser-based local account gate.
- Home, Log, Calendar, AI Patterns, Doctor Report, and Settings screens.
- Local symptom/mood/activity/medication custom fields.
- Local pattern detection and metrics.
- CSV/JSON export and print-to-PDF report.
- PWA manifest/service worker.
- Local Free/Pro prototype plan controls.
