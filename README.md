# Pamet — Personal Health Journal

**Version 1.3.0 — profile-aware care workspaces and clearer Ultra workflows**  
**Your health history, finally useful.**

Pamet is a privacy-first personal health journal for recording symptoms, medications, mood, activity, lifestyle factors, notes, and other user-provided health information over time, then organizing those observations into a clearer history for personal review and healthcare conversations.

> **Pamet observes. Pamet does not diagnose.**

Pamet is not an emergency-monitoring system, clinical decision tool, diagnostic service, medication-recommendation engine, or replacement for professional medical care.

---

## Current State

Pamet is an actively developed web/PWA product deployed from GitHub `main` to Wasmer. **1.3.0** is a backward-compatible feature release focused on making Ultra profiles, sharing, and appointment preparation usable as complete workflows instead of isolated feature cards.

### Working today

- Local-first symptom, medication, mood, activity, lifestyle, and notes logging.
- Truthful first-use state with no fake/sample health history.
- Calendar/history review and observational Pamet pattern summaries.
- Free / Pro / Ultra plan architecture with server-authoritative entitlements.
- Stripe checkout, subscriptions, webhook idempotency, downgrade enforcement, and billing portal infrastructure.
- Email/password accounts with revocable HttpOnly sessions.
- Password reset/change, legacy-account migration, device/session management, and **Sign out everywhere**.
- Authenticator-app MFA with fresh locally rendered QR setup and verification before activation.
- Privacy-minimal product feedback.
- CSV/JSON export and account deletion.
- Read-only, expiring, revocable caregiver/provider sharing with Resend delivery.
- Ultra multi-profile health histories with explicit active-profile context.
- Ultra appointment preparation with server persistence, local draft fallback, discussion-guide generation, and reminder timing.
- Ultra advanced Visit Brief and health-history comparison surfaces.
- Ultra encrypted-sync infrastructure.
- Consent-based browser/PWA reminders and Web Push infrastructure.
- Grafana Cloud OTLP logs/metrics and dependency readiness checks.
- Responsive phone layouts, safe-area handling, centered security/recovery dialogs, and narrow-screen safeguards.
- CI-backed MySQL lifecycle tests and disposable backup → isolated-restore verification.
- Live `/api/health` and `/api/ready` deployment acceptance checks.

### Release 1.3.0 — profiles, sharing, and appointment preparation

#### Profile-aware Settings

- Adds a clear **Currently viewing** profile card at the top of Settings.
- Shows active profile name, relationship, and entry count before users enter the Profiles dialog.
- Keeps the existing Profiles picker behavior and per-profile local journal separation.
- New profiles are not created until the user reviews and approves a confirmation inside the Profiles dialog.
- Confirmation explains that the current profile session will switch, the Pamet account remains signed in, existing profiles/data are preserved, and the new profile starts with **0 entries**.
- Existing-profile switches also display an in-window confirmation explaining the effect before reload.
- Profile creation/switching persists the current profile before changing context so existing health history is not lost.

#### Advanced sharing

- Keeps Advanced Sharing inside one modal from start through completion.
- Checks Pamet email-delivery configuration before enabling invitation sending.
- Shows send progress, delivery failures, and successful-send confirmation **inside the current sharing window** instead of behind the modal.
- Success state shows recipient, active profile, permission level, and expiration period.
- Supports sending another invitation without leaving the sharing workflow.
- Uses the existing authenticated `/api/sharing/invites` backend, which stores the share, sends the invitation through Resend, and removes the DB record if email delivery fails.
- Production email delivery requires `RESEND_API_KEY` and `EMAIL_FROM`; a verified Resend sender/domain is the recommended production configuration.

#### Appointment Workspace

- Renders the workspace before contacting the server, so an expired server session no longer reduces the experience to an unexplained **Authentication required** toast.
- Adds visit type, clinician/practice, date/time, visit reason, top concerns, questions, and expanded reminder timing choices.
- Builds a live **Discussion guide** from the active profile’s recorded history, recent symptom changes, Pamet patterns, medication information, and recent notes.
- Adds a practical pre-visit checklist.
- Allows a local draft to be saved on the device even if the server session needs reconnection.
- Explains clearly when sign-in is required for server-saved appointments/reminder settings while confirming that local journal data remains safe.
- Filters displayed server appointments to the active profile.
- Uses the existing Ultra-only MySQL appointment APIs for create/list/delete and stores reminder timing with each saved visit.

### Release 1.2.3 — safe update flow

- Adds a visible **New Pamet version available** prompt when the deployed server is newer than the currently loaded browser/PWA bundle.
- Offers **Update now** and **Later** actions.
- Checks for a newer release on app load, when the app returns to the foreground, and every 15 minutes while open.
- Keeps loaded app version separate from server version so a stale client cannot pretend it is current.
- `Update now` asks the service worker to update/activate and reloads with a release-specific cache-buster without clearing local Pamet data.

