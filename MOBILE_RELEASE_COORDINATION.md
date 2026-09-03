# Pamet production → iOS / Android release coordination

Release baseline: Pamet 1.5.1

Production `atskovski/Pamet` is the source of truth for backend behavior, plan entitlements, privacy/safety boundaries, and `contracts/mobile-api.json`. `Pamet-iOS` and `Pamet-Android` are native clients, not copies of the web source tree.

## Safe synchronization model

Pamet should **not** blindly copy web JavaScript/CSS into native repositories. Production changes fall into three categories:

1. **Backend/API or entitlement changes** — update `contracts/mobile-api.json`; both native repos must ingest the new contract, validate live `/api/health`, and run their full CI gates.
2. **Product/safety/copy changes** — reflect the behavior and wording natively, then validate each platform's UI/accessibility/security separately.
3. **Web-only implementation changes** — do not port source code unless the native product behavior actually changes.

This prevents a web release from silently breaking native clients or introducing platform-inappropriate code.

## Automation

- Production CI validates the authoritative mobile contract.
- Production `main` can dispatch `pamet-production-updated` events to both private native repositories when the optional `MOBILE_SYNC_TOKEN` repository secret is configured with minimal Actions/contents permissions for those repos.
- Each native repository also runs a scheduled contract/live-health check, so contract drift is detected even if cross-repository dispatch is not configured.
- Native contract synchronization triggers native CI; a contract update is not considered release-ready until unit tests, lint/static analysis, and release compilation/build pass.

Do not paste or commit the cross-repository token. Configure it only as a GitHub Actions repository secret.

## Required native checks after a production change

### iOS

- Contract/version validation.
- iPhone simulator build and tests.
- Release configuration compile with signing disabled in CI.
- Session/cookie and entitlement regression tests.
- Safety copy and non-diagnostic wording review.
- Swift concurrency/compiler warnings review.
- Accessibility review for changed screens.
- App Store signing/archive/TestFlight checks before store submission.

### Android

- Contract/version validation.
- Unit tests.
- Debug + release lint.
- Debug + minified/shrunk release build.
- Room migration/schema review when local data changes.
- Keystore/session persistence regression checks.
- Safety copy and non-diagnostic wording review.
- Accessibility/TalkBack review for changed screens.
- Signed AAB + Play pre-launch checks before store submission.

## Release parity rule

A native release may intentionally lag a web feature, but the gap must be explicit in the native `PRODUCTION_READINESS.md`. Native clients must never silently grant paid capabilities locally, weaken authentication/session behavior, or make stronger medical/privacy/security claims than production.

## Versioning

- Backend/web release: semantic version in production `package.json`.
- Mobile API contract: independent integer `contractVersion` plus `backendVersion`.
- iOS: `MARKETING_VERSION` follows the Pamet product release baseline; build number increments independently.
- Android: `versionName` follows the Pamet product release baseline; `versionCode` increments independently.

A product version bump should update production documentation and mobile contract metadata in the same release PR whenever native compatibility is affected.
