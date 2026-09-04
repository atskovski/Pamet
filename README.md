# Pamet — Personal Health Journal

**Version 1.6.2**  
**Your health history, finally useful.**

Pamet is a privacy-first personal health journal for recording symptoms, medications, mood, activity, lifestyle factors, notes, and other user-provided health information over time, then organizing those observations for personal review and healthcare conversations.

> **Pamet observes. Pamet does not diagnose.**

Pamet is not emergency monitoring, a diagnostic service, a clinical decision tool, or a replacement for professional medical care.

## Current State

Pamet is an actively developed web/PWA product deployed from GitHub `main` to Wasmer. The production repository also owns the mobile API/entitlement contract used by the native iOS and Android release baselines.

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
- In-app privacy/safety/support guidance with troubleshooting steps and explicit medical-use boundaries.

### Pamet 1.6.2

- Promotes the refreshed Pamet green/teal/blue app mark across in-app branding and PWA install assets, including 192 px, 512 px, and maskable icons.
- Adds the production quick profile-switch shortcut to the top app bar and keeps the active profile context visible across the experience.
- Normalizes Settings and care workflow labels to sentence case for a more consistent UI writing system.
- Expands **Health history over time** with 30/90/180-day comparisons, normalized symptom-frequency comparisons, severity/sleep/stress/activity measures, data-strength guidance, and user-entered-data context.
- Adds print/save-to-PDF output for health-history comparisons and local PDF sharing for caregiver and primary-care summaries when outbound email is not configured.
- Consolidates Primary care access around one advanced visit-brief flow rather than competing popups.
- Improves Appointment Workspace responsive behavior to reduce overlapping, clipped, or cramped content on desktop and mobile.
- Rotates the worker registration to `sw.js?v=1620`, the shell cache to `pamet-shell-v162-1`, and static shell asset URLs to the 1.6.2 token so installed PWAs request the new release assets.
- Publishes backend contract identity `1.6.2` while retaining `1.5.1` as the minimum compatible native backend baseline.

### Pamet 1.6.1

- Corrects the 1.6.0 PWA delivery issue that could leave an already-open browser on the previous cached CSS/JavaScript shell after visual changes were merged.
- Rotates the worker registration to `sw.js?v=1610`, the shell cache to `pamet-shell-v161-1`, and static bundle URLs to the 1.6.1 asset token so browsers are forced onto the current release assets.
- Promotes the unified dark-mode palette across Insights cards, Data Completeness, empty states, forms, chips, progress meters, links, and common elevated surfaces so dark mode no longer mixes near-black pages with pure-white cards.
- Uses near-white primary text, higher-contrast secondary text, visible teal meter fills, and lower-weight inactive controls for clearer hierarchy in dark mode.
- Updates Privacy, Safety & Support and Settings release surfaces to the current 1.6.1 runtime identity and adds release checks that prevent those surfaces from silently falling behind again.
- Keeps the 1.6.0 strict CSP and feature-owned frontend architecture unchanged.
- Publishes backend contract identity `1.6.1` while retaining `1.5.1` as the minimum compatible native backend baseline.
- Keeps external go-live assurance gates visibly open until real evidence exists.

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
- Pamet does **not** claim HIPAA compliance, SOC 2 certification, independent penetration testing, independent WCAG certification, or independently reviewed local/E2E encryption until the corresponding external evidence is complete.

## Production Architecture

- Static PWA frontend authored in vanilla JavaScript/CSS and bundled/minified with esbuild
- Feature-owned browser modules with release history maintained in Git/CHANGELOG rather than filenames
- Strict production CSP with external/self styles and `style-src-attr 'none'`
- Node.js 20+ / Express 5 secure edge and application runtime
- `secure-server.js` as the production entrypoint around `server.js`
- MySQL via `mysql2` for account/session/entitlement/sharing/appointment/audit/sync metadata
- Optional Redis/Valkey distributed rate limiting with MySQL fallback
- Stripe subscriptions and idempotent webhooks
- Resend transactional email
- Web Push / VAPID
- Grafana Cloud OTLP logs and metrics
- GitHub Actions CI, scheduled jobs, live acceptance, billing reconciliation, reminders, and native-release coordination
- Wasmer deployment from `main` at `pamet.wasmer.app`

Journal entries remain local-first by default. Ultra encrypted sync stores opaque ciphertext rather than plaintext journal content. Encrypted sync is not the same as encrypted working local storage.

## Native Release Coordination

