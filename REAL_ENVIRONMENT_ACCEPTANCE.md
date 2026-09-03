# Pamet Real-Environment Acceptance

This document is the release acceptance record for the deployed Pamet environment. It complements CI: CI proves code-level behavior against disposable infrastructure; this record proves what the actual deployed environment is serving.

Production target: `https://pamet.wasmer.app`
Expected repository release: **1.2.2**
Expected main commit at time of this update: `e93ac82afbb1d4d3280321bdd818626da0872076`

## Automated public checks

Run:

```sh
npm run check:live
# or
PAMET_BASE_URL=https://pamet.wasmer.app npm run check:live
```

The checker now verifies deployment identity, not only service health:

- application shell responds successfully;
- the root response has `X-Pamet-Version` matching `package.json`;
- server-rendered HTML contains the exact current Settings footer;
- JS/CSS URLs carry the expected release cache-buster;
- `/api/health` returns HTTP 200, `ok=true`, and the exact repository release;
- `/api/ready` returns HTTP 200, `launchReady=true`, and the exact repository release;
- health/readiness response headers also identify the expected release;
- database, distributed rate limiting, Web Push, email, log drain, metrics, alerts, and identity encryption are all healthy;
- public billing config reports Pro, Ultra, and email enabled;
- entitlements, device management, and sharing APIs return 401 without authentication.

GitHub also runs `.github/workflows/live-acceptance.yml` after pushes to `main`, hourly, and on manual dispatch. The workflow gives production a bounded convergence window and then fails if Wasmer is still serving a different release.

## Evidence collected

### 2026-09-03 — after Pamet 1.2.2 merged to main

| Check | Result | Evidence / note |
|---|---|---|
| Repository release | PASS | `package.json` is 1.2.2 and PR #23 merged to `main` as `e93ac82afbb1d4d3280321bdd818626da0872076`. |
| Repository quality gate | PASS | Production build, release checks, unit/security/UI tests, and dependency audit passed. |
| Repository lifecycle gate | PASS | MySQL lifecycle integration and disposable backup → isolated restore drill passed. |
| Live application shell | PASS | Production remains reachable. |
| Live `/api/health` | **BLOCKED / STALE DEPLOYMENT** | Force-fresh check after the merge still returned version `1.2.1`; expected `1.2.2`. |
| Live `/api/ready` | **BLOCKED / STALE DEPLOYMENT** | Must be rechecked after Wasmer promotes current `main`; 1.2.2 edge normalizes this version when deployed. |
| Live Settings footer | **BLOCKED / STALE DEPLOYMENT** | Must show exactly `Pamet v1.2.2 · Your health history, finally useful.` after current `main` is deployed. |
| Wasmer/GitHub synchronization | **BLOCKED** | Repository contains no Wasmer deployment workflow/config that controls the external Git integration. Wasmer must be connected to `atskovski/Pamet`, production branch `main`, and promote the current head. Issue #22 tracks this provider-side gate. |

Earlier public checks already confirmed the currently running environment has healthy database, distributed rate limiting, Web Push configuration, email, log drain, metrics, alerts, identity encryption, enabled Pro/Ultra billing, and correct unauthenticated 401 boundaries. Those dependency checks must be rerun on 1.2.2 once deployment convergence occurs.

## Post-deploy acceptance required for 1.2.2

After Wasmer promotes the current `main`, repeat and record the date/results:

- [ ] `npm run check:live` passes with no failures.
- [ ] Root response `X-Pamet-Version` is `1.2.2`.
- [ ] `/api/health` and `/api/ready` both report `1.2.2`.
- [ ] Settings footer renders exactly `Pamet v1.2.2 · Your health history, finally useful.`.
- [ ] Browser console shows no CSP error preventing the production bundle or service-worker registration.
- [ ] Service worker is registered and `pamet-shell-v122-0` is active.
- [ ] Login with a controlled acceptance account succeeds and persists across a normal reload.
- [ ] Logout invalidates the active session.
- [ ] Sign out everywhere revokes all controlled sessions and returns the browser to a usable login/account-creation state.
- [ ] Password reset email is delivered to the controlled acceptance mailbox and the reset link works once.
- [ ] Account Security opens; MFA enrollment/verification works; disabling MFA works.
- [ ] Authorized-device inventory loads and a secondary controlled device can be revoked.
- [ ] A new synthetic health entry saves only after valid submission and appears in history.
- [ ] CSV and JSON exports contain the expected synthetic test entry and no formula-injection behavior.
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
