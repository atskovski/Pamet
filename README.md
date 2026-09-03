# Pamet — Personal Health Journal

**Version 1.2.2 — deployment synchronization, server-authoritative release identity, and production acceptance hardening**  
**Your health history, finally useful.**

Pamet is a privacy-first personal health journal for recording symptoms, medications, lifestyle factors, and user-provided health information over time, then organizing those observations into a clearer history for personal review and healthcare conversations.

> **Pamet observes. Pamet does not diagnose.**

Pamet is not an emergency-monitoring system, clinical decision tool, diagnostic service, medication-recommendation engine, or replacement for professional medical care.

---

## Current State

Pamet is an actively developed web/PWA product deployed from GitHub `main` to Wasmer. Version 1.2.2 is a patch stabilization release focused on making the deployed release identity and production asset path deterministic, while continuing the 1.2.1 security/mobile hardening work.

### Working today

- Local-first symptom, medication, mood, activity, lifestyle, and notes logging.
- Truthful first-use state with no fake/sample health history.
- Calendar/history review and observational pattern summaries.
- Free / Pro / Ultra plan architecture with server-authoritative entitlements.
- Stripe checkout, subscription state, webhook idempotency, downgrade enforcement, and billing portal infrastructure.
- Email/password accounts with server-side password verifiers and revocable HttpOnly sessions.
- Password reset, password change, legacy-account migration, device/session management, and **Sign out everywhere**.
- Authenticator-app MFA with fresh, locally rendered QR setup and confirmation before activation.
- Privacy-minimal product feedback.
- Data export and account deletion.
- Read-only, expiring, revocable sharing for caregiver/provider coordination.
- Ultra appointment preparation and encrypted-sync infrastructure.
- Consent-based browser/PWA reminders and Web Push infrastructure.
- Grafana Cloud OTLP logs/metrics integration and dependency readiness checks.
- Responsive phone layouts, safe-area handling, centered security/recovery dialogs, and narrow-screen safeguards.
- CI-backed MySQL lifecycle tests and disposable backup → isolated-restore verification.
- Real-environment acceptance checklist and non-destructive deployed health/readiness/billing/auth-boundary checks.

### Release 1.2.2 stabilization work

- Makes `package.json` 1.2.2 the canonical release source.
- Serves the primary application document through the production edge and injects the current release into the Settings footer.
- Adds the `X-Pamet-Version` response header for direct deployed-release verification.
- Normalizes `/api/health` and `/api/ready` to the same release version.
- Rewrites JS/CSS cache-buster query strings from the current release at the server edge.
- Refreshes the PWA service-worker cache generation to 1.2.2 and requests fresh network content for shell updates.
- Keeps production startup rebuilding the browser bundles before serving traffic.
- Moves `esbuild` into production dependencies so a deployment that omits devDependencies can still complete the startup build.
- Preserves the 1.2.1 runtime reconciliation logic so the browser footer also confirms the server-reported version.
- Strengthens release checks to fail if the server-rendered footer/version path or production build dependency is removed.

### Release 1.2.1 stabilization work

- Normalized release versioning around semantic versioning.
- Made the production edge report the canonical `package.json` version through `/api/health`.
- Added browser-level release identity for visible version text and feedback metadata.
- Moved PWA service-worker registration into the external production bundle so CSP hardening does not silently disable registration.
- Added a release-version consistency gate to CI.
- Preserved the 1.2.0 security hardening work: centered Account Security, safe account switching, legacy-login migration, logout-all, local authenticator QR generation, feedback confirmation, and mobile scaling.

---

## Product Model

Pamet follows a simple product progression:

**Track → Understand → Prepare**

| Plan | Positioning | Core value |
| --- | --- | --- |
| **Free — Track** | Build a useful health history | Logging, rolling history, summary, export |
| **Pro — Understand** | Make the history easier to interpret | Unlimited history, trends, correlations, What Changed?, sharing |
| **Ultra — Prepare** | Prepare for more complex care conversations | Multi-profile, appointment workspace, advanced Visit Briefs, advanced coordination |

Pamet contains **no advertising on any plan**.

Current approved pricing:

| Plan | Monthly | Annual |
| --- | ---: | ---: |
| Free | $0 | $0 |
| Pro | $6.99 | $59.99 |
| Ultra | $12.99 | $99.99 |

A paid tier is offered only when its Stripe price configuration passes server-side catalog validation.

---

## Privacy and Safety Boundaries

Pamet is intentionally conservative about health claims and data handling.

