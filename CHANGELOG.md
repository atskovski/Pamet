# Pamet Change Log

This file is the repository-only system of record for product and engineering changes. It is **not rendered inside the Pamet application**.

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
- Authentication sessions changed from `sessionStorage` to persistent `localStorage`; users remain signed in until explicit logout.
- Existing v1.0.1 session state is migrated when possible.
- PBKDF2 iterations increased for new/changed local passwords.
- “Create your account” is hidden on devices where a Pamet account already exists.
- **Your plan** now follows the product architecture: Free — Track, Pro — Understand, Ultra — Prepare.
- Pro pricing changed to **$6.99/month** and **$59.99/year**; annual is preferred and communicates approximately 28% savings.
- Ultra pricing is represented as **$12.99/month** and **$99.99/year**, but purchasing is disabled by default until Phase 2 functionality is ready.
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
