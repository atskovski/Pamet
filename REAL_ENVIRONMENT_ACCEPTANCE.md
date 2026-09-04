# Pamet Real-Environment Acceptance

This document records evidence from the deployed Pamet environment. CI proves code-level behavior against disposable infrastructure; this record proves what the actual production provider is serving.

Production target: `https://pamet.wasmer.app`
Expected repository release: **1.6.3**

## Automated public checks

Run:

```sh
npm run check:live
# or
PAMET_BASE_URL=https://pamet.wasmer.app npm run check:live
```

The live checker should verify:

- application shell responds successfully;
- root response `X-Pamet-Version` matches `package.json`;
- server-rendered HTML contains the exact current Settings release identity;
- JS/CSS URLs carry the current release cache-buster;
- `/api/health` returns HTTP 200, `ok=true`, and version `1.6.3`;
- `/api/ready` returns HTTP 200, `launchReady=true`, and version `1.6.3`;
- health/readiness response headers identify the same release;
- required production dependencies report healthy;
- public billing config is consistent with the intended catalog;
- protected APIs reject unauthenticated access correctly.

GitHub runs `.github/workflows/live-acceptance.yml` after pushes to `main`, on schedule, and on manual dispatch when the environment is reachable.

## 1.6.3 deployment-specific checks

This release includes visible branding, navigation, history-comparison, PDF sharing, and responsive care-workspace changes. After Wasmer promotes 1.6.3, confirm all of the following with a normal browser session that previously used Pamet:

- [ ] `/api/health` and `/api/ready` both report `1.6.3`.
- [ ] Settings and Privacy, Safety & Support show `Pamet v1.6.3`.
- [ ] The browser registers `sw.js?v=1630` with the current worker.
- [ ] The active cache is `pamet-shell-v163-1`.
- [ ] CSS/JS shell requests use the `v=163` release token.
- [ ] A normal refresh updates the installed PWA without clearing local journal data.
- [ ] The refreshed Pamet mark appears on login, the top app bar, and installed PWA icon surfaces.
- [ ] The top-right quick profile shortcut is available and opens the profile-switch flow.
- [ ] Settings and care workflow labels use sentence case consistently.
- [ ] Health history over time offers 30/90/180-day comparisons and clearly states that observations are based on user-entered information.
- [ ] Health-history, caregiver, and primary-care summary flows can be printed/saved as PDF where applicable.
- [ ] Primary care access opens one consolidated visit-brief flow rather than duplicate popups.
- [ ] Appointment Workspace does not overlap, clip, or obscure fields/content at supported desktop and mobile widths.
- [ ] Dark-mode Insights Data Completeness uses a dark surface rather than a white card.
- [ ] Dark-mode empty Insights state uses a dark surface rather than a white card.
- [ ] Primary headings are near-white and readable; secondary labels remain clearly legible.
- [ ] Progress tracks/fills, chips, filters, forms, links, and focus states remain distinguishable in dark mode.
- [ ] No CSP error prevents the production bundle, styles, or service worker from loading.

## Broader controlled production acceptance

Use synthetic, clearly labeled test data and controlled accounts. Do not use real medical information for release acceptance.

- [ ] Login persists across a normal reload and logout invalidates the active session.
- [ ] Sign out everywhere revokes controlled sessions.
- [ ] Password reset works once through the controlled acceptance mailbox.
- [ ] MFA enrollment/verification/disable works.
- [ ] Device inventory loads and a secondary controlled device can be revoked.
- [ ] A synthetic health entry saves only after valid submission and appears in history.
- [ ] CSV/JSON export contains expected synthetic data without formula-injection behavior.
- [ ] Controlled Pro/Ultra live billing flow is exercised end to end before broad production assurance.
- [ ] A controlled caregiver/provider share can be created, opened, and revoked.
- [ ] Web Push subscription and a controlled reminder succeed on a supported browser/device.
- [ ] Grafana/log drain receives a known acceptance event and metrics are visible.
- [ ] Alert destination receives a controlled non-destructive test alert.
- [ ] Provider backup/PITR restore is exercised separately with measured RPO/RTO evidence.

## Acceptance rules

A code merge or green CI run does not, by itself, mark a production-only item complete. Each environment-specific item is complete only after direct evidence exists from the deployed provider/account/device involved.

Do not expose Stripe secrets, email API keys, database credentials, recovery keys, MFA secrets, or other production secrets in this document, GitHub issues, screenshots, or test logs.
