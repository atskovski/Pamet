# External readiness evidence runbook

Pamet cannot close these gates with code alone. Use this runbook to produce auditable evidence without committing secrets or personal health data.

## 1. Stripe live-mode dry run

Use a controlled internal account and the smallest real charge your pricing model permits. Record only redacted identifiers and timestamps.

1. Confirm production uses live Stripe price IDs and the live webhook endpoint points at Pamet production.
2. Create a subscription through the real checkout flow.
3. Confirm the webhook is received and entitlement changes in Pamet.
4. Cancel the subscription and confirm entitlement/status transition.
5. Exercise a failed-payment/recovery path using a controlled Stripe-supported method if appropriate.
6. Record start/end timestamps, redacted event IDs, observed Pamet plan/status, and operator.
7. Never paste live secret keys, webhook secrets, card numbers, or health journal content into the evidence file.

Exit criteria: all expected Stripe/Pamet transitions are observed, timestamps are recorded, and no manual database correction was needed.

## 2. Provider backup/restore RPO/RTO

1. Create a production-provider backup or snapshot using the provider-supported mechanism.
2. Restore it into an isolated non-production database.
3. Point an isolated Pamet test deployment at the restored database.
4. Validate schema, account count, referential integrity, and a small set of synthetic test records.
5. Record backup timestamp, incident-detection assumption, restore start/end, validation end, calculated RPO and RTO.
6. Delete the isolated restore after the drill according to retention policy.

Exit criteria: measured RPO/RTO exist and the restored environment passes the agreed validation checklist.

## 3. Alert-delivery drill

1. Trigger a synthetic 5xx in a safe non-production path or controlled test deployment.
2. Trigger a synthetic background-job failure.
3. Trigger a synthetic webhook failure signal.
4. Confirm Grafana/log-drain ingestion and human alert delivery.
5. Record the owner, notification channel, receipt time, acknowledgement time, and escalation path.

Exit criteria: alerts reach the responsible human and the response runbook identifies who owns each class of incident.

## 4. Penetration test

Provide the independent tester with staging/production scope, architecture summary, authentication roles, API inventory, rate-limit expectations, and a test account. Require severity, reproduction steps, evidence, remediation recommendation, and retest status for every finding.

Exit criteria: critical/high findings are remediated and retested; accepted residual risk is explicitly documented.

## 5. WCAG 2.2 AA review

Scope keyboard-only operation, focus order, focus visibility, dialogs, form labels/errors, screen-reader semantics, contrast, zoom/reflow, reduced motion, mobile orientation, and the full login/log/Insights/Calendar/Visit Brief/Settings flows.

Exit criteria: material AA failures are remediated and retested, with known exceptions documented.

## 6. Legal/compliance scoping

Provide counsel with actual data flows, account model, hosting/subprocessors, payments, email/push providers, sharing model, retention/deletion behavior, target states/countries, marketing claims, and planned mobile-store distribution.

Request a written scoping memo covering at minimum HIPAA applicability, state consumer-health/privacy laws, privacy notice/consent, deletion/retention, processor agreements, breach obligations, and app-store health-data disclosures.

Exit criteria: engineering/product have a written list of applicable obligations, required policy/product changes, and owners.
