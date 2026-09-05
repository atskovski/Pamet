# Pamet browser-data threat model — v1.6.4

Current application release: **v1.6.8**. Threat-model assurance remains inherited from the v1.6.6 review baseline; this patch does not claim a new independent review.

Reviewed: 2026-09-04  
Release baseline: Pamet v1.6.4

Pamet is local-first. The working browser journal is **not end-to-end encrypted at rest on the local device**. Journal entries and profile data are stored in browser storage for the signed-in browser profile. Account authentication controls access through Pamet's interface, but it does not encrypt the underlying working local journal records.

This design reduces routine server-side exposure because the complete working journal is not automatically uploaded in plaintext. It does **not** protect journal data from malware, malicious browser extensions, operating-system account access, browser developer tools, an unlocked shared device, or an origin-level script compromise. Explicit sharing/configured email summaries transmit selected user-approved content to backend services over TLS.

Pamet 1.6.4 retains the Ultra encrypted-sync framework. The browser derives a profile-specific AES-256-GCM key from user-held recovery material, uses unique nonces, and uploads encrypted journal sync blobs with revision controls. The server can observe account/profile identifiers, ciphertext size, revision and timing but is designed not to possess the content-decryption key. Recovery material is intentionally not recoverable by Pamet.

Encrypted sync and encrypted local storage are separate security properties. The working browser copy remains readable by the browser origin, so encrypted sync does not mitigate origin compromise, a malicious extension, or local device compromise. Pamet must not market the working journal as independently reviewed end-to-end encryption until the external cryptographic and penetration-review gates are complete.

## Browser execution boundary

Pamet 1.6.4 retains the script/style CSP hardening introduced in 1.6.0: the production Content Security Policy removes script/style `unsafe-inline`, blocks inline script/style attributes, and builds the production browser bundle through a strict-CSP guard that rejects reintroduced inline presentation attributes in generated code. These controls reduce injection surface; they are not an independent penetration test.

The secure edge and inner application runtime source release identity from `package.json`, so health/readiness, telemetry, browser release checks and operational events share one canonical release identity.

The full plan comparison is generated from a non-secret canonical catalog. Plan metadata never grants entitlement; the server remains authoritative for paid capability checks.

## Authentication and session boundary

Pamet 1.6.4 uses the secure server/session model as the production path, including password hashing, revocable sessions/devices, MFA/TOTP, account recovery and server-side entitlement enforcement. Legacy compatibility authentication remains governed by `LEGACY_AUTH_SUNSET.md` and should be removed only after migration evidence is satisfied.

Scheduled GitHub Actions jobs use a separate machine-authentication boundary. OIDC JWTs are checked for GitHub issuer, Pamet-specific audience, expiration/not-before, exact repository, main branch, allowed event, allowed workflow reference and RSA signature. The verifier prefers GitHub's live JWKS. If the production provider cannot reach that endpoint, it can fall back to a repository-bundled copy of GitHub's **public** RSA signing keys. Those keys contain no credential or private signing material and are refreshed by GitHub Actions. A stale/unknown `kid` is rejected rather than accepted without signature validation.

## Database and scale boundary

Pamet 1.6.4 adds indexes for recurring digest/push/appointment/audit workloads and validates bounded/cursor-batched background processing. These controls reduce avoidable full scans and memory growth. They do not establish a fixed user-capacity claim: live database `max_connections`, storage/IOPS, application replica count and measured load remain provider evidence.

Increasing per-instance connection pools without coordinating database capacity can create connection exhaustion during autoscaling. `docs/SCALING_AND_CAPACITY.md` defines the connection-budget model.

## Notification boundary

Notification health inspects browser support, permission and Pamet push-subscription state. It does not inspect or transmit journal content. Notification permission remains controlled by the browser/operating system, and denied permissions may require a manual user settings change.

Reminder lock-screen content intentionally avoids health detail such as symptoms, medications, clinicians or diagnoses.

## Local working-journal encryption design gate

Before Pamet encrypts the working local journal, key hierarchy, migration behavior, device unlock model, password-reset behavior and lost-key recovery are governed by `LOCAL_ENCRYPTION_THREAT_MODEL.md` and `LOCAL_ENCRYPTION_IMPLEMENTATION_PLAN.md`.

The architectural direction is to keep account authentication separate from content encryption: a random per-profile data-encryption key is wrapped by user-held recovery material and, where supported, a device-local wrapping key. A normal account password reset must not become a decryption backdoor. If every trusted device and the user's recovery material are lost, historical encrypted content is intentionally unrecoverable rather than recoverable by Pamet support.

No product claim that the working journal is "encrypted at rest", "end-to-end encrypted", independently audited, HIPAA compliant, or otherwise externally certified should be made until the corresponding implementation, legal, contractual and independent-review gates are complete.

## Current open assurance gates

- Independent web/mobile penetration testing (#43).
- Independent WCAG 2.2 AA accessibility review (#44).
- Qualified privacy/legal determination (#45).
- Controlled production Stripe lifecycle evidence (#46).
- Provider-level production backup/PITR with measured RPO/RTO (#47).
- Independent cryptographic review before enabling encrypted working-journal storage (#48).
- Production alert receipt/acknowledgement/escalation evidence (#49).
- Legacy bearer retirement after production migration evidence (#8).

See `GO_LIVE_STATUS.md`, `PRODUCTION_READINESS.md`, and `ASSURANCE_HANDOFF.md` for the current release gate status.