### Release 1.2.2 — deployment hardening

- Made `package.json` the canonical deployed release source.
- Made the production edge inject the release into the Settings footer.
- Added `X-Pamet-Version` response identity.
- Normalized `/api/health` and `/api/ready` around the same release.
- Fixed Wasmer Anybuild packaging and restored successful production promotion from GitHub `main`.

### Release 1.2.1 — stability/security hardening

- Semantic-version release discipline and automated version consistency checks.
- Centered Account Security and recovery flows.
- Safe account switching and cross-account local-data isolation.
- Legacy-device login migration and global session revocation.
- Local authenticator QR generation and MFA confirmation gating.
- Mobile/safe-area/modal scaling hardening.
- MySQL lifecycle integration coverage and automated backup/restore drill.
- Gated local-journal encryption framework and threat model.

---

## Product Model

**Track → Understand → Prepare**

| Plan | Positioning | Core value |
| --- | --- | --- |
| **Free — Track** | Build a useful health history | Logging, rolling history, summary, export |
| **Pro — Understand** | Make the history easier to interpret | Unlimited history, trends, correlations, What Changed?, sharing |
| **Ultra — Prepare** | Prepare for more complex care conversations | Multi-profile, appointment workspace, advanced Visit Briefs, advanced coordination |

Pamet contains **no advertising on any plan**.

| Plan | Monthly | Annual |
| --- | ---: | ---: |
| Free | $0 | $0 |
| Pro | $6.99 | $59.99 |
| Ultra | $12.99 | $99.99 |

A paid tier is offered only when its Stripe configuration passes server-side validation.

---

## Privacy and Safety Boundaries

- Pamet describes patterns and trends, not diagnoses or causes.
- No emergency detection or automated symptom escalation.
- No live caregiver or missed-log alerts.
- No medication recommendations or definitive interaction advice.
- Sharing is explicit, expiring, revocable coordination—not continuous monitoring.
- Stripe plan state is server verified; the browser cannot grant itself a paid plan.
- Sharing tokens are random, expiring, revocable, and stored as hashes server-side.
- Feedback excludes account and health-entry fields from the feedback record.
- Service-worker caching excludes `/api/` and sensitive sharing routes.
- The update system does not clear browser-local Pamet journal data.
- Profile switching preserves each profile’s journal separately; a newly created profile starts empty.
- Appointment discussion guides organize user-recorded information and do not diagnose or recommend treatment.

### Local journal encryption status

Pamet includes a disabled-by-default implementation framework using per-profile random data-encryption keys, AES-256-GCM, a user-held recovery root key, and HKDF-derived wrapping keys.

**It is intentionally not enabled in production yet.** Activation remains gated on independent security review plus migration, recovery, failure-injection, and lost-key testing.

---

## Production Architecture

- bundled PWA/browser client
- Node.js / Express production runtime
- MySQL account/session/entitlement/sharing/feedback/audit/appointment/sync metadata
- Stripe subscriptions and webhooks
- Redis/Valkey distributed rate limiting with MySQL fallback
- Resend email delivery
- Web Push / VAPID
- Grafana Cloud OTLP logs and metrics
- GitHub Actions CI and live acceptance checks
- Wasmer production deployment from `main`

Journal entries remain local-first by default. Ultra encrypted sync stores opaque ciphertext rather than plaintext journal content.

### Native clients

Dedicated private repositories exist for:

- `Pamet-iOS` — SwiftUI / SwiftData / URLSession
- `Pamet-Android` — Kotlin / Jetpack Compose / Room / OkHttp

This repository remains the backend/API source of truth.

---

## Production Quality Gates

A release should pass:

- production bundle build
- JavaScript syntax/static release checks
- version consistency checks
- security/production assertions
- unit/security/UI tests
- local-crypto framework tests
- dependency audit
- MySQL-backed lifecycle integration tests
- Stripe entitlement/webhook assertions
- device/session/sharing/sync assertions
- disposable MySQL backup → isolated restore
- live Wasmer release/version/readiness acceptance

### What CI does not replace

The following still require real-provider or independent evidence:

1. Provider backup/PITR restore with measured RPO/RTO.
2. Controlled live Stripe checkout/trial/cancellation/payment-failure/reconciliation exercises.
3. Deployed MFA/recovery/device-revocation exercises.
4. Real Web Push permission/delivery/closed-app testing.
5. Encrypted-sync recovery and lost-key exercises.
6. Independent penetration testing.
7. Independent WCAG 2.2 AA/accessibility review.
8. Privacy/legal/vendor/BAA-DPA determination based on actual deployment and intended use.
9. Final review before local working-journal encryption is enabled.
10. Retirement of the remaining legacy bearer compatibility path.
11. Removal of CSP `style-src 'unsafe-inline'` after remaining inline style usage is migrated.
12. End-to-end production verification of appointment reminder delivery beyond stored reminder timing.

