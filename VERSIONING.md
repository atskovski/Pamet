# Pamet versioning policy

Pamet uses semantic versioning from the normalized `v1.0.4` baseline. The current release is `v1.2.0`.

- The next patch release is `v1.2.1`.
- Increment the patch number for compatible fixes, security hardening, copy, styling, tests, and small workflow improvements.
- Increment the minor number for a substantial backward-compatible capability such as account recovery, encrypted multi-device sync, or FHIR export.
- Increment the major number only for an intentionally breaking data, API, authentication, or deployment migration.

Every release must update `package.json`, the root package-lock metadata, the server health version, visible footer, feedback payload version, service-worker cache key and asset query, README, changelog, and release assertions. Git tags and release titles use the `v` prefix; package metadata does not.