- Observations are described as patterns, trends, and relationships—not diagnoses or causes.
- Pamet does not provide emergency detection or automated symptom escalation.
- Pamet does not provide live caregiver alerts or missed-log alerts.
- Pamet does not provide medication recommendations or definitive drug-interaction advice.
- Caregiver/provider sharing is explicit, revocable coordination—not continuous monitoring.
- Primary-care sharing is a read-only Visit Brief link, not a live clinician portal.
- Stripe plan state is server verified; the browser cannot grant itself a paid plan.
- Sharing tokens are random, expiring, revocable, and stored as hashes server-side.
- Feedback intentionally excludes user IDs, email addresses, health entries, symptoms, medications, notes, and IP-address fields from the feedback table.
- Service-worker caching excludes `/api/` and sensitive sharing paths.

### Local journal encryption status

Pamet has a reviewed-design implementation framework for local journal encryption using per-profile random data-encryption keys, AES-256-GCM, a user-held recovery root key, and HKDF-derived wrapping keys.

**It is intentionally not enabled in production yet.** Activation remains gated on independent security review plus migration, recovery, and lost-key testing. Pamet should not claim full local/E2E journal encryption until that gate is complete.

See:

- `LOCAL_ENCRYPTION_THREAT_MODEL.md`
- `LOCAL_ENCRYPTION_IMPLEMENTATION_PLAN.md`
- `SECURITY.md`
- `THREAT_MODEL.md`

---

## Production Architecture

The production web application uses:

- bundled PWA/browser client
- Node.js / Express production runtime
- MySQL account, session, entitlement, sharing, feedback, audit, appointment, and sync metadata
- Stripe subscriptions and webhooks
- Redis/Valkey distributed rate limiting when configured, with atomic MySQL fallback
- Resend email delivery
- Web Push / VAPID
- Grafana Cloud OTLP logs and metrics
- GitHub Actions CI and scheduled jobs

Journal entries remain local-first by default. Server storage is used only where the feature requires a server-side capability. Ultra encrypted sync stores opaque ciphertext rather than plaintext journal content.

### Native clients

Pamet also has private native-client repositories:

- `Pamet-iOS` — SwiftUI / SwiftData / URLSession
- `Pamet-Android` — Kotlin / Jetpack Compose / Room / OkHttp

This repository remains the backend/API source of truth. The versioned mobile API contract is synchronized into the native repositories.

---

## Production Quality Gates

A release must pass the following before merge:

- production bundle build
- JavaScript syntax/static release checks
- server-rendered release/version assertions
- security/production assertions
- unit/security tests
- UI-hardening regression tests
- local-crypto framework tests
- dependency audit
- MySQL-backed integration lifecycle tests
- Stripe entitlement/webhook integration assertions
- device/session/sharing/sync integration assertions
- disposable MySQL backup → separate-schema restore drill

Version 1.2.2 additionally requires proof that the production edge owns the rendered Settings version and that startup build tooling is available from production dependencies.

### What CI proves

CI can prove the repository behaves correctly in a controlled test environment, including account lifecycle, session revocation, legacy migration, Stripe event handling, sharing revocation, encrypted-sync conflicts, database backup/restore integrity, release version consistency, and successful production bundle generation.

### What CI cannot prove

CI does **not** replace production-provider or independent external evidence. The following remain separate launch/assurance gates:

1. Confirm Wasmer deploys the current GitHub `main` head and re-run the live acceptance checker after every release.
2. Real Wasmer/database-provider backup or point-in-time restore with measured RPO/RTO.
3. Controlled deployed Stripe acceptance, including checkout, trial, cancellation, failed-payment, and reconciliation paths.
4. Deployed MFA/recovery/device-revocation exercises.
5. Deployed Web Push permission/delivery/closed-app testing.
6. Deployed encrypted-sync/key-recovery/lost-key exercises.
7. Independent penetration testing.
8. Independent WCAG 2.2 AA / screen-reader / keyboard / reflow review.
9. Privacy/legal review of the deployed data flows, health-related claims, sharing model, and vendor agreements.
10. Final review and staged migration before local journal encryption is enabled.
11. Removal of the remaining legacy bearer compatibility path after measured migration/sunset criteria are satisfied.
12. Removal of CSP `style-src 'unsafe-inline'` after remaining inline style usage is migrated.

These gates are tracked in `PRODUCTION_READINESS.md`, `STAGING_ACCEPTANCE.md`, `REAL_ENVIRONMENT_ACCEPTANCE.md`, `ASSURANCE_HANDOFF.md`, `BACKUP_RESTORE_RUNBOOK.md`, and `LEGACY_AUTH_SUNSET.md`.

---

## Current State vs Future State