- Production owns `contracts/mobile-api.json` as the backend/mobile compatibility contract.
- `Pamet-iOS` and `Pamet-Android` validate that contract and the live production health endpoint on scheduled/manual checks.
- When the optional GitHub Actions secret `MOBILE_SYNC_TOKEN` is configured with minimal cross-repository permissions, production `main` changes can dispatch immediate native release checks.
- Native clients do not copy web JS/CSS automatically; backend/entitlement changes synchronize by contract, while product/safety behavior is implemented natively and independently tested.
- Pamet 1.6.2 keeps the minimum compatible backend at 1.5.1 because the mobile API contract remains compatible; native binary versions can advance on their own store-release cadence.
- A mobile contract update is not release-ready until the relevant native tests, lint/static analysis, and release compilation/build pass.

See `MOBILE_RELEASE_COORDINATION.md` for the synchronization model and platform release gates.

## Design System

Pamet uses a warm clinical visual system with explicit semantic roles:

- **Teal:** navigation, primary actions, selection, product interaction
- **Neutral:** layout, borders, helper information, structural hierarchy
- **Sage:** favorable/improving health-state presentation where appropriate
- **Amber:** attention or increased-frequency observation states
- **Rose:** significant symptom/severity meaning
- **Purple:** reserved for the separate private Pamet Admin/Superuser environment

The current runtime centralizes common icons and defines metadata, helper, body, control, section-heading, and page-heading type roles. In dark mode, the same semantic roles are mapped onto a unified near-black/surface/elevated-surface system with accessible foreground contrast instead of inserting light cards into the dark shell.

## Accessibility Status

Pamet includes automated/static accessibility guardrails for keyboard focus visibility, skip navigation, reduced motion, modal behavior, accessible icon semantics, screen labels, and responsive/mobile layouts.

These checks are not an independent accessibility certification. A qualified external WCAG 2.2 AA review, including keyboard-only, screen-reader, 200%/400% zoom/reflow, mobile/landscape, contrast, and error-state testing, remains an explicit assurance gate. See `ACCESSIBILITY_REVIEW.md`.

## Release Gates

Every production merge should pass:

- production bundle build
- strict-CSP output checks
- syntax/static release checks
- version consistency
- release-specific PWA worker/cache rotation
- dark-mode surface/contrast checks
- feature-module ownership checks
- security/UI assertions
- Insights/design-system assertions
- unit/security tests
- MySQL-backed lifecycle integration tests
- Stripe/device/session/sharing/sync assertions
- disposable MySQL backup → isolated restore
- dependency audit
- mobile contract validation
- live Wasmer version/readiness acceptance when the environment is available

Real-provider or independent evidence is still required for provider PITR/RPO/RTO, production Stripe live-mode acceptance, independent penetration testing, WCAG 2.2 AA review, privacy/legal/BAA-DPA determinations, and final activation review for encrypted working local storage.

See `GO_LIVE_STATUS.md` for a concise evidence-based status table. Earlier snapshots that say GitHub Actions CI is missing are stale; CI is present in `.github/workflows/ci.yml`.

## Repository Organization

- `js/` — feature-owned browser source modules
- `css/` — feature-owned source stylesheets and design-system layers
- `lib/` — server-side supporting modules
- `db/` — deployable schema
- `scripts/` — production/release checks and operational drills
- `tests/` — unit and integration coverage
- `.github/workflows/` — CI, deployment acceptance, billing reconciliation, reminders, admin-mirror trigger, and mobile release coordination
- `dist/` — generated production bundles
- `assets/` — application icons and login imagery
- `contracts/` — authoritative mobile/backend compatibility contracts

Release history belongs in `CHANGELOG.md` and Git. Active source modules are named for the feature or responsibility they own rather than the release in which they were introduced. The broader `server.js` decomposition remains a controlled follow-up: route/service extraction should occur in bounded, independently tested slices rather than a single high-risk rewrite.

## Operational Documentation

| Document | Purpose |
| --- | --- |
| `GO_LIVE_STATUS.md` | Evidence-based go-live dashboard and remaining external gates |
| `PRODUCTION_READINESS.md` | Production configuration and unresolved launch gates |
| `REAL_ENVIRONMENT_ACCEPTANCE.md` | Deployed environment evidence |
| `BACKUP_RESTORE_RUNBOOK.md` | Recovery requirements |
| `ASSURANCE_HANDOFF.md` | External security/privacy/accessibility review handoff |
| `ACCESSIBILITY_REVIEW.md` | External WCAG 2.2 AA review scope and evidence checklist |
| `SECURITY.md` | Security architecture |
| `THREAT_MODEL.md` | Current general browser/data threat model |
| `LOCAL_ENCRYPTION_THREAT_MODEL.md` | Local-journal encryption/recovery design gate |
| `LEGACY_AUTH_SUNSET.md` | Compatibility-auth retirement criteria |
| `INCIDENT_RESPONSE.md` | Security/operations response process |
| `MOBILE_RELEASE_COORDINATION.md` | Production → iOS/Android synchronization and release gates |
| `PERFORMANCE_AUDIT.md` | Current performance findings, budgets, and follow-up work |
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
