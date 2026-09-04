# Pamet — Personal Health Journal

**Version 1.6.4**  
**Your health history, finally useful.**

Pamet is a privacy-first personal health journal for recording symptoms, medications, mood, activity, lifestyle factors, notes, and other user-provided health information over time, then organizing those observations for personal review and healthcare conversations.

> **Pamet observes. Pamet does not diagnose.**

Pamet is not emergency monitoring, a diagnostic service, a clinical decision tool, or a replacement for professional medical care.

## Current State

Pamet is an actively developed web/PWA deployed from GitHub `main` to Wasmer. The production repository also owns the mobile API and entitlement contract used by the native iOS and Android clients.

### Pamet 1.6.4

This production-hardening release focuses on consistency, scale, release assurance, and clearer Settings behavior:

- one canonical Free / Pro / Ultra plan catalog drives the in-app full feature matrix and the README matrix;
- **Compare Pamet plans** includes a responsive green action that opens the complete plan comparison;
- CI rejects drift between plan display metadata, mobile entitlements, and server-authoritative capability rules;
- Notification health now visibly checks browser permission and active push-subscription state, explains what it checks, and provides state-specific repair guidance;
- scheduled GitHub jobs retain strict OIDC signature/claim validation and can use an automatically refreshed bundled set of GitHub public signing keys when the production provider cannot reach GitHub JWKS directly;
- scale-oriented MySQL indexes support scheduled digest, push, appointment, and audit access patterns;
- database-capacity and production-bundle performance budgets are release gates;
- go-live status separates shipped code, environment acceptance, and independent assurance instead of treating all green CI as external certification.

Release history belongs in [`CHANGELOG.md`](CHANGELOG.md).

## Product Model

**Track → Understand → Prepare**

| Plan | Positioning | Core value |
| --- | --- | --- |
| **Free — Track** | Build a useful health history | Logging, history, Insights, standard Visit Brief, export |
| **Pro — Understand** | Make history easier to interpret | Unlimited history, observational comparisons, deeper trends, sharing |
| **Ultra — Prepare** | Prepare for more complex care conversations | Multi-profile, Appointment Workspace, advanced Visit Briefs, encrypted sync |

Pamet contains **no advertising on any plan**. Paid access is enforced by server-verified account and Stripe state; UI copy is not an authorization boundary.

<!-- PLAN_MATRIX:START -->
### Plan feature matrix

This matrix is generated from `contracts/plan-features.json`, the source of truth used by the in-app **Compare Pamet plans** experience. Update the contract, run `node scripts/sync-plan-catalog.js`, and CI will reject drift between product copy and the application.

| Plan | Monthly | Annual |
| --- | ---: | ---: |
| Free | $0 | $0 |
| Pro | $6.99 | $59.99 |
| Ultra | $12.99 | $99.99 |

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

The server-authoritative entitlement API remains the enforcement boundary for paid capabilities; the matrix is product/display metadata, not an authorization mechanism.
<!-- PLAN_MATRIX:END -->

Paid tiers are offered only when their Stripe catalog configuration passes server-side validation.

## Core Product

- Local-first health journal with truthful empty states and no sample health data.
- Calendar and journal-history review with explicit distinction between **no entry** and **no symptoms recorded**.
- Observational Insights with 7/30/90-day windows, filters, evidence expansion, trend direction, and data-completeness guidance.
- Standard and advanced Visit Brief flows for patient-generated summaries intended to support healthcare conversations.
- Health-history comparison and appointment-preparation tools with explicit non-diagnostic wording.
- Local print/save-to-PDF output for applicable history, caregiver, and primary-care summaries.
- Multi-profile Ultra journals with isolated local history and quick profile switching.
- Appointment Workspace with visit planning, questions, drafts, and privacy-preserving reminders.
- Read-only, expiring, revocable caregiver/provider sharing.
- Password reset/change, revocable sessions, device management, Sign out everywhere, and authenticator MFA.
- Stripe checkout/subscriptions/webhooks/billing portal with server-side plan validation.
- Consent-based Web Push reminders and weekly digest infrastructure.
- Grafana Cloud OTLP logs/metrics, readiness checks, operational alerts, and request telemetry.

## Privacy and Safety Boundaries

- Insights describe recorded associations, frequency, and changes—not diagnoses or causes.
- Medication co-occurrence is not presented as treatment effectiveness or adverse-effect evidence.
- No emergency detection or automated symptom escalation.
- No medication recommendations.
- No live caregiver surveillance or missed-log alerts.
- Sharing is explicit, expiring, and revocable.
- Stripe plan state is server verified.
- Service-worker caching excludes `/api/` and sensitive sharing routes.
- Browser update flows do not clear local journal data.
- Appointment reminder notifications intentionally avoid symptom, medication, clinician, or diagnosis details on the lock screen.
- Pamet does **not** claim HIPAA compliance, SOC 2 certification, independent penetration testing, independent WCAG certification, or independently reviewed working-journal encryption until corresponding external evidence exists.

## Production Architecture

- Static PWA frontend authored in vanilla JavaScript/CSS and bundled/minified with esbuild.
- Feature-owned browser modules; release history is maintained in Git and `CHANGELOG.md` rather than release-numbered source filenames.
- Strict production CSP with external/self styles, `script-src-attr 'none'`, and `style-src-attr 'none'`.
- Node.js 20+ / Express 5 secure edge and application runtime.
- MySQL via `mysql2` for accounts, sessions, entitlements, sharing, appointments, audit data, push metadata, and encrypted-sync blobs.
- Optional Redis/Valkey distributed rate limiting with MySQL fallback.
- Stripe subscriptions and signed/idempotent webhooks.
- Resend transactional email and VAPID Web Push.
- GitHub Actions for CI, scheduled jobs, live acceptance, billing reconciliation, reminders, admin-mirror parity, and native-release coordination.
- Wasmer production deployment at `pamet.wasmer.app`.