| Area | Current state — 1.2.2 | Future state |
| --- | --- | --- |
| Release identity | Server-authoritative health/readiness/footer path with cache-busted assets | Provider deploy automation that proves the exact `main` revision promoted |
| Accounts | Email/password, HttpOnly sessions, reset/change, device/session controls | Complete legacy bearer retirement |
| MFA | Authenticator-app setup with local QR and recovery flow | Independent deployed recovery review |
| Local journal | Local-first browser storage | Reviewed encrypted-at-rest local journal migration |
| Cross-device sync | Ultra browser-encrypted opaque sync | Mature recovery UX and native-client parity |
| Sharing | Explicit read-only expiring/revocable links | Additional reviewed care-coordination workflows without live monitoring |
| Billing | Server-authoritative Stripe architecture | Full controlled production acceptance evidence |
| Notifications | In-app + Web Push architecture | Cross-browser/device production acceptance evidence |
| Observability | Structured logs, metrics, readiness, Grafana OTLP | Mature alert thresholds/on-call operating practice |
| Database recovery | Automated logical backup/isolated restore in CI | Provider PITR/restore evidence with measured RPO/RTO |
| Accessibility | Responsive/mobile safeguards and contrast work | Independent WCAG 2.2 AA certification-style review/retest evidence |
| Security assurance | Automated security gates and threat models | Independent penetration test and remediation closure |
| Compliance posture | Conservative product/data boundaries | Qualified legal/privacy determination based on actual deployment/use case |
| Native apps | API contract and dedicated iOS/Android repos | Full native feature parity and store-release pipelines |

---

## Versioning

Pamet uses semantic versioning.

- `1.2.1 → 1.2.2`: compatible deployment/release fixes, cache/version hardening, and production acceptance improvements.
- `1.2.x → 1.3.0`: substantial backward-compatible capability.
- `1.x → 2.0.0`: intentionally breaking migration.

The canonical release number lives in `package.json`. See `VERSIONING.md` for the release checklist and rules.

Historical filenames such as `security-v1.1.0.js` identify the feature layer where a module originated; they do not indicate the current application release.

---

## Repository Documentation

| Document | Purpose |
| --- | --- |
| `CHANGELOG.md` | Release-by-release work completed |
| `VERSIONING.md` | Semantic versioning and release discipline |
| `PRODUCTION_READINESS.md` | Production configuration and unresolved launch gates |
| `STAGING_ACCEPTANCE.md` | Real-environment acceptance exercises |
| `REAL_ENVIRONMENT_ACCEPTANCE.md` | Non-destructive live checks plus post-deploy evidence ledger |
| `BACKUP_RESTORE_RUNBOOK.md` | Provider recovery exercise and evidence requirements |
| `ASSURANCE_HANDOFF.md` | External security/privacy/accessibility review package |
| `SECURITY.md` | Security architecture and reporting expectations |
| `THREAT_MODEL.md` | General threat model |
| `LOCAL_ENCRYPTION_THREAT_MODEL.md` | Local journal encryption key/recovery threats |
| `LOCAL_ENCRYPTION_IMPLEMENTATION_PLAN.md` | Gated local encryption implementation/migration plan |
| `LEGACY_AUTH_SUNSET.md` | Retirement criteria for compatibility credentials |
| `INCIDENT_RESPONSE.md` | Security/operations response procedure |

---

## Run Locally

Node.js 20+ is required for the full application.

```bash
npm install
npm run build
npm start
```

Core local-first UI development can also be served statically, but backend-dependent capabilities such as account sessions, billing, sharing, email, recovery, and encrypted sync require the Node/MySQL runtime and the appropriate environment configuration.

Never commit secrets. Use deployment environment variables; `.env.example` contains placeholders only.

---

## Release History

The detailed release record is maintained in `CHANGELOG.md`.

Major milestones:

- **1.2.2** — deployment/version synchronization hardening, server-rendered Settings release identity, production build dependency fix, live acceptance expansion.
- **1.2.1** — stability, version discipline, PWA/CSP compatibility, current-state documentation.
- **1.2.0** — cross-device account architecture, password reset, production deployment architecture, Grafana telemetry, Wasmer/MySQL hardening.
- **1.1.0** — device revocation, MFA, Web Push, encrypted Ultra sync, distributed rate limiting, observability frameworks.
- **1.0.5** — dark-mode and authentication-brand refinements.
- **1.0.4** — production runtime consolidation, entitlement hardening, advanced plan capabilities.
- **1.0.3** — truthful empty state, Pamet pattern language, privacy-minimal feedback.
- **1.0.2** — Warm Clinical Minimalism, Pro/Ultra product architecture, sharing/email/Stripe foundations.

---

## Product Promise

**Track what you feel. See what changes. Bring the story to your doctor.**

Pamet's goal is not to replace clinical care. It is to make the history between appointments easier to capture, understand, and communicate.
