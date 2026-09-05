# Pamet operations runbook

This directory contains source-controlled operational policy. It does not self-certify external/provider acceptance.

## Protected runtime snapshot

`GET /api/ops/runtime` requires the configured `METRICS_SECRET` as either `Authorization: Bearer <secret>` or `X-Metrics-Key`. The response is intentionally bounded and contains service/runtime data rather than journal content.

Use it to inspect:

- release/environment identity;
- uptime and process memory;
- bounded route/status/latency counters;
- the most recent bounded 5xx failure summaries;
- current non-secret capability/operations state.

Never expose `METRICS_SECRET` in browser JavaScript, screenshots, tickets, logs, or documentation.

## Synthetic alert acceptance

`POST /api/ops/test-alert` uses the same protected metrics authorization and emits a deliberately non-health-data synthetic event through every configured alert transport:

- `ALERT_WEBHOOK_URL`, when configured; and/or
- Grafana Cloud OTLP logs when `GRAFANA_OTLP_ENDPOINT`, `GRAFANA_OTLP_USERNAME`, and `GRAFANA_OTLP_TOKEN` are configured.

The operator acceptance exercise is:

1. Confirm at least one production alert transport is configured. Grafana OTLP is sufficient for the synthetic emission step when the matching Grafana alert rule/contact point is active.
2. Call the protected synthetic-alert endpoint from an authorized administrative/operator environment.
3. Confirm the response lists at least one delivered transport and inspect any partial transport failures.
4. Confirm the intended human/channel receives the alert.
5. Record delivery time and acknowledgement time in the external readiness evidence.
6. Do not include the metrics secret, webhook token, Grafana token, or any health data in the evidence.

A successful HTTP response proves only that at least one configured transport accepted the synthetic event. It does **not** prove a Grafana rule fired, a contact point delivered, or a human acknowledged it. The external/operator gate remains open until human receipt and escalation ownership are documented.

## Scheduled job batching

The secure edge intercepts the legacy push-reminder, weekly-digest, and Stripe-reconciliation job URLs before `server.js` and processes them through bounded cursor batches.

Environment controls:

- `PAMET_JOB_BATCH_SIZE` — default 250, bounded by the job implementation;
- `JOB_DB_CONNECTION_LIMIT` — default 2, maximum 4 for the temporary scheduled-job DB pool.

This separate low-frequency pool is an incremental safety step. Long term, database ownership should move into a shared service module when `server.js` is decomposed so every route and job uses one canonical pool implementation.

## Alert policy

`alert-thresholds.json` is the source-controlled desired alert policy. Implement the equivalent rules in Grafana (or the selected operator platform), then complete the synthetic delivery test. The file alone is not evidence that Grafana rules or contact points are active.
