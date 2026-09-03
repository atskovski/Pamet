# Pamet — Personal Health Journal

**Version 1.5.1**  
**Your health history, finally useful.**

Pamet is a privacy-first personal health journal for recording symptoms, medications, mood, activity, lifestyle factors, notes, and other user-provided health information over time, then organizing those observations for personal review and healthcare conversations.

> **Pamet observes. Pamet does not diagnose.**

Pamet is not emergency monitoring, a diagnostic service, a clinical decision tool, or a replacement for professional medical care.

## Current State

Pamet is an actively developed web/PWA product deployed from GitHub `main` to Wasmer.

### Core product

- Local-first health journal with truthful empty states and no sample health data.
- Calendar/history review with explicit distinction between **no entry** and **no symptoms recorded**.
- Long-history Calendar search, symptom filtering, and a **Today** shortcut.
- Observational Insights with 7/30/90-day windows, category filters, evidence expansion, trend direction, data completeness, and non-destructive Archive/Restore.
- **Visit Brief** for patient-generated summaries intended to support healthcare conversations.
- Free / Pro / Ultra plans with server-authoritative entitlements.
- Multi-profile Ultra journals with isolated local history and quick cross-screen profile switching.
- Appointment Workspace with visit planning, discussion guides, per-profile drafts, persistence, and scheduled Web Push reminders.
- Read-only, expiring, revocable caregiver/provider sharing delivered through Resend when email is configured.
- Password reset/change, revocable sessions, Sign out everywhere, device management, and authenticator MFA.
- Stripe checkout/subscriptions/webhooks/billing portal with server-side plan validation.
- Consent-based Web Push reminders and weekly digest infrastructure.
- Grafana Cloud OTLP logs/metrics, readiness checks, and operational alerts.

### Pamet 1.5.1

- Retains the 1.5.0 Insights, Calendar, Visit Brief, design-system, and accessibility improvements.
- Hardens caregiver/provider sharing confirmations, profile-context refresh, and Appointment Workspace persistence/session clarity.
- Improves navigation responsiveness by coalescing broad DOM mutation work into animation-frame batches.
- Improves repeat-load performance with faster service-worker shell caching while keeping navigations network-first.
- Keeps `/api/` and sensitive sharing routes out of service-worker caching.
- Reduces unnecessary PWA precache payload and avoids duplicate service-worker registration/update work.
- Forces readable white text on primary green actions in both light and dark modes, including upgrade/update and first-entry calls to action.
- Adds performance/release regression checks so the navigation, caching, and contrast guarantees remain protected by CI.

## Product Model

**Track → Understand → Prepare**

| Plan | Positioning | Core value |
| --- | --- | --- |
| **Free — Track** | Build a useful health history | Logging, rolling history, summary, export |
| **Pro — Understand** | Make history easier to interpret | Unlimited history, observational trends, comparisons, sharing |
| **Ultra — Prepare** | Prepare for more complex care conversations | Multi-profile, Appointment Workspace, advanced Visit Briefs, advanced coordination |

Pamet contains **no advertising on any plan**.

| Plan | Monthly | Annual |
| --- | ---: | ---: |
| Free | $0 | $0 |
| Pro | $6.99 | $59.99 |
| Ultra | $12.99 | $99.99 |

### Plan feature matrix

This table is the quick-reference view of the current Pamet plan model. **✅** means the feature is included for that plan; **—** means it is not included at that tier. Ultra inherits the included Free and Pro capabilities unless a row is explicitly marked otherwise.

| Feature | Free | Pro | Ultra |
| --- | :---: | :---: | :---: |
| Symptom, medication, mood, activity, lifestyle, and notes logging | ✅ | ✅ | ✅ |
| Calendar and journal-history review | ✅ | ✅ | ✅ |
| 7/30/90-day observational Insights views | ✅ | ✅ | ✅ |
| Standard Visit Brief | ✅ | ✅ | ✅ |
| Dark mode and accessibility-focused UI | ✅ | ✅ | ✅ |
| Account security, password reset/change, session/device management, and authenticator MFA | ✅ | ✅ | ✅ |
| Consent-based Web Push reminders | ✅ | ✅ | ✅ |
| Weekly digest infrastructure when email is configured | ✅ | ✅ | ✅ |
| No advertising | ✅ | ✅ | ✅ |
| Unlimited history entitlement | — | ✅ | ✅ |
| Observational correlations / recorded-factor comparisons | — | ✅ | ✅ |
| What Changed / deeper trend interpretation | — | ✅ | ✅ |
| Medication-timing observations | — | ✅ | ✅ |
| Read-only, expiring, revocable caregiver/provider sharing | — | ✅ | ✅ |
| Appointment Workspace | — | — | ✅ |
| Multiple health profiles | — | — | ✅ |
| Advanced Visit Brief | — | — | ✅ |
| Encrypted multi-device journal sync | — | — | ✅ |

