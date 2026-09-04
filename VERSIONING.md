# Pamet versioning policy

Pamet uses semantic versioning (`MAJOR.MINOR.PATCH`). The current stable release line is `v1.6.2`.

## When to increment

- **PATCH** — compatible bug fixes, security hardening, copy/styling changes, cache invalidation, tests, reliability improvements, small workflow changes, and production stabilization. Example: `1.6.1 → 1.6.2`.
- **MINOR** — a substantial backward-compatible capability or product expansion. Example: `1.6.2 → 1.7.0` for a major new user-facing capability.
- **MAJOR** — an intentionally breaking data, API, authentication, or deployment migration that requires coordinated client or user migration.

## Release source of truth

`package.json` is the canonical application release version. The production edge reads it directly for `/api/health` and operational release identity. The browser bundle carries the same release value for visible release text, feedback metadata, and service-worker registration.

Active browser source files are feature-owned rather than release-numbered. Historical release numbers belong in Git history and `CHANGELOG.md`. Compatibility values such as the mobile contract's `minimumBackendVersion` may intentionally remain older than the current release and must not be mistaken for a stale user-facing application version.

## Required release updates

Every release must update or verify:

1. `package.json`
2. production `/api/health` release identity
3. browser runtime release identity
4. service-worker cache key, registration token, and static shell asset token
5. user-facing Settings / Privacy, Safety & Support release text
6. README current-state section
7. `CHANGELOG.md`
8. mobile contract backend version while preserving intentional compatibility minimums
9. release/version CI assertions
10. dependency audit, unit/security tests, integration tests, and backup/restore drill

The release CI derives the PWA asset token from the semantic version and fails when the browser worker registration, shell cache, or CSS/JS shell URLs do not rotate with the current release. This prevents a valid source change from being hidden behind an older cache identity.

Git tags and release titles use the `v` prefix (`v1.6.2`). Package metadata and API version values do not.

## Release discipline

A version is not considered stable merely because code was merged. A stable release requires green CI plus a post-deployment smoke check. Production-only and external assurance gates remain tracked separately in `PRODUCTION_READINESS.md` and must not be represented as complete until evidence exists.
