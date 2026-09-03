# Pamet browser-data threat model — v1.6.1

Reviewed: 2026-09-03  
Release baseline: Pamet 1.6.1

Pamet is local-first. The working browser journal is **not end-to-end encrypted at rest on the local device**. Journal entries and profile data are stored in browser storage for the signed-in browser profile. Account authentication controls access through Pamet's interface, but it does not encrypt the underlying working local journal records.

This design reduces routine server-side exposure because the complete working journal is not automatically uploaded in plaintext. It does **not** protect journal data from malware, a malicious browser extension, operating-system account access, browser developer tools, an unlocked shared device, or an origin-level script compromise. Explicit sharing and configured email summaries transmit selected user-approved content to backend services over TLS.

Pamet 1.6.1 retains the Ultra encrypted-sync framework. The browser derives a profile-specific AES-256-GCM key from user-held recovery material, uses unique nonces, and uploads encrypted journal sync blobs with revision controls. The server can observe account/profile identifiers, ciphertext size, revision, and timing but is designed not to possess the content-decryption key. The recovery material is intentionally not recoverable by Pamet.

Encrypted sync and encrypted local storage are separate security properties. The working browser copy remains readable by the browser origin, so encrypted sync does not mitigate origin compromise, a malicious browser extension, or local device compromise. Pamet must not market the working journal as independently reviewed end-to-end encryption until the external cryptographic and penetration-review gates are complete.

## Browser execution boundary

Pamet 1.6.1 retains the script/style CSP hardening introduced in 1.6.0: the production Content Security Policy removes script/style `unsafe-inline`, blocks inline script and style attributes, and builds the production browser bundle through a strict-CSP guard that rejects reintroduced inline presentation attributes in generated code. These controls reduce injection surface; they do not constitute an independent penetration test and they do not protect against every same-origin or compromised-dependency scenario.

The secure edge and inner application runtime both source release identity from `package.json`, so health/readiness, telemetry, browser release checks, and operational events share the same canonical release identity rather than relying on a historical hard-coded inner-server version.

## Authentication and session boundary

Pamet 1.6.1 uses the secure server/session model as the production path, including password hashing, revocable sessions/devices, MFA/TOTP, account recovery controls, and server-side entitlement enforcement. Legacy compatibility authentication remains governed by [`LEGACY_AUTH_SUNSET.md`](LEGACY_AUTH_SUNSET.md) and should be removed only after its migration evidence is satisfied.

## Local working-journal encryption design gate

Before Pamet encrypts the working local journal, the key hierarchy, migration behavior, device unlock model, password-reset behavior, and lost-key recovery semantics are governed by [`LOCAL_ENCRYPTION_THREAT_MODEL.md`](LOCAL_ENCRYPTION_THREAT_MODEL.md) and [`LOCAL_ENCRYPTION_IMPLEMENTATION_PLAN.md`](LOCAL_ENCRYPTION_IMPLEMENTATION_PLAN.md).

The approved architectural direction is to keep account authentication separate from content encryption: a random per-profile data-encryption key is wrapped by user-held recovery material and, where supported, a device-local wrapping key. A normal account password reset must not become a decryption backdoor. If every trusted device and the user's recovery material are lost, historical encrypted content is intentionally unrecoverable rather than recoverable by Pamet support.

No product claim that the working journal is "encrypted at rest", "end-to-end encrypted", independently audited, HIPAA compliant, or otherwise externally certified should be made until the corresponding implementation, legal, contractual, and independent-review gates are complete.

## Current open assurance gates

- Independent mobile/web penetration testing.
- Independent WCAG 2.2 AA accessibility review.
- Independent cryptographic review before enabling encrypted working-journal storage.
- Provider-level production backup/PITR restore evidence with measured and recorded RPO/RTO.
- Live billing acceptance evidence for production Stripe mode.
- Final privacy/legal determination for applicable HIPAA, BAA/DPA, retention, and consumer-health-data obligations.

See [`GO_LIVE_STATUS.md`](GO_LIVE_STATUS.md), [`PRODUCTION_READINESS.md`](PRODUCTION_READINESS.md), and [`ASSURANCE_HANDOFF.md`](ASSURANCE_HANDOFF.md) for the current release gate status.
