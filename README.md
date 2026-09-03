# Pamet — Personal Health Journal

**Version 1.4.0**  
**Your health history, finally useful.**

Pamet is a privacy-first personal health journal for recording symptoms, medications, mood, activity, lifestyle factors, notes, and other user-provided health information over time, then organizing those observations for personal review and healthcare conversations.

> **Pamet observes. Pamet does not diagnose.**

Pamet is not emergency monitoring, a diagnostic service, a clinical decision tool, or a replacement for professional medical care.

## Current State

Pamet is an actively developed web/PWA product deployed from GitHub `main` to Wasmer.

### Core product

- Local-first health journal with truthful empty states and no sample health data.
- Calendar/history review with explicit distinction between **no entry** and **no symptoms recorded**.
- Pamet observational patterns with data-readiness guidance instead of forcing conclusions from sparse data.
- Free / Pro / Ultra plans with server-authoritative entitlements.
- Multi-profile Ultra journals with isolated local history and quick cross-screen profile switching.
- Appointment Workspace with visit planning, discussion guides, per-profile drafts, and server persistence.
- Scheduled appointment Web Push reminders using the reminder timing selected in Appointment Workspace.
- Read-only, expiring, revocable caregiver/provider sharing delivered through Resend when email is configured.
- Password reset/change, revocable sessions, Sign out everywhere, device management, and authenticator MFA.
- Stripe checkout/subscriptions/webhooks/billing portal with server-side plan validation.
- Consent-based daily Web Push reminders and weekly digest infrastructure.
- Grafana Cloud OTLP logs/metrics, readiness checks, and operational alerts.

### Pamet 1.4.0

- Adds a top-bar profile icon when multiple profiles exist so users can switch from any primary app screen.
- Rebuilds the Insights/Patterns introduction around **Pattern readiness**: baseline started, early comparison, developing observations, and supported observations.
- Adds clearer pattern coaching about logging ordinary days as well as symptom days.
- Corrects Calendar semantics: an unlogged day now says **No entry recorded for this day**, not “No symptoms logged.”
- Expands the Calendar legend and accessible day labels.
- Adds scheduled appointment reminder delivery every 15 minutes through user-approved Web Push subscriptions.
- Uses an appointment-specific notification tag and audit-log deduplication so scheduled jobs do not intentionally resend the same reminder.
- Keeps reminder notification copy privacy-minimal; detailed visit content remains inside Pamet.
- Cleans verified-dead release artifacts and replaces release-numbered update files with stable `version-update.js` / `version-update.css` entry points.

## Product Model

**Track → Understand → Prepare**

| Plan | Positioning | Core value |
| --- | --- | --- |
| **Free — Track** | Build a useful health history | Logging, rolling history, summary, export |
| **Pro — Understand** | Make history easier to interpret | Unlimited history, trends, correlations, What Changed?, sharing |
| **Ultra — Prepare** | Prepare for more complex care conversations | Multi-profile, Appointment Workspace, advanced Visit Briefs, advanced coordination |

Pamet contains **no advertising on any plan**.

| Plan | Monthly | Annual |
| --- | ---: | ---: |
| Free | $0 | $0 |
| Pro | $6.99 | $59.99 |
| Ultra | $12.99 | $99.99 |

Paid tiers are offered only when their Stripe configuration passes server-side validation.

## Privacy and Safety Boundaries

- Patterns describe recorded associations and changes, not diagnoses or causes.
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

## Release Gates

Every production merge should pass:

- production bundle build
- syntax/static release checks
- version consistency
- security/UI assertions
- unit/security tests
- MySQL-backed lifecycle integration tests
- Stripe/device/session/sharing/sync assertions
- disposable MySQL backup → isolated restore
- dependency audit
- live Wasmer version/readiness acceptance

Real-provider or independent evidence is still required for provider PITR/RPO/RTO, independent penetration testing, WCAG 2.2 AA review, privacy/legal/BAA-DPA determinations, and final activation review for encrypted working local storage.

## Repository Organization

The runtime source is intentionally small and explicit:

- `js/` — browser source modules
- `css/` — source stylesheets
- `lib/` — server-side supporting modules
- `db/` — deployable schema
- `scripts/` — production/release checks and operational drills
- `tests/` — unit and integration coverage
- `.github/workflows/` — CI, deployment acceptance, billing reconciliation, reminders, and admin-mirror trigger
- `dist/` — generated production bundles
- `assets/` — application icons and login imagery

Historical filenames that remain imported identify the feature layer where a module originated; they are not separate application versions. Verified-dead duplicate files should be removed rather than retained for nostalgia.

## Operational Documentation

| Document | Purpose |
| --- | --- |
| `PRODUCTION_READINESS.md` | Production configuration and unresolved launch gates |
| `REAL_ENVIRONMENT_ACCEPTANCE.md` | Deployed environment evidence |
| `BACKUP_RESTORE_RUNBOOK.md` | Recovery requirements |
| `ASSURANCE_HANDOFF.md` | External security/privacy/accessibility review handoff |
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
