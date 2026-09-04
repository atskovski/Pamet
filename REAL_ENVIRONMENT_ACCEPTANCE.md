# Pamet Real-Environment Acceptance

This document records evidence required from the deployed Pamet environment. CI proves code behavior against disposable infrastructure; this record proves what the actual provider is serving.

Production target: `https://pamet.wasmer.app`  
Expected repository release: **1.6.6**

## Automated public checks

Run:

```sh
npm run check:live
# or
PAMET_BASE_URL=https://pamet.wasmer.app npm run check:live
```

The live checker should verify application shell/version, strict security headers, `/api/health`, `/api/ready`, production dependency readiness, billing public configuration, and protected-API rejection behavior.

GitHub runs `.github/workflows/live-acceptance.yml` after pushes to `main`, on schedule, and manually when needed.

## 1.6.4 deployment-specific checks

After Wasmer promotes 1.6.4, confirm:

- [ ] `/api/health` and `/api/ready` report `1.6.4`.
- [ ] Settings and Privacy, Safety & Support show `Pamet v1.6.4`.
- [ ] Browser registration uses `sw.js?v=1640`.
- [ ] Active PWA cache uses a `pamet-shell-v164-*` identity.
- [ ] CSS/JS shell requests use `v=164`.
- [ ] Existing installed clients update without clearing local journal data.
- [ ] **Compare Pamet plans** shows canonical Free / Pro / Ultra pricing/copy and exposes the green **See full Free, Pro & Ultra feature matrix** action.
- [ ] Full plan matrix is readable on desktop and horizontally scrollable on narrow mobile screens.
- [ ] Notification health **Check again** shows checking progress, updates permission/subscription status, and reports completion or error.
- [ ] Notification repair wording matches the actual state: enable permission, explain browser/OS block, or repair subscription.
- [ ] Notification health states that it does not read or send health-journal content.
- [ ] `/api/jobs/oidc-ready` returns HTTP 200 and reports `keySource` as `network` or `bundled`.
- [ ] `Pamet scheduled job auth acceptance` succeeds for the merged production SHA.
- [ ] Push-reminder/weekly-digest/Stripe-reconciliation jobs authenticate successfully on their next controlled/scheduled run.
- [ ] The scale-index migration has been applied to the production database and all four 1.6.4 indexes are present.
- [ ] No CSP error prevents the production bundle, styles, plan dialog, or service worker from loading.

## Database capacity evidence

Repository code cannot determine live production capacity without provider data. Record these values from the actual MySQL/Wasmer environment before publishing a concurrency claim:

- [ ] MySQL `max_connections` and configured operational reserve.
- [ ] Current app replica count and configured pool limits.
- [ ] Current user/session/push/appointment row counts.
- [ ] Storage utilization and growth trend.
- [ ] DB CPU/IOPS/lock waits/slow-query baseline.
- [ ] p50/p95/p99 API latency and request error rate under a production-like load test.
- [ ] Active/queued DB connections and connection acquisition latency under that load.
- [ ] Scheduled-job duration at representative eligible-row counts.

See `docs/SCALING_AND_CAPACITY.md` for the capacity formula and thresholds.

## Broader controlled production acceptance

Use synthetic, clearly labeled test data and controlled accounts. Do not use real medical information for release acceptance.

- [ ] Login persists across reload; logout and Sign out everywhere revoke controlled sessions.
- [ ] Password reset and MFA lifecycle work through controlled test identities.
- [ ] Device inventory loads and a secondary controlled device can be revoked.
- [ ] Synthetic health entries save only after valid submission and appear in history/export.
- [ ] Controlled Pro and Ultra billing lifecycle is exercised end to end (#46).
- [ ] Controlled caregiver/provider share can be created, opened and revoked.
- [ ] Web Push subscription and controlled reminder succeed on a supported device.
- [ ] Grafana/log drain receives known acceptance telemetry.
- [ ] Alert destination receives and acknowledges a controlled test alert (#49).
- [ ] Provider backup/PITR restore is exercised with measured RPO/RTO (#47).

## Acceptance rules

A code merge or green CI run does not mark a production-only or independent item complete. Each environment-specific item is complete only after direct evidence exists from the provider/account/device involved.

Do not expose Stripe secrets, email API keys, database credentials, recovery keys, MFA secrets, GitHub tokens, or other production secrets in this document, issues, screenshots, or test logs.
