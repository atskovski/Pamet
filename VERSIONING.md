# Pamet versioning policy

Pamet uses semantic versioning (`MAJOR.MINOR.PATCH`). The current stable release line is `v1.6.7`.

## When to increment

- **PATCH** — compatible bug fixes, security hardening, copy/styling changes, cache invalidation, tests, reliability improvements, production stabilization, and backward-compatible consistency/scaling controls. Example: `1.6.3 → 1.6.4`.
- **MINOR** — a substantial backward-compatible capability or product expansion. Example: `1.6.4 → 1.7.0` for a major new user-facing capability.
- **MAJOR** — an intentionally breaking data, API, authentication, or deployment migration requiring coordinated client/user migration.

## Release source of truth

`package.json` is the canonical application release version. The production edge reads it directly for `/api/health` and operational release identity. The browser bundle carries the same value for visible release text, feedback metadata, and service-worker registration.

Active browser source files are feature-owned rather than release-numbered. Historical release numbers belong in Git and `CHANGELOG.md`. Compatibility values such as the mobile contract's `minimumBackendVersion` may intentionally remain older than the current release.

## Required release updates

Every release must update or verify:

1. `package.json` and root `package-lock.json` metadata;
2. production `/api/health` release identity;
3. browser runtime release identity;
4. service-worker cache key, registration token, and static shell asset token;
5. user-facing Settings / Privacy, Safety & Support release text;
6. README current-state section and canonical plan matrix generation;
7. `CHANGELOG.md`;
8. mobile contract backend version while preserving intentional compatibility minimums;
9. release/version/CSP/plan/notification/scale/performance CI assertions;
10. dependency audit, unit/security tests, MySQL integration tests, and backup/restore drill;
11. post-merge live Wasmer acceptance, scheduled-job auth acceptance, and admin parity.

The release CI derives the PWA asset token from the semantic version and fails when browser worker registration, shell cache, or CSS/JS shell URLs do not rotate with the current release.

Git tags and release titles use the `v` prefix (`v1.6.6`). Package metadata and API version values do not.

## Release discipline

A version is not stable merely because code was merged. A stable release requires green exact-head CI plus post-deployment acceptance. Production-only and independent assurance gates remain separately tracked in `GO_LIVE_STATUS.md` and `PRODUCTION_READINESS.md` and must not be represented as complete without evidence.
