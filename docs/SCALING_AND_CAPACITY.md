# Pamet Scaling and Capacity

Pamet has no application-level maximum account count. Capacity is an environment property: application replicas, MySQL connection/IO/storage limits, provider request limits, third-party APIs, and workload shape determine how many simultaneous users the deployed service can support.

## Current database model

`pamet_users.id` is `BIGINT UNSIGNED`, so account-ID exhaustion is not a practical scaling limit. High-traffic access paths use indexed identifiers/tokens, and background jobs are bounded/cursor-batched instead of loading entire eligible tables into memory.

The default theoretical MySQL pool budget per application instance is:

| Pool | Default | Hard/configured behavior |
| --- | ---: | --- |
| Primary application pool | 5 | `DB_CONNECTION_LIMIT` |
| OAuth pool | 5 | `DB_CONNECTION_LIMIT`, minimum 1 |
| Scheduled operations pool | 2 | `JOB_DB_CONNECTION_LIMIT`, hard capped at 4 |
| Appointment reminder pool | 2 | fixed small pool |
| **Theoretical default total** | **14** | Per application instance |

A connection pool is a concurrency limit, not a user-count limit. Thousands of users may share a small pool when requests are short and spread over time; a much smaller number of simultaneous slow queries can saturate it.

## Replica budget

Reserve database connections for provider administration, migrations, backup/restore, observability, and emergency access. Then size application replicas from the remainder:

`usable_connections = max_connections - reserve_connections`

`safe_instance_count = floor(usable_connections / configured_per_instance_pool_budget)`

Use a meaningful reserve rather than consuming the provider's entire connection ceiling. Do not raise `DB_CONNECTION_LIMIT` automatically as traffic grows: multiplying a larger pool by autoscaled instances can create a database connection storm.

## Scale-oriented indexes

Pamet 1.6.4 adds/validates indexes for recurring production work:

- `pamet_users.idx_digest_cursor (weekly_digest_enabled,id)`
- `pamet_push_subscriptions.idx_push_scan (enabled,failure_count,id)`
- `pamet_appointments.idx_appointment_due (status,starts_at)`
- `pamet_audit_log.idx_audit_event (user_id,event_type,created_at)`

Fresh databases receive these from `db/schema.sql`; existing databases use the idempotent controlled migration `db/migrations/2026-09-04-scale-indexes.sql`.

## Background work

- Push reminders and weekly digests iterate with a cursor and bounded batch sizes.
- Stripe reconciliation is cursor-batched and uses a smaller maximum batch.
- Appointment reminders cap each run and use a database lock to prevent overlapping processors.
- GitHub Actions scheduled-job authentication is independent of user sessions and remains cryptographically validated.

These controls protect memory and database concurrency. They do not replace load testing at the target scale.

## Before publishing a user-capacity number

Run a production-like load test against an isolated environment with the same Wasmer compute shape and a database tier representative of production. Measure at minimum:

1. concurrent active users and requests/second;
2. p50/p95/p99 API latency;
3. HTTP 4xx/5xx/timeout rate;
4. active/queued MySQL connections and connection-acquisition latency;
5. slow-query rate and query execution plans;
6. MySQL CPU, memory, IOPS, storage growth, and lock waits;
7. application CPU/memory/event-loop delay;
8. Redis/Valkey rate-limit health when enabled;
9. Stripe/Resend/Web Push provider response and throttling behavior;
10. scheduled-job duration as eligible row counts increase.

A defensible capacity statement should be phrased as a tested workload, for example: “N concurrent sessions at R requests/second with p95 under X ms on deployment tier Y,” not simply “N registered users.”

## Scale triggers

Increase capacity when sustained metrics approach agreed thresholds, not after users start receiving errors. Recommended initial operational triggers:

- database active connections consistently above 70–75% of the safe connection budget;
- p95 API latency above the service objective for multiple measurement windows;
- meaningful connection-acquisition waits or repeated database timeouts;
- scheduled jobs approaching their scheduling interval;
- CPU/IO saturation or persistent queueing;
- error rate materially above the normal baseline.

When triggered, first identify whether the bottleneck is HTTP compute, SQL/query/index efficiency, DB capacity, or a third-party provider. Scale the constrained layer rather than increasing every limit.

## Production evidence still required

Repository review can verify schema, indexes, bounded pools, cursor processing, and tests. It cannot determine the live provider's `max_connections`, current storage/IOPS, row counts, or measured concurrent-user capacity without access to the actual production database/Wasmer metrics. Those values should be captured during provider capacity acceptance and updated whenever the infrastructure tier changes.
