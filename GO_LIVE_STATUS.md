# Pamet 1.6.9 — Go-Live Status at a Glance

Last reviewed: 2026-09-05  
Source of truth: current `main` plus exact-commit CI/environment evidence after merge.  
Rule: repository/self-review evidence is never presented as an independent certification.

## Release dashboard

| Area | Status | Evidence / remaining gate |
| --- | --- | --- |
| Authentication / sessions / MFA | **Strong by code + automated review** | Password hashing, revocable sessions/devices, MFA/TOTP, breached-password controls and recovery are covered in code/tests. Independent penetration testing remains #43. |
| Scheduled-job authentication | **Hardened; deployed acceptance required** | GitHub OIDC tokens are signature/issuer/audience/repository/main/workflow/event validated. Production may use automatically refreshed bundled GitHub **public** signing keys if Wasmer cannot reach GitHub JWKS directly. Post-deploy OIDC acceptance must pass before this row is considered environment-green. |
| SQL injection surface | **Clean in reviewed paths** | Parameterized MySQL access is the required pattern; security tests cover production paths. Independent adversarial review remains open. |
| Database scale/indexing | **Improved and gated** | User IDs are `BIGINT UNSIGNED`; scale indexes cover digest cursor, push scan, due appointments and audit event lookup. Existing production DB uses `db/migrations/2026-09-04-scale-indexes.sql`. CI validates bounded/cursor-batched processing. Live provider `max_connections`, IOPS/storage and load-test capacity remain environment evidence. |
| Connection management | **Bounded architecture; provider sizing required** | Default theoretical pool budget is 14 connections per app instance. Job pool is hard-capped and appointment pool is intentionally small. Do not raise pool limits without sizing replicas against provider `max_connections`. |
| Billing / entitlements | **Strong implementation; paid lifecycle evidence open** | Exact price validation, signed/idempotent webhooks, server-owned entitlements and bounded reconciliation exist. Live Pro/Ultra prices match the canonical catalog. The production Stripe webhook now includes the subscription lifecycle events Pamet uses for entitlement synchronization. Read-only 2026-09-05 Stripe evidence confirms live-mode Pamet Pro/Ultra trial creation and multiple cancellation transitions, but the newest inspected trial had no default payment method and only a $0 trial invoice. Paid charge, portal, Pamet entitlement activation/downgrade and failure/recovery acceptance remain #46. |
| Canonical plan matrix | **Implemented and CI-gated** | `contracts/plan-features.json` is the display/catalog source. Generated browser catalog + README matrix and server/mobile entitlement drift checks prevent stale Free/Pro/Ultra copy. |
| Notification health | **Implemented and clarified** | Settings visibly checks browser support, permission and active device subscription; **Check again** gives progress/completion/error feedback and state-specific repair guidance. It does not read health-journal content. |
| Visit Brief email privacy boundary | **Fail-closed pending #45** | Local Download/Save PDF remains available. A configured Resend sender does not automatically enable health-bearing Visit Brief email. `PAMET_FEATURE_VISIT_BRIEF_EMAIL=true` is separately required, and should remain disabled until the legal/privacy determination and provider-contract permission for the intended data category are documented. |
| Working-journal encryption | **Not shipped** | Deliberately gated pending independent cryptographic review #48. Ultra encrypted sync is separate from working browser-storage encryption. |
| CSP hardening | **Strong implementation; deployed verification required** | Production edge and inner app remove script/style `unsafe-inline`, block inline script/style attributes and run strict-CSP output checks. |
| Dark-mode visual system | **Automated baseline; deployed verification required** | Unified dark surfaces/contrast and release checks remain blocking CI. |
| Data portability | **Implemented** | Settings local JSON export plus applicable local PDF care-summary output. Raw CSV/JSON format controls are no longer presented as primary user-facing Settings actions. |
| Frontend maintainability | **Feature-owned architecture** | Browser JS/CSS is organized by responsibility; release history belongs in Git/CHANGELOG. |
| Server maintainability | **Incrementally decomposed** | Platform/ops routes and jobs are extracted. Broader `server.js` decomposition remains controlled engineering work (#10), not a reason to perform a risky monolithic rewrite. |
| Background jobs | **Bounded** | Push/digest/reconciliation use cursor batching; appointment reminders have a per-run cap and overlap lock. Long-run duration must still be observed at production scale. |
| Runtime observability | **Grafana OTLP live; operator acceptance open** | A live 2026-09-05 capability check reports Grafana OTLP configured and protected metrics enabled, with no separate alert webhook configured. The protected synthetic alert route can use Grafana OTLP when a webhook is absent. Human alert receipt/escalation remains #49. |
| Performance regression control | **Blocking gate** | CI enforces raw + gzip budgets for production JS/CSS bundles in addition to functional tests. Provider-side Core Web Vitals/load evidence remains environment evidence. |
| PWA release delivery | **Release-specific rotation required** | Every release must rotate worker registration, shell cache and static asset token together; version CI rejects drift. |
| CI automation | **Active and blocking** | Build, strict-CSP/static/version checks, unit/security tests, plan drift, notification UX, DB capacity/index checks, performance budgets, MySQL lifecycle integration, backup→restore and dependency audit. |
| Live acceptance automation | **Active, environment-dependent** | Live Wasmer health/readiness/version is checked after production changes and on schedule. Code CI is not substituted for provider evidence. |
| Admin mirror parity | **Automated** | Production merges trigger exact-SHA `pamet-admin` parity verification. |
| Independent penetration test | **Open — #43** | External adversarial testing and remediation/retest evidence required. |
| Accessibility (WCAG 2.2 AA) | **Automated/self-assessed; independent review open — #44** | Independent keyboard/screen-reader/zoom/reflow/mobile/contrast review remains required. |
| Backup / restore | **CI drill exercised; provider exercise open — #47** | Disposable MySQL backup → isolated restore is blocking CI. Provider PITR/full-restore with measured RPO/RTO remains required. |
| Dependency security | **Automated and blocking** | High/critical production dependency audit is a failing release gate with bounded retry for registry availability. |
| Legal/privacy determination | **Open — #45** | `docs/PRODUCTION_VENDOR_REGISTER.md` now inventories current/conditional providers and external data flows. Qualified review of actual operating model, HIPAA/BAA-DPA/state consumer-health-data/app-store obligations and provider contract posture remains external. |
| Mobile contract | **Current backend contract; compatibility remains release-gated** | Production remains source of truth for native compatibility and plan entitlements. |

## Parked launch-evidence gates

These are **not hidden engineering defects**. They remain open because the evidence must come from a real provider, controlled production exercise, or independent professional review:

1. **#46 — Production Stripe live-mode end-to-end acceptance.** Live trial creation and cancellation have partial production evidence, but a controlled paid lifecycle still must prove payment method/charge, Pamet entitlement activation, portal, cancel/downgrade, failure/recovery and reconciliation without exposing payment data or secrets.
2. **#47 — Provider backup/PITR restore.** Run an isolated provider-level restore and record achieved RPO/RTO, retention and encryption evidence.
3. **#49 — Production alert receipt and escalation.** Emit a controlled non-health-data test alert and prove intended human/channel acknowledgement/escalation. Production has Grafana OTLP and does not require a separate webhook for the synthetic emission step.
4. **#43 — Independent penetration test.** External adversarial testing, remediation and retest.
5. **#44 — Independent WCAG 2.2 AA review.** External accessibility testing and remediation/retest.
6. **#45 — Privacy/legal review.** Review the actual data flows and `docs/PRODUCTION_VENDOR_REGISTER.md`; determine HIPAA applicability, BAAs/DPAs, consumer-health laws, retention/deletion, store disclosures and whether/under what provider contract health-bearing Visit Brief email may be enabled.
7. **#48 — Independent cryptographic review.** Required before enabling/marketing encrypted working-journal storage.

## Engineering follow-up that remains intentionally tracked

- **#8 — Legacy device bearer retirement:** compatibility auth should be removed only after production migration telemetry and a supported recovery path show it is safe.
- **#10 — Server decomposition:** continue bounded route/service extraction as touched areas evolve; avoid a high-risk all-at-once rewrite.

## Release evidence model

Every production change preserves three separate evidence classes:

- **Code evidence:** source review, build, static/security checks, unit/integration tests, dependency audit, plan/notification/scale/performance gates.
- **Environment evidence:** live Wasmer version/readiness, production OIDC job acceptance, provider integrations, billing, alert delivery, database capacity and provider backup/restore.
- **Independent evidence:** penetration testing, accessibility audit, cryptographic review, legal/compliance determination.

A green CI build is necessary. It is not proof that environment or independent evidence has occurred.

## Current-main acceptance

Do not call the current release production-green until all exact-head repository CI passes and the merged commit completes live Wasmer acceptance, scheduled-job OIDC acceptance, and admin parity. Any failed production workflow must be investigated rather than waived. The remaining external/operator gates above must retain their own evidence and may not be inferred from green code CI.