---

## Current State vs Future State

| Area | Current state — 1.3.0 | Future state |
| --- | --- | --- |
| Profiles | Active-profile context, confirmed profile switching, isolated journals | Reviewed cross-device profile sync/recovery |
| Appointment preparation | Local draft + server-persisted visits + generated discussion guide | End-to-end scheduled reminder delivery and native parity |
| Sharing | Resend-backed email invitations, in-window delivery confirmation, expiring/revocable links | Additional reviewed care-coordination workflows |
| Release updates | In-app newer-version detection, safe refresh prompt, PWA cache rotation | Native-app update coordination and richer release notes |
| Release identity | Loaded-client version + server `/api/health`/`/api/ready` identity | Exact deployed Git SHA surfaced in ops UI |
| Accounts | Email/password, sessions, reset/change, devices, logout-all | Complete legacy bearer retirement |
| MFA | Authenticator setup with local QR | Independent deployed recovery review |
| Local journal | Local-first browser storage | Reviewed encrypted-at-rest local journal migration |
| Cross-device sync | Ultra opaque encrypted sync | Mature recovery UX and native parity |
| Billing | Server-authoritative Stripe architecture | Full controlled production acceptance evidence |
| Notifications | In-app + Web Push | Cross-browser/device acceptance evidence |
| Observability | Structured logs, metrics, readiness, Grafana | Mature alert thresholds/on-call practice |
| Database recovery | Automated CI logical restore | Provider PITR/restore evidence with RPO/RTO |
| Accessibility | Responsive/mobile safeguards | Independent WCAG 2.2 AA review/retest |
| Security assurance | Automated gates and threat models | Independent penetration test/remediation closure |
| Native apps | Dedicated iOS/Android repositories | Full feature parity and store pipelines |

---

## Versioning

Pamet uses semantic versioning.

- **Patch** (`1.2.2 → 1.2.3`): compatible fixes, security/reliability improvements, or small backward-compatible UX capabilities.
- **Minor** (`1.2.x → 1.3.0`): substantial backward-compatible capability, such as the complete profile/sharing/appointment workspaces in this release.
- **Major** (`1.x → 2.0.0`): intentional breaking migration/API/data-contract change.

The canonical release number lives in `package.json`. See `VERSIONING.md` for release rules.

Historical filenames such as `security-v1.1.0.js` identify the feature layer where a module originated; they do not indicate the current application release.

---

## Repository Documentation

| Document | Purpose |
| --- | --- |
| `CHANGELOG.md` | Release-by-release completed work |
| `VERSIONING.md` | Semantic versioning and release discipline |
| `PRODUCTION_READINESS.md` | Production configuration and unresolved launch gates |
| `REAL_ENVIRONMENT_ACCEPTANCE.md` | Live deployment acceptance evidence |
| `BACKUP_RESTORE_RUNBOOK.md` | Provider recovery evidence requirements |
| `ASSURANCE_HANDOFF.md` | External security/privacy/accessibility review package |
| `SECURITY.md` | Security architecture |
| `THREAT_MODEL.md` | General threat model |
| `LOCAL_ENCRYPTION_THREAT_MODEL.md` | Local journal encryption/recovery threats |
| `LOCAL_ENCRYPTION_IMPLEMENTATION_PLAN.md` | Gated encryption migration plan |
| `LEGACY_AUTH_SUNSET.md` | Compatibility-auth retirement criteria |
| `INCIDENT_RESPONSE.md` | Security/operations response procedure |

---

## Run Locally

Node.js 20+ is required for the full application.

```bash
npm install
npm run build
npm start
```

Backend-dependent capabilities require the appropriate environment configuration. Never commit secrets; `.env.example` contains placeholders only.

---

## Release History

- **1.3.0** — profile-aware Settings, confirmed profile switching, in-window sharing delivery UX, and rebuilt Appointment Workspace/discussion guide.
- **1.2.3** — safe new-version notification/refresh flow and PWA update recovery.
- **1.2.2** — Wasmer deployment synchronization, server-authoritative release identity, cache/build hardening.
- **1.2.1** — stability, version discipline, security/mobile/PWA hardening.
- **1.2.0** — cross-device account architecture, password reset, production architecture, observability.
- **1.1.0** — device revocation, MFA, Web Push, encrypted Ultra sync, distributed limits.
- **1.0.5** — dark-mode and authentication-brand refinements.
- **1.0.4** — production runtime consolidation and entitlement hardening.
- **1.0.3** — truthful empty state, Pamet pattern language, privacy-minimal feedback.
- **1.0.2** — Warm Clinical Minimalism, Pro/Ultra architecture, sharing/email/Stripe foundations.

---

## Product Promise

**Track what you feel. See what changes. Bring the story to your doctor.**

Pamet's goal is not to replace clinical care. It is to make the history between appointments easier to capture, understand, and communicate.