The server-authoritative entitlement API currently enforces Pro/Ultra access for **correlations, unlimited history, and sharing**, and Ultra-only access for **Appointment Workspace, multiple profiles, Advanced Visit Brief, and encrypted sync**. Product copy and future plan changes should keep this README table synchronized with those entitlements.

Paid tiers are offered only when their Stripe configuration passes server-side validation.

## Privacy and Safety Boundaries

- Insights describe recorded associations, frequency, and changes—not diagnoses or causes.
- Medication co-occurrence is not presented as medication effectiveness or adverse-effect evidence.
- No emergency detection or automated symptom escalation.
- No medication recommendations.
- No live caregiver surveillance or missed-log alerts.
- Sharing is explicit, expiring, and revocable.
- Stripe plan state is server verified.
- Service-worker caching excludes `/api/` and sensitive sharing routes.
- Browser update flows do not clear local journal data.
- Appointment reminder notifications intentionally avoid symptom, medication, clinician, or diagnosis details on the lock screen.

## Production Architecture

- Bundled PWA/browser client
- Node.js / Express secure edge and application runtime
- MySQL account/session/entitlement/sharing/appointment/audit/sync metadata
- Stripe subscriptions and webhooks
- Redis/Valkey distributed rate limiting with MySQL fallback
- Resend transactional email
- Web Push / VAPID
- Grafana Cloud OTLP logs and metrics
- GitHub Actions CI, scheduled jobs, and live acceptance checks
- Wasmer deployment from `main`

Journal entries remain local-first by default. Ultra encrypted sync stores opaque ciphertext rather than plaintext journal content.

## Design System

Pamet uses a warm clinical visual system with explicit semantic roles:

- **Teal:** navigation, primary actions, selection, product interaction
- **Neutral:** layout, borders, helper information, structural hierarchy
- **Sage:** favorable/improving health-state presentation where appropriate
- **Amber:** attention or increased-frequency observation states
- **Rose:** significant symptom/severity meaning
- **Purple:** reserved for the separate private Pamet Admin/Superuser environment

The current runtime centralizes common icons and defines metadata, helper, body, control, section-heading, and page-heading type roles.

## Accessibility Status

Pamet includes automated/static accessibility guardrails for keyboard focus visibility, skip navigation, reduced motion, modal behavior, accessible icon semantics, screen labels, and responsive/mobile layouts.

These checks are not an independent accessibility certification. A qualified external WCAG 2.2 AA review, including keyboard-only, screen-reader, 200%/400% zoom/reflow, mobile/landscape, contrast, and error-state testing, remains an explicit assurance gate. See `ACCESSIBILITY_REVIEW.md`.

## Release Gates

Every production merge should pass:

- production bundle build
- syntax/static release checks
- version consistency
- security/UI assertions
- Insights/design-system assertions
- unit/security tests
- MySQL-backed lifecycle integration tests
- Stripe/device/session/sharing/sync assertions
- disposable MySQL backup → isolated restore
- dependency audit
- live Wasmer version/readiness acceptance

Real-provider or independent evidence is still required for provider PITR/RPO/RTO, independent penetration testing, WCAG 2.2 AA review, privacy/legal/BAA-DPA determinations, and final activation review for encrypted working local storage.

## Repository Organization

- `js/` — browser source modules
- `css/` — source stylesheets and design-system layers
- `lib/` — server-side supporting modules
- `db/` — deployable schema
- `scripts/` — production/release checks and operational drills
- `tests/` — unit and integration coverage
- `.github/workflows/` — CI, deployment acceptance, billing reconciliation, reminders, and admin-mirror trigger
- `dist/` — generated production bundles
- `assets/` — application icons and login imagery

Historical filenames that remain imported identify the feature layer where a module originated; they are not separate application versions.

## Operational Documentation

| Document | Purpose |
| --- | --- |
| `PRODUCTION_READINESS.md` | Production configuration and unresolved launch gates |
| `REAL_ENVIRONMENT_ACCEPTANCE.md` | Deployed environment evidence |
| `BACKUP_RESTORE_RUNBOOK.md` | Recovery requirements |
| `ASSURANCE_HANDOFF.md` | External security/privacy/accessibility review handoff |
| `ACCESSIBILITY_REVIEW.md` | External WCAG 2.2 AA review scope and evidence checklist |
| `SECURITY.md` | Security architecture |
| `THREAT_MODEL.md` | General threat model |
| `LOCAL_ENCRYPTION_THREAT_MODEL.md` | Local-journal encryption/recovery design gate |
| `LEGACY_AUTH_SUNSET.md` | Compatibility-auth retirement criteria |
| `INCIDENT_RESPONSE.md` | Security/operations response process |
| `CHANGELOG.md` | Release history |

## Run Locally

Node.js 20+ is required.

```bash
npm install
npm run build
npm start
```

Backend-dependent capabilities require the relevant environment configuration. Never commit secrets; `.env.example` contains placeholders only.

## Product Promise

**Track what you feel. See what changes. Bring the story to your doctor.**
