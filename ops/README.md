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

`POST /api/ops/test-alert` uses the same protected metrics authorization and sends a deliberately non-health-data synthetic event to `ALERT_WEBHOOK_URL`.

The operator acceptance exercise is:

1. Confirm `ALERT_WEBHOOK_URL` and, if used, `ALERT_WEBHOOK_TOKEN` are present in the production secret store.
2. Call the protected synthetic-alert endpoint from an authorized administrative/operator environment.
3. Confirm the intended human/channel receives the alert.
4. Record delivery time and acknowledgement time in the external readiness evidence.
5. Do not include the metrics secret or webhook token in the evidence.

A successful HTTP response only proves the destination accepted the request. The external/operator gate remains open until a human confirms receipt and escalation ownership.

## Scheduled job batching

The secure edge intercepts the legacy push-reminder, weekly-digest, and Stripe-reconciliation job URLs before `server.js` and processes them through bounded cursor batches.

Environment controls:

- `PAMET_JOB_BATCH_SIZE` — default 250, bounded by the job implementation;
- `JOB_DB_CONNECTION_LIMIT` — default 2, maximum 4 for the temporary scheduled-job DB pool.

This separate low-frequency pool is an incremental safety step. Long term, database ownership should move into a shared service module when `server.js` is decomposed so every route and job uses one canonical pool implementation.

## Alert policy

`alert-thresholds.json` is the source-controlled desired alert policy. Implement the equivalent rules in Grafana (or the selected operator platform), then complete the synthetic delivery test. The file alone is not evidence that Grafana rules are active.