Journal entries remain local-first by default. Ultra encrypted sync stores opaque ciphertext rather than plaintext working-journal content. Encrypted sync is not the same as encrypted working local storage.

## Scale and Capacity

Pamet does not impose an application-level maximum account count. User IDs are `BIGINT UNSIGNED`; practical capacity is determined by the deployed application-instance count, MySQL connection/IO/storage capacity, provider limits, and traffic shape rather than by a fixed signup ceiling.

The production design uses bounded MySQL pools, cursor-batched background work, bounded appointment processing, indexed scheduled-job access paths, distributed rate limiting where configured, and horizontally deployable stateless HTTP application instances. The default theoretical database pool budget is currently **14 connections per application instance** across the primary, OAuth, scheduled-job, and appointment-reminder pools.

Before increasing application replicas or connection-pool limits, size against the database provider's real `max_connections` with operational reserve. A safe deployment budget is:

`usable DB connections = provider max_connections - administrative/maintenance reserve`

`maximum application instances <= usable DB connections / configured per-instance pool budget`

Do not increase `DB_CONNECTION_LIMIT` simply to absorb traffic; that can move a bottleneck from the app to MySQL. Scale HTTP instances and database capacity together, monitor p95 latency/error rate/active connections/CPU/IOPS, and run a production-like load test before publishing a numeric concurrent-user capacity claim. See [`docs/SCALING_AND_CAPACITY.md`](docs/SCALING_AND_CAPACITY.md).

## Notification Health

The Settings **Notification health** control answers a different question from the reminder toggle: **can this browser/device actually receive Pamet notifications?**

It checks browser support, notification permission, and whether the device has an active Pamet push subscription. **Check again** refreshes those states and shows completion/error feedback. The repair action adapts to the current state: enable permission, explain a browser/OS block, or repair an allowed-but-missing subscription. The check does not read or send health-journal content.

## Release Gates

Every production merge should preserve all of the following:

- production bundle build;
- strict-CSP output checks;
- syntax/static release checks;
- semantic version consistency;
- release-specific PWA worker/cache/static-asset rotation;
- dark-mode surface/contrast checks;
- feature-module ownership checks;
- security/UI assertions;
- Insights/design-system assertions;
- unit/security tests;
- MySQL-backed lifecycle integration tests;
- Stripe/device/session/sharing/sync assertions;
- disposable MySQL backup → isolated restore;
- production dependency audit;
- mobile contract validation;
- canonical plan/entitlement drift checks;
- notification-health UX assertions;
- database scale/index/cursor-batching checks;
- production JS/CSS raw and gzip performance budgets;
- GitHub scheduled-job OIDC verification checks;
- live Wasmer version/readiness acceptance when the environment is available;
- admin-mirror parity after production merges.

Environment-only and independent gates remain separate: provider PITR/RPO/RTO evidence, controlled Stripe live-mode lifecycle acceptance, real alert receipt/escalation, independent penetration testing, independent WCAG 2.2 AA review, privacy/legal determination, and independent cryptographic review before enabling encrypted working local storage.

A green CI run is required for release. It is not an independent compliance or security certification.

## Repository Organization

- `js/` — feature-owned browser source modules
- `css/` — source stylesheets and design-system layers
- `lib/` — server-side supporting modules
- `routes/` — extracted server routes
- `db/` — deployable schema and controlled migrations
- `scripts/` — release checks and operational drills
- `tests/` — unit and MySQL integration coverage
- `contracts/` — authoritative product/mobile compatibility contracts
- `config/` — non-secret runtime verification metadata such as public OIDC signing keys
- `.github/workflows/` — CI, scheduled jobs, live acceptance, mirrors, and release coordination
- `assets/` — application icons and visual assets
- `dist/` — generated production bundles

## Operational Documentation

| Document | Purpose |
| --- | --- |
| `GO_LIVE_STATUS.md` | Evidence-based go-live dashboard and remaining gates |
| `PRODUCTION_READINESS.md` | Engineering production-readiness review |
| `REAL_ENVIRONMENT_ACCEPTANCE.md` | Deployed-environment acceptance checklist |
| `docs/SCALING_AND_CAPACITY.md` | Capacity model, database connection budget, and scale validation |
| `BACKUP_RESTORE_RUNBOOK.md` | Recovery requirements and restore exercises |
| `ASSURANCE_HANDOFF.md` | External security/privacy/accessibility review handoff |
| `ACCESSIBILITY_REVIEW.md` | External WCAG 2.2 AA review scope |
| `SECURITY.md` | Security architecture |
| `THREAT_MODEL.md` | Browser/data threat model |
| `LOCAL_ENCRYPTION_THREAT_MODEL.md` | Working-journal encryption review gate |
| `LEGACY_AUTH_SUNSET.md` | Compatibility-auth retirement criteria |
| `INCIDENT_RESPONSE.md` | Security/operations response process |
| `MOBILE_RELEASE_COORDINATION.md` | Production → native synchronization and release gates |
| `PERFORMANCE_AUDIT.md` | Performance findings and follow-up work |
| `CHANGELOG.md` | Release history |

## Run Locally

Node.js 20+ is required.

```bash
npm install
npm run build
npm run check
npm test
npm start
```

Backend-dependent capabilities require the relevant environment configuration. Never commit secrets; `.env.example` contains placeholders only.

## Product Promise

**Track what you feel. See what changes. Bring the story to your doctor.**
