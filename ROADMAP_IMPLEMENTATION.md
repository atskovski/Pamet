# Pamet roadmap implementation framework

This document turns the production-readiness review into an executable engineering plan. It separates code Pamet can ship itself from evidence or professional review that cannot be manufactured by the application.

## Already present in the current runtime

The external review was performed against an earlier snapshot. The current runtime already has Grafana OTLP log/metric export, optional structured log drain, protected metrics, alert webhook support, Redis/MySQL distributed rate limiting, strict CSP, Stripe webhook verification, Web Push, appointment reminders, sharing invites, and local JSON data export primitives. The roadmap work should extend these systems rather than add overlapping vendors by default.

## Foundation delivered in this branch

### Operations / v1.7 groundwork

- Every `/api/` request receives an `X-Request-ID` when one is not already supplied.
- API runtime telemetry keeps bounded in-memory route/status/latency counters and the 25 most recent 5xx failures.
- Paths are normalized so UUIDs and share tokens do not enter runtime telemetry.
- Actor correlation uses a short one-way hash of the request credential; raw bearer/session material is never logged by the new layer.
- `GET /api/ops/runtime` exposes the bounded runtime snapshot only when `METRICS_SECRET` is supplied as a Bearer token or `X-Metrics-Key`.
- `GET /api/platform/capabilities` exposes non-secret feature/readiness capability state to clients.
- A cursor-style bounded batch helper is available for converting unbounded background queries without a big-bang server rewrite.

### Browser / product groundwork

- `window.PametPlatform` loads capability state only after first-load idle time.
- `window.PametPlatform.exportPayload()` reuses the existing `PametStore.exportAllData()` contract.
- `window.PametPlatform.downloadJson()` provides a browser-side full JSON export foundation without uploading health data to a new service.
- Notification health can report unsupported, denied, granted-but-unsubscribed, and healthy states so a later UI can tell users when closed-app reminders are degraded.
- Future features are represented as explicit server capability gates instead of partially exposing unfinished UI.

### Future feature gates

The following default to **off** until the implementation and acceptance criteria are complete:

- pattern confidence / change summaries;
- per-visit Visit Brief selection;
- quick-log chips;
- care circles;
- appointment-prep auto-drafts;
- encrypted working journal;
- notification-health UI;
- ops dashboard UI.

Local data export defaults to on because the store already supports an export contract.

## What can be delivered entirely in code

### v1.7 — operations

1. Continue replacing ad hoc `console.*` calls with the existing operational-event/OTLP system.
2. Convert push/digest scans to bounded batches using `lib/batch.js`.
3. Add alert thresholds in Grafana for 5xx rate, webhook failures, latency, and background-job failures.
4. Surface `/api/ops/runtime` in the private Admin control center, never in the production user UI.
5. Add CI assertions that the new platform layer remains wired and protected.

### v1.8 — maintainability and remediation window

1. Extract auth and billing route modules incrementally from `server.js`; preserve route behavior and tests on every extraction.
2. Add accessibility fixes found by the outside audit.
3. Add security fixes found by the penetration test.
4. Keep encrypted-journal support disabled until independent crypto/security review accepts the design.

### v1.9 — journal depth

1. Add observation confidence scoring with minimum evidence rules and explicit uncertainty language.
2. Add a “what changed” summary that describes observations, never diagnosis or causation.
3. Add per-visit selection state for Visit Brief generation and printable output.
4. Add quick-log chips using the user’s recent frequent symptoms; retain the full log form as the source of truth.

### v2.0 — care collaboration

1. Extend the existing sharing-invite model into permission-scoped care-circle membership rather than creating a parallel sharing system.
2. Build appointment prep from recent user-selected observations and discussion prompts.
3. Add encrypted working-journal storage only after review, with migration, recovery, key-rotation, and data-loss tests.

### v2.1+ — platform maturity

1. Expose JSON export in Settings and add a generated PDF package where appropriate.
2. Surface notification health and re-enable guidance without nagging the user.
3. Build an Admin-only ops dashboard on top of protected runtime, Grafana/OTLP, readiness, and job status data.

## What code cannot legitimately close

These are launch-evidence gates, not coding tasks:

| Gate | Why code cannot close it | Resolution |
| --- | --- | --- |
| Independent penetration test | Self-authored tests are not independent adversarial assurance. | Hire a qualified tester, define production/staging scope, remediate findings, retain report and retest evidence. |
| WCAG 2.2 AA review | Automated checks cannot certify real keyboard/screen-reader workflows. | Commission an accessibility audit including manual keyboard, VoiceOver/NVDA, zoom/reflow and contrast testing; remediate and retest. |
| Legal/compliance determination | Applicability depends on business model, contracts, geography and actual data flows. | Obtain scoped health/privacy counsel covering HIPAA applicability, state consumer-health laws, privacy policy/consent, retention/deletion and app-store disclosures. |
| Stripe live-mode dry run evidence | Correct code is not evidence of live provider configuration. | Execute a controlled live subscription → webhook → plan entitlement → cancellation → failed-payment/recovery test and retain timestamps/event IDs with secrets redacted. |
| Production backup/restore RPO/RTO | CI disposable databases do not measure provider recovery. | Take a real provider backup, restore to an isolated database, time detection/restore/validation, and record actual RPO/RTO. |
| Grafana/alert operational acceptance | Alert code cannot prove notifications reach the right human. | Trigger synthetic 5xx/webhook/job alerts, confirm delivery/escalation, document owner and response runbook. |

## Recommended sequence

1. Merge this foundation only after CI is green.
2. Configure no new production feature flags except `PAMET_FEATURE_DATA_EXPORT=true` until each feature is finished.
3. Run the Stripe and backup/restore evidence exercises.
4. Complete external penetration, accessibility and legal reviews.
5. Remediate those findings in the stable v1.8 window.
6. Turn on v1.9/v2.0 product capabilities one at a time behind acceptance tests rather than releasing the entire roadmap at once.

This keeps Pamet’s production safety posture intact while giving the frontend, backend, Admin mirror and future mobile clients a common capability contract to build against.
