# Pamet 1.2.1 Release Status

This is the concise engineering status ledger for the current stabilization release. `README.md` is the product/current-state overview; `CHANGELOG.md` is historical; `PRODUCTION_READINESS.md` contains detailed launch gates.

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

## Required before merge to main

- `npm run check` green.
- Unit/security/UI/local-crypto tests green.
- Dependency audit green at configured severity.
- MySQL integration lifecycle green.
- Backup/restore CI drill green.

## Required after deployment before calling the deployed release stable

- `/api/health` returns 200 with version `1.2.1`.
- `/api/ready` returns 200 and required dependencies are healthy.
- Login/create-account/password-reset smoke test.
- Account Security/MFA/device-management smoke test.
- Log/save/history/export smoke test on desktop and phone-width viewport.
- PWA/service-worker registration smoke test with no CSP-blocked registration dependency.
- Controlled billing and push exercises as described in `STAGING_ACCEPTANCE.md` when using those production capabilities.

## External / production-only gates still open

- Provider backup/PITR restore with measured RPO/RTO.
- Independent penetration test and remediation closure.
- Independent WCAG 2.2 AA/screen-reader/keyboard/reflow review.
- Privacy/legal/vendor-agreement review for the deployed use case.
- Legacy bearer compatibility retirement after measured sunset criteria.
- Final CSP inline-style migration.
- Independent local-encryption review and migration/recovery/key-loss acceptance before enabling encrypted local journal storage.

These open gates are not defects hidden by the release number; they are explicitly tracked assurance work and must remain visible until evidence exists.
