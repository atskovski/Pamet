# Pamet Real-Environment Acceptance

This document is the release acceptance record for the deployed Pamet environment. It complements CI: CI proves code-level behavior against disposable infrastructure; this record proves what the actual deployed environment is serving.

Production target: `https://pamet.wasmer.app`

## Automated public checks

Run:

```sh
npm run check:live
# or
PAMET_BASE_URL=https://pamet.wasmer.app npm run check:live
```

The checker verifies:

- application shell responds successfully;
- `/api/health` returns HTTP 200, `ok=true`, and a semantic version;
- `/api/ready` returns HTTP 200 with `launchReady=true`;
- health and readiness report the same release version;
- database, distributed rate limiting, Web Push, email, log drain, metrics, alerts, and identity encryption are all healthy;
- public billing config reports Pro, Ultra, and email enabled;
- entitlements, device management, and sharing APIs return 401 without authentication.

## Evidence collected before this fix

Live checks were run against Wasmer on 2026-09-02.

| Check | Result | Evidence / note |
|---|---|---|
| Application shell | PASS | HTTP 200 and login/create-account UI rendered. |
| `/api/health` | PASS | HTTP 200, `{ "ok": true, "version": "1.2.1" }`. |
| `/api/ready` dependencies | PASS | HTTP 200, `ok=true`, `launchReady=true`; database, distributed rate limit, push, email, log drain, metrics, alerts, and identity encryption all reported healthy. |
| Health/readiness version consistency | FAIL before fix | Health reported `1.2.1`; readiness reported `1.2.0`. This branch normalizes readiness at the production edge. |
| Pro billing configured | PASS | Public billing config reported `proEnabled=true`. |
| Ultra billing configured | PASS | Public billing config reported `ultraEnabled=true`. |
| Email configured | PASS | Public billing config reported `emailEnabled=true`. |
| Unauthenticated entitlements | PASS | `/api/entitlements` returned HTTP 401 `Authentication required.` |
| Unauthenticated device management | PASS | `/api/security/devices` returned HTTP 401 `Authentication required.` |
| Unauthenticated sharing | PASS | `/api/sharing/invites` returned HTTP 401 `Authentication required.` |
| Settings footer version | FAIL before fix | JavaScript-rendered Settings UI displayed `Pamet v1.1.0` even though health reported 1.2.1. Root cause: stale deployed production bundle. This branch rebuilds the bundle before start and reconciles the Settings footer against `/api/health`. |

## Post-deploy acceptance required for this branch

After this change reaches production, repeat the following and record the date/results:

- [ ] `npm run check:live` passes with no failures.
- [ ] `/api/health` and `/api/ready` both report `1.2.1`.
- [ ] Settings footer renders exactly `Pamet v1.2.1 · Your health history, finally useful.`.
- [ ] Browser console shows no CSP error preventing the production bundle or service-worker registration.
- [ ] Service worker is registered and the current shell cache is active.
- [ ] Login with a controlled acceptance account succeeds and persists across a normal reload.
- [ ] Logout invalidates the active session.
- [ ] Password reset email is delivered to the controlled acceptance mailbox and the reset link works once.
- [ ] Account Security opens; MFA enrollment/verification works; disabling MFA works.
- [ ] Authorized-device inventory loads and a secondary controlled device can be revoked.
- [ ] A new health entry saves only after valid submission and appears in history.
- [ ] CSV and JSON exports contain the expected controlled test entry and no formula-injection behavior.
- [ ] Pro/Ultra checkout opens the intended live Stripe catalog using a controlled production test purchase process.
- [ ] Subscription entitlement changes appear server-side after the relevant Stripe event.
- [ ] Billing portal opens for the controlled subscribed account.
- [ ] A controlled caregiver/provider share can be created, opened, and revoked; revoked link no longer resolves.
- [ ] Web Push subscription succeeds on a supported device/browser and a controlled reminder reaches the device.
- [ ] Grafana/log drain receives a known acceptance event and metrics are visible.
- [ ] Alert destination receives a controlled non-destructive test alert.
- [ ] Provider backup/PITR restore drill is completed separately with measured RPO/RTO evidence before broad production assurance.

## Acceptance rules

A code merge or green CI run does not, by itself, mark a production-only item complete. Each environment-specific item should be marked complete only after direct evidence exists from the deployed provider/account/device involved.

Do not use real medical information for acceptance testing. Use synthetic, clearly labeled test data and controlled accounts. Do not expose Stripe secrets, email API keys, database credentials, recovery keys, MFA secrets, or other production secrets in this document, GitHub issues, screenshots, or test logs.
