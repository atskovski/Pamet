# Pamet 1.2.1 Release Status

This is the concise engineering status ledger for the current stabilization release. `README.md` is the product/current-state overview; `CHANGELOG.md` is historical; `PRODUCTION_READINESS.md` contains detailed launch gates; `REAL_ENVIRONMENT_ACCEPTANCE.md` records deployed-environment evidence.

## Release candidate

- Version: **1.2.1**
- Release type: **PATCH / stabilization**
- Goal: improve reliability, mobile/security UX, release discipline, and production evidence without introducing a breaking architecture change.

## Completed in code/repository

- Account Security and recovery modal centering/mobile hardening.
- Password-reset async form crash fix.
- Legacy authorized-account migration to normal password/session auth.
- Sign out everywhere and device/session controls.
- Safe local-data isolation when switching accounts.
- Authenticator MFA with fresh locally generated QR and verification gate.
- Five-second prominent feedback confirmation.
- CSP executable-inline-script hardening.
- CSP-compatible external PWA service-worker registration.
- Fresh 1.2.1 service-worker cache and sensitive route cache bypass.
- MySQL-backed lifecycle integration coverage.
- Backup → isolated restore CI drill.
- Disabled/review-gated local journal encryption framework and recovery tests.
- Semantic versioning rules and automated version consistency gate.
- README current-state/future-state dashboard and updated changelog.
- Production startup now rebuilds the browser bundle before serving traffic.
- Settings version reconciles against the deployed `/api/health` version rather than trusting a stale bundle alone.
- `/api/ready` version is normalized at the production edge to the canonical package release.
- Repeatable `npm run check:live` real-environment acceptance checker.

## Required before merge to main

- `npm run build` green.
- `npm run check` green.
- Unit/security/UI/local-crypto tests green.
- Dependency audit green at configured severity.
- MySQL integration lifecycle green.
- Backup/restore CI drill green.

## Current deployed-environment evidence

Collected against `https://pamet.wasmer.app` before this fix branch:

- `/api/health`: **PASS**, HTTP 200, version **1.2.1**.
- `/api/ready` dependency health: **PASS**, HTTP 200, `launchReady=true`; database, distributed rate limit, push, email, log drain, metrics, alerts, and identity encryption healthy.
- Billing/email public configuration: **PASS**, Pro enabled, Ultra enabled, email enabled.
- Unauthenticated entitlements/device/sharing APIs: **PASS**, fail closed with HTTP 401.
- Health/readiness version agreement: **FAIL before fix** (`1.2.1` vs `1.2.0`).
- Settings footer version: **FAIL before fix**, rendered `Pamet v1.1.0` because the deployed browser bundle was stale.

The two version failures above are the specific deployment defects addressed by the current branch and must be re-tested after deployment.

## Required after deployment before calling the deployed release stable

- `npm run check:live` passes against production.
- `/api/health` and `/api/ready` both return 200 and the same current version.
- Settings footer renders `Pamet v1.2.1 · Your health history, finally useful.`.
- Login/create-account/password-reset smoke test.
- Account Security/MFA/device-management smoke test.
- Log/save/history/export smoke test on desktop and phone-width viewport.
- PWA/service-worker registration smoke test with no CSP-blocked registration dependency.
- Controlled billing, sharing, push, observability, and alert exercises documented in `REAL_ENVIRONMENT_ACCEPTANCE.md`.

## External / production-only gates still open

- Provider backup/PITR restore with measured RPO/RTO.
- Independent penetration test and remediation closure.
- Independent WCAG 2.2 AA/screen-reader/keyboard/reflow review.
- Privacy/legal/vendor-agreement review for the deployed use case.
- Legacy bearer compatibility retirement after measured sunset criteria.
- Final CSP inline-style migration.
- Independent local-encryption review and migration/recovery/key-loss acceptance before enabling encrypted local journal storage.

These open gates are not defects hidden by the release number; they are explicitly tracked assurance work and must remain visible until evidence exists.
