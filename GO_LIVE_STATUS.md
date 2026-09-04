# Pamet 1.6.4 — Go-Live Status at a Glance

Last reviewed: 2026-09-04  
Source of truth: Pamet 1.6.4 release branch plus exact-commit CI/environment evidence after merge.  
Rule: repository/self-review evidence is never presented as an independent certification.

## Release dashboard

| Area | Status | Evidence / remaining gate |
| --- | --- | --- |
| Authentication / sessions / MFA | **Strong by code + automated review** | Password hashing, revocable sessions/devices, MFA/TOTP, breached-password controls and recovery are covered in code/tests. Independent penetration testing remains #43. |
| Scheduled-job authentication | **Hardened; deployed acceptance required** | GitHub OIDC tokens are signature/issuer/audience/repository/main/workflow/event validated. Production may use automatically refreshed bundled GitHub **public** signing keys if Wasmer cannot reach GitHub JWKS directly. Post-deploy OIDC acceptance must pass before this row is considered environment-green. |
| SQL injection surface | **Clean in reviewed paths** | Parameterized MySQL access is the required pattern; security tests cover production paths. Independent adversarial review remains open. |
| Database scale/indexing | **Improved and gated** | User IDs are `BIGINT UNSIGNED`; scale indexes cover digest cursor, push scan, due appointments and audit event lookup. Existing production DB uses `db/migrations/2026-09-04-scale-indexes.sql`. CI validates bounded/cursor-batched processing. Live provider `max_connections`, IOPS/storage and load-test capacity remain environment evidence. |
| Connection management | **Bounded architecture; provider sizing required** | Default theoretical pool budget is 14 connections per app instance. Job pool is hard-capped and appointment pool is intentionally small. Do not raise pool limits without sizing replicas against provider `max_connections`. |
| Billing / entitlements | **Strong implementation; live lifecycle evidence open** | Exact price validation, signed/idempotent webhooks, server-owned entitlements and bounded reconciliation exist. Controlled production lifecycle evidence remains #46. |
| Canonical plan matrix | **Implemented and CI-gated** | `contracts/plan-features.json` is the display/catalog source. Generated browser catalog + README matrix and server/mobile entitlement drift checks prevent stale Free/Pro/Ultra copy. |
| Notification health | **Implemented and clarified** | Settings visibly checks browser support, permission and active device subscription; **Check again** now gives progress/completion/error feedback and state-specific repair guidance. It does not read health-journal content. |
| Working-journal encryption | **Not shipped** | Deliberately gated pending independent cryptographic review #48. Ultra encrypted sync is separate from working browser-storage encryption. |
| CSP hardening | **Strong implementation; deployed verification required** | Production edge and inner app remove script/style `unsafe-inline`, block inline script/style attributes and run strict-CSP output checks. |
| Dark-mode visual system | **Automated baseline; deployed verification required** | Unified dark surfaces/contrast and release checks remain blocking CI. |
| Data portability | **Implemented** | Settings local JSON export plus applicable local PDF care-summary output. |
| Frontend maintainability | **Feature-owned architecture** | Browser JS/CSS is organized by responsibility; release history belongs in Git/CHANGELOG. |
| Server maintainability | **Incrementally decomposed** | Platform/ops routes and jobs are extracted. Broader `server.js` decomposition remains controlled engineering work (#10), not a reason to perform a risky monolithic rewrite. |
| Background jobs | **Bounded** | Push/digest/reconciliation use cursor batching; appointment reminders have a per-run cap and overlap lock. Long-run duration must still be observed at production scale. |
| Runtime observability | **Strong implementation; operator acceptance open** | Grafana OTLP/log/metrics/readiness/alerts exist. Human alert receipt/escalation remains #49. |
| Performance regression control | **New blocking gate** | CI enforces raw + gzip budgets for production JS/CSS bundles in addition to functional tests. Provider-side Core Web Vitals/load evidence remains environment evidence. |
| PWA release delivery | **Release-specific rotation required** | 1.6.4 must rotate worker registration, shell cache and static asset token together; version CI rejects drift. |
| CI automation | **Active and blocking** | Build, strict-CSP/static/version checks, unit/security tests, plan drift, notification UX, DB capacity/index checks, performance budgets, MySQL lifecycle integration, backup→restore and dependency audit. |
| Live acceptance automation | **Active, environment-dependent** | Live Wasmer health/readiness/version is checked after production changes and on schedule. Code CI is not substituted for provider evidence. |
| Admin mirror parity | **Automated** | Production merges trigger exact-SHA `pamet-admin` parity verification. |
| Independent penetration test | **Open — #43** | External adversarial testing and remediation/retest evidence required. |
| Accessibility (WCAG 2.2 AA) | **Automated/self-assessed; independent review open — #44** | Independent keyboard/screen-reader/zoom/reflow/mobile/contrast review remains required. |
| Backup / restore | **CI drill exercised; provider exercise open — #47** | Disposable MySQL backup → isolated restore is blocking CI. Provider PITR/full-restore with measured RPO/RTO remains required. |
| Dependency security | **Automated and blocking** | High/critical production dependency audit is a failing release gate with bounded retry for registry availability. |
| Legal/privacy determination | **Open — #45** | Qualified review of actual operating model, HIPAA/BAA-DPA/state consumer-health-data/app-store obligations remains external. |
| Mobile contract | **1.6.4 backend contract; 1.5.1 minimum compatible baseline** | Production remains source of truth for native compatibility and plan entitlements. |

## Parked launch-evidence gates

These are **not hidden engineering defects**. They remain open because the evidence must come from a real provider, controlled production exercise, or independent professional review:

1. **#46 — Production Stripe live-mode end-to-end acceptance.** Exercise controlled purchase/trial/portal/cancel/failure/retry/reconciliation without exposing payment data or secrets.
2. **#47 — Provider backup/PITR restore.** Run an isolated provider-level restore and record achieved RPO/RTO, retention and encryption evidence.
3. **#49 — Production alert receipt and escalation.** Emit a controlled non-health-data test alert and prove intended human/channel acknowledgement/escalation.
4. **#43 — Independent penetration test.** External adversarial testing, remediation and retest.
5. **#44 — Independent WCAG 2.2 AA review.** External accessibility testing and remediation/retest.
6. **#45 — Privacy/legal review.** Actual data-flow, HIPAA applicability, BAAs/DPAs, consumer-health laws, retention/deletion and store disclosures.
7. **#48 — Independent cryptographic review.** Required before enabling/marketing encrypted working-journal storage.

## Engineering follow-up that remains intentionally tracked

- **#8 — Legacy device bearer retirement:** strict-CSP work is complete, but compatibility auth should be removed only after production migration telemetry and a supported recovery path show it is safe.
- **#10 — Server decomposition:** continue bounded route/service extraction as touched areas evolve; avoid a high-risk all-at-once rewrite.

## Release evidence model

Every production change preserves three separate evidence classes:

- **Code evidence:** source review, build, static/security checks, unit/integration tests, dependency audit, plan/notification/scale/performance gates.
- **Environment evidence:** live Wasmer version/readiness, production OIDC job acceptance, provider integrations, billing, alert delivery, database capacity and provider backup/restore.
- **Independent evidence:** penetration testing, accessibility audit, cryptographic review, legal/compliance determination.

A green CI build is necessary. It is not proof that environment or independent evidence has occurred.

## 1.6.4 merge acceptance

Do not call 1.6.4 production-green until all exact-head repository CI passes and the merged commit completes live Wasmer acceptance, scheduled-job OIDC acceptance, and admin parity. Any failed production workflow must be investigated rather than waived.
