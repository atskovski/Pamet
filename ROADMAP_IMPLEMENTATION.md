# Pamet roadmap implementation framework

This document turns the production-readiness review into an executable engineering plan. It separates code Pamet can ship itself from evidence or professional review that cannot be manufactured by the application.

## Already present in the current runtime

The external review was performed against an earlier snapshot. The current runtime already has Grafana OTLP log/metric export, optional structured log drain, protected metrics, alert webhook support, Redis/MySQL distributed rate limiting, strict CSP, Stripe webhook verification, Web Push, appointment reminders, sharing invites, and local JSON data export primitives. The roadmap work extends these systems rather than adding overlapping vendors by default.

## Delivered engineering framework

### Operations / v1.7 foundation

- Every `/api/` request receives an `X-Request-ID` when one is not already supplied.
- API runtime telemetry keeps bounded in-memory route/status/latency counters and the 25 most recent 5xx failure summaries.
- Paths are normalized so UUIDs and share tokens do not enter runtime telemetry.
- Actor correlation uses a short one-way hash of request credentials; raw bearer/session material is never stored by the new layer.
- `GET /api/ops/runtime` exposes the bounded runtime snapshot only when `METRICS_SECRET` is supplied as a Bearer token or `X-Metrics-Key`.
- `POST /api/ops/test-alert` provides a protected, non-health-data synthetic alert-delivery test for the operator acceptance exercise.
- `GET /api/platform/capabilities` exposes non-secret feature/readiness capability state to clients.
- Push reminders, weekly digests, and Stripe reconciliation are intercepted at the secure edge and processed in bounded cursor batches instead of unbounded full-table scans.
- UUID/string cursors are supported by `lib/batch.js`; batch size and the temporary scheduled-job pool are bounded by configuration.
- `ops/alert-thresholds.json` defines desired 5xx, latency, webhook/job and readiness alert policy for Grafana/operator configuration.

### Browser / product foundation

- `window.PametPlatform` loads capability state only after first-load idle time.
- `window.PametPlatform.exportPayload()` reuses the existing `PametStore.exportAllData()` contract.
- Settings now exposes **Download my Pamet data**, generating the JSON export locally in the browser rather than uploading health data to a new export service.
- Settings now exposes notification health for unsupported, denied, granted-but-unsubscribed, and healthy states, with repair/recheck guidance.
- Data export and notification health default on because their implementations and release checks exist.
- Future clinical/collaboration/encryption capabilities remain represented by explicit server feature gates instead of partially exposed unfinished UI.

### CI / release enforcement

- Production CI blocks on build, static/release checks, the unit/security suite, integration lifecycle tests, the disposable backup/restore drill, and `npm audit --omit=dev --audit-level=high`.
- The operations job runners have focused tests for bounded UUID batching, digest batching, Stripe reconciliation, and trial entitlement behavior.
- The platform Settings experience has a strict-CSP/release guard.
- Protected operational endpoints are covered by HTTP regression tests.

## Capability state

Implemented and safe to expose now:

- local JSON data export;
- notification-health status/recovery guidance;
- protected runtime telemetry for operators;
- bounded scheduled jobs.

The following remain **off** until their implementation and acceptance criteria are complete:

- pattern confidence / change summaries;
- per-visit Visit Brief selection;
- quick-log chips;
- care circles;
- appointment-prep auto-drafts;
- encrypted working journal;
- public/user-facing ops dashboard (operations stay Admin-only).

## Next code work Pamet can deliver

### Maintainability / v1.8 window

1. Extract shared database ownership so `server.js`, scheduled jobs, account edge helpers, and reminders use one canonical pool/service implementation.
2. Extract auth/account routes into a dedicated router while preserving exact route contracts and integration tests.
3. Extract billing/webhook/reconciliation logic into a dedicated billing service/router.
4. Continue replacing remaining ad hoc `console.*` messages with the structured operational-event/log transport.
5. Apply any code findings returned by the independent security/accessibility reviews.

### Journal depth / v1.9

1. Add observation confidence scoring with minimum evidence rules and explicit uncertainty language.
2. Add a “what changed” summary that describes observations, never diagnosis or causation.
3. Add per-visit selection state for Visit Brief generation and printable output.
4. Add quick-log chips using the user’s recent frequent symptoms; retain the full log form as the source of truth.

### Care collaboration / v2.0

1. Extend the existing sharing-invite model into permission-scoped care-circle membership rather than creating a parallel sharing system.
2. Build appointment prep from recent user-selected observations and discussion prompts.
3. Add encrypted working-journal storage only after independent cryptographic review, with migration, recovery, key-rotation, and data-loss tests.

### Platform maturity / v2.1+

1. Add a clinician-friendly PDF export package in addition to JSON portability.
2. Surface delivery/subscription degradation trends in Admin.
3. Build the Admin-only operations dashboard over the protected runtime/readiness endpoints and existing Grafana/OTLP signals.

## Parked external/operator gates

These are tracked as open GitHub issues so they cannot disappear into prose:

| Gate | Tracking issue | Why code cannot close it |
| --- | --- | --- |
| Independent penetration test | #43 | Self-authored tests are not independent adversarial assurance. |
| Independent WCAG 2.2 AA review | #44 | Automated checks cannot certify real keyboard/screen-reader workflows. |
| Legal/privacy/HIPAA determination | #45 | Applicability depends on business model, contracts, geography and actual data flows. |
| Stripe production live-mode lifecycle acceptance | #46 | Correct code is not evidence of the live provider/account configuration. |
| Provider backup/restore with measured RPO/RTO | #47 | CI disposable databases do not measure provider recovery. |
| Independent cryptographic review | #48 | Encryption design cannot independently approve itself. |
| Production alert delivery/escalation acceptance | #49 | Sending code cannot prove the intended human received and acknowledged the alert. |

## Resolution sequence for parked gates

1. **Stripe #46:** execute controlled production subscription → webhook → entitlement → portal/cancellation → failure/recovery validation and retain redacted event evidence.
2. **Backup #47:** restore a real provider backup into an isolated database/deployment and record measured RPO/RTO.
3. **Alerting #49:** configure the source-controlled alert thresholds, call the protected synthetic alert endpoint, and record receipt/acknowledgement/escalation evidence.
4. **Pen test #43:** provide staging/test accounts, architecture and route scope to an independent tester; remediate and retest Critical/High findings.
5. **Accessibility #44:** commission manual keyboard/screen-reader/zoom/reflow/contrast review; remediate and retest.
6. **Legal/privacy #45:** provide counsel the data-flow/subprocessor/retention/sharing/mobile-distribution package and implement required policy/contract/product changes.
7. **Crypto #48:** keep working-journal encryption disabled until an independent review accepts the key lifecycle, migration, recovery and threat model.

## Release discipline

- Do not enable future health/collaboration/encryption flags just because the code compiles.
- Enable one capability at a time only after its frontend/backend acceptance matrix passes.
- Keep code evidence, production/provider evidence, and independent evidence separate in `GO_LIVE_STATUS.md`.
- Never put metrics secrets, webhook tokens, Stripe keys, database credentials, recovery secrets, or health data into tickets, screenshots, committed evidence, or operator dashboards.

This keeps Pamet’s production safety posture intact while giving the web app, Admin mirror and future iOS/Android clients a common capability contract to build against.
