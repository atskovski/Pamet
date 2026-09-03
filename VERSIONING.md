# Pamet versioning policy

Pamet uses semantic versioning (`MAJOR.MINOR.PATCH`). The current stable release is `v1.2.1`.

## When to increment

- **PATCH** — compatible bug fixes, security hardening, copy/styling changes, tests, reliability improvements, small workflow changes, and production stabilization. Example: `1.2.0 → 1.2.1`.
- **MINOR** — a substantial backward-compatible capability or product expansion. Example: `1.2.1 → 1.3.0` for a major new user-facing capability.
- **MAJOR** — an intentionally breaking data, API, authentication, or deployment migration that requires coordinated client or user migration.

## Release source of truth

`package.json` is the canonical application release version. The production edge reads it directly for `/api/health` and operational release identity. The browser bundle carries the same release value for visible release text, feedback metadata, and service-worker registration.

Historical source filenames such as `v1.0.3.js` or `security-v1.1.0.js` describe the feature layer where that module originated; they are not the current application version and should not be renamed solely for a patch release.

## Required release updates

Every release must update or verify:

1. `package.json`
2. production `/api/health` release identity
3. browser runtime release identity
4. service-worker cache key / registration version
5. README current-state section
6. `CHANGELOG.md`
7. release/version CI assertions
8. dependency audit, unit/security tests, integration tests, and backup/restore drill

Git tags and release titles use the `v` prefix (`v1.2.1`). Package metadata and API version values do not.

## Release discipline

A version is not considered stable merely because code was merged. A stable release requires green CI plus a post-deployment smoke check. Production-only and external assurance gates remain tracked separately in `PRODUCTION_READINESS.md` and must not be represented as complete until evidence exists.
