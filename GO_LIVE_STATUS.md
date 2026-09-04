# Pamet 1.6.2 — Go-Live Status at a Glance

Last reviewed: 2026-09-03  
Source of truth: Pamet 1.6.2 production runtime plus exact-commit CI/environment evidence.  
Rule: a code/self-review result is not presented as an independent certification.

| Area | Status | Evidence / remaining gate |
| --- | --- | --- |
| Authentication / sessions / MFA | **Strong by code + automated review** | Secure session/device model, password hashing, MFA/TOTP, breach-password checks, revocation and recovery controls are covered by code/tests. Independent penetration testing remains open as #43. |
| SQL injection surface | **Clean in reviewed paths** | Parameterized MySQL access is the required pattern and security checks cover the production paths. Independent adversarial review remains open. |
| Rate limiting | **Strong implementation** | Production limiter is designed to fail closed with Redis/Valkey when configured and MySQL fallback. Production topology/load evidence should still be retained. |
| Billing (Stripe) | **Strong implementation; live acceptance open** | Webhook idempotency and server-side price/plan validation exist. Bounded Stripe reconciliation now avoids full-table scans. Production lifecycle evidence remains open as #46. |
| Working-journal end-to-end/local encryption | **Not shipped** | Deliberately gated pending independent cryptographic review #48. Ultra encrypted sync is separate from encrypting the working browser copy. |
| CSP hardening | **Strong implementation; deployed verification required** | Both the secure edge and inner application policy remove script/style `unsafe-inline`, block inline script/style attributes, and the strict-CSP production build prevents generated browser code from reintroducing inline style attributes. |
| Dark-mode visual system | **1.6.2 release baseline; deployed verification required** | Unified dark surfaces, readable text hierarchy and current release identity are enforced in source; PWA cache rotation prevents an old visual bundle from remaining indefinitely. |
| Data portability | **Implemented in product** | Settings exposes a local JSON export using the existing full-store export contract. Export generation stays in the browser and does not upload the journal to a new export service. Clinician/caregiver PDF flows are now available for the applicable care summaries. |
| Notification health | **Implemented in product** | Settings detects unsupported, denied, granted-but-unsubscribed and healthy states and provides recheck/repair guidance. Browser/OS-level denied permissions can still require a manual settings change. |
| Frontend maintainability | **1.6.x architecture completed** | Active browser JavaScript and CSS are organized under feature-owned names instead of release-numbered imports. Git and `CHANGELOG.md` carry release history. |
| Server maintainability | **Improving incrementally** | Platform/ops routes and bounded scheduled jobs are extracted outside the core monolith. `server.js` remains broad in responsibility; shared DB ownership plus auth/billing extraction remain controlled follow-up work. |
| Scheduled background jobs | **Bounded implementation** | Push reminders, weekly digests and Stripe reconciliation are intercepted at the secure edge and processed through bounded cursor batches. Configurable batch size and a small temporary job DB pool limit blast radius. |
| Runtime observability | **Strong implementation; operator acceptance open** | Existing Grafana OTLP/log-drain/alert paths are supplemented by request IDs, bounded route/status/latency telemetry, recent 5xx summaries and protected `/api/ops/runtime`. Production alert receipt/escalation still requires #49. |
| Alerting acceptance | **Framework complete; human receipt not yet proven** | `ops/alert-thresholds.json` defines desired alert policy and protected `POST /api/ops/test-alert` emits a non-health-data synthetic test. #49 remains open until the intended human/channel receives and acknowledges it. |
| PWA release delivery | **1.6.2 cache rotation enforced** | Worker registration `sw.js?v=1620`, shell cache `pamet-shell-v162-1`, CSS/JS shell query token `v=162`, and version checks are release-specific. Future releases fail CI if these values are not rotated together. |
| CI automation | **Active and blocking** | `.github/workflows/ci.yml` runs production build/check/test/audit plus MySQL lifecycle and disposable backup/restore exercises. `npm audit --omit=dev --audit-level=high` is a failing gate, not report-only output. |
| Live acceptance automation | **Active, environment-dependent** | `live-acceptance.yml` validates deployed health/readiness/version when the production environment is reachable. Keep live evidence separate from code-only CI. |
| Independent penetration test | **Open — #43** | Self-review and automated tests are not a substitute for independent adversarial testing. |
| Accessibility (WCAG 2.2 AA) | **Automated/self-assessed; independent review open — #44** | Static/accessibility guardrails exist; independent keyboard, screen-reader, zoom/reflow, mobile/landscape and contrast review remains open. |
| Backup / restore | **CI drill exercised; production-provider drill open — #47** | Disposable MySQL backup → isolated restore runs in CI. Provider-level production PITR/restore evidence with measured and recorded RPO/RTO is still required. |
| Dependency security | **Automated and blocking** | Production dependency audit is part of release CI and fails the quality job at high/critical findings. Keep results tied to the exact release commit. |
| Legal/privacy determination | **Open — #45** | Product wording avoids self-certifying HIPAA/legal status. Qualified counsel must evaluate the actual business/data-flow model, state consumer-health obligations, BAAs/DPAs, retention/deletion and app-store disclosures. |
| Mobile contract | **1.6.2 backend contract; 1.5.1 minimum compatible baseline** | `contracts/mobile-api.json` publishes backend 1.6.2 while retaining minimum backend 1.5.1 so the merged iOS/Android 1.5.1 baselines remain compatible. |
| iOS release engineering | **1.5.1 native baseline merged** | Simulator tests and Release compilation are green and the baseline is in `Pamet-iOS/main`. Store signing, final icon/artwork, App Store Connect, real-device/accessibility/security review and full product parity remain release gates. |
| Android release engineering | **1.5.1 native baseline merged** | Unit tests, lint, debug/release builds and release shrinking are green and the baseline is in `Pamet-Android/main`. Play signing/console, real-device/accessibility/security review and full product parity remain release gates. |

## Parked launch-evidence gates

The remaining items that should block a claim of fully independently validated production readiness are tracked as issues rather than being hidden in prose:

1. **#46** — Production Stripe live-mode end-to-end acceptance evidence.
2. **#47** — Provider-level production backup/PITR restore exercise with measured and recorded RPO/RTO.
3. **#49** — Production alert-delivery receipt, acknowledgement and escalation acceptance.
4. **#43** — Independent penetration test and remediation/retest evidence.
5. **#44** — Independent WCAG 2.2 AA accessibility review and remediation/retest evidence.
6. **#45** — Privacy/legal review for the actual operating model, including HIPAA/BAA-DPA/state consumer-health-data/app-store obligations.
7. **#48** — Independent cryptographic review before enabling or marketing encrypted working-journal storage.

## Important wording

Pamet may store or organize health-related information, but that alone does not establish HIPAA compliance or make every Pamet relationship HIPAA-covered. Do not market Pamet as HIPAA compliant, SOC 2 certified, independently penetration-tested, independently WCAG certified, or independently cryptographically reviewed until the corresponding external evidence is complete.

## Release discipline

Every production change should preserve this separation:

- **Code evidence:** source review, tests, static checks, dependency audit, build/lint.
- **Environment evidence:** live Wasmer health/readiness, provider integrations, billing, delivery, backup/restore.
- **Independent evidence:** penetration testing, accessibility audit, cryptographic review, legal/compliance determinations.

A green CI build is necessary for release; it is not, by itself, proof that the independent/environment gates have been completed.
