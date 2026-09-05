# Pamet Security and Privacy Engineering Notes

Last reviewed: 2026-09-05  
Release baseline: Pamet 1.6.9.

Pamet handles sensitive personal health observations. This document records engineering boundaries of the current web implementation. It is **not** a legal privacy policy, penetration-test result, security certification, HIPAA determination, SOC 2 report, accessibility certification, or representation that an external compliance review has been completed.

## Data and product boundaries

- The working health journal remains local-first in browser storage. Pamet does not currently claim that the working browser copy is end-to-end encrypted. `PAMET_FEATURE_ENCRYPTED_JOURNAL` remains disabled pending independent cryptographic review (#48).
- Server-side services receive data needed for account authentication, billing, explicitly initiated sharing/sync/email/calendar actions, notifications, feedback, and operations.
- User-initiated caregiver/provider sharing can place a selected snapshot on the server for access through a revocable/expiring share.
- Ultra encrypted sync stores opaque encrypted payloads plus the metadata required to authorize/version them; the working browser-storage encryption project is a separate feature boundary.
- When a user chooses to email a Visit Brief, Pamet generates/sends the health summary as a PDF attachment through the configured email provider. Health-summary details are intentionally kept out of the email body, but the attachment itself contains the user-selected health information.
- Calendar handoffs occur only when initiated by the user and may transmit appointment/event information to the selected calendar provider.
- Pamet does not provide emergency monitoring, diagnosis, medication recommendations, or clinical escalation.

## Authentication and sessions

Pamet now uses server-side account authentication. Password-based account operations transmit the password to the Pamet backend over HTTPS for registration/login/password-change/reset processing. Passwords are not stored in plaintext.

- Password hashes use Node.js `scrypt` with a random 16-byte salt and parameters `N=16384`, `r=8`, `p=1`, producing a 64-byte derived value.
- Password verification uses constant-time comparison of derived hashes.
- Password safety controls include minimum-strength validation and a breached-password check using the Have I Been Pwned k-anonymity range API; the full password/hash is not sent to that service.
- Authenticated sessions use random bearer material stored client-side as an `HttpOnly`, `SameSite=Lax` cookie and marked `Secure` in production. The database stores only the session-token hash; sessions expire and may be revoked.
- Device/session management supports revocation/logout-all and controlled migration of legacy device credentials.
- Password-recovery tokens are random, single-use, hashed server-side, time-limited, and invalidated after use.
- TOTP MFA is supported. MFA secrets are stored encrypted using deployment-controlled key material; recovery security still depends in part on the user's email account and configured mail provider.
- OAuth account flows use signed state and server-side session issuance. Provider-specific OAuth behavior must remain within the configured callback/origin allowlists.

Authentication implementation is covered by automated tests, but independent adversarial validation remains gate #43.

## Billing and entitlements

- Stripe secret keys and webhook secrets exist only in server-side environment configuration.
- Payment card fields are handled through Stripe's client/payment interfaces rather than stored by Pamet.
- Server entitlements are derived from verified Stripe subscription state rather than trusted from browser plan state.
- Stripe webhook signatures are verified against the raw request body.
- Webhook event IDs are claimed idempotently before subscription processing.
- Configured Stripe price IDs are verified against Pamet's approved USD amounts and billing intervals before subscription creation.
- The production Stripe webhook is configured to receive `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`, which Pamet uses for subscription synchronization.
- A successful implementation/test-mode flow is not substituted for the controlled live lifecycle evidence required by gate #46.

## Email and notifications

- Transactional email is enabled only when the configured provider/sender is available.
- Weekly digest email is explicit opt-in. Subject lines avoid symptom information, and digest content is deliberately bounded.
- Visit Brief email is an explicit user action; the selected summary is attached as a PDF rather than copied into the email body.
- Push/reminder notifications are designed to avoid symptom, medication, diagnosis, or clinician details on a lock screen.
- Notification endpoints enforce ownership/authentication boundaries and scheduled jobs use protected job authentication.

## Sharing

Caregiver/provider sharing is user-initiated and is not continuous monitoring or a live clinician portal.

- Share tokens use cryptographically secure randomness and only token hashes are stored server-side.
- Share records are scoped to the initiating account/profile and selected permission level.
- Links expire and can be revoked.
- Revocation prevents future Pamet retrieval but cannot retract a copy a recipient already downloaded, printed, or otherwise retained.
- Recipient email addresses and selected share snapshots are server-side data and must be covered by the privacy/legal/vendor review in #45.

## Data minimization and server-side records

Depending on features the user enables/uses, the backend may store:

- account identity/profile metadata;
- password hashes/salts, session/device/recovery/MFA records, and security audit events;
- Stripe customer/subscription identifiers and processed-event IDs;
- sharing recipients, permissions, expiry/revocation state, and explicitly selected snapshots;
- digest preferences/bounded digest snapshots;
- push-subscription and appointment/reminder metadata;
- privacy-minimal product feedback;
- encrypted-sync ciphertext and required authorization/version metadata;
- bounded operational metrics/log metadata and alert events.

Health-journal working data that remains browser-local should not be assumed to be protected from a compromised browser profile/device. Users should not be told the working copy is encrypted until gate #48 is closed and the feature is intentionally enabled.

## Application and API hardening

The current production architecture uses layered controls including:

- strict production CSP/security headers and static-file allowlisting;
- HTTPS/HSTS at the production edge;
- request/body limits and validated API inputs;
- parameterized MySQL access on reviewed production paths;
- distributed/bounded rate limiting with failure handling;
- generic production error responses and request IDs;
- bounded database connection pools and background-job batches;
- signed/idempotent Stripe webhook handling;
- protected operations/runtime endpoints;
- GitHub OIDC validation for scheduled-job authentication;
- dependency auditing, security/unit/integration tests, browser UI integrity gates, and post-deploy Live Acceptance.

These controls are engineering evidence, not an independent penetration test or legal certification.

## Observability and incident boundaries

- Grafana OTLP production telemetry is configured for bounded operational logs/metrics.
- Operational telemetry must not intentionally include journal payloads, credentials, payment data, recovery material, or other unnecessary sensitive content.
- The protected synthetic alert endpoint emits a deliberately non-health-data event and can use Grafana OTLP and/or a dedicated alert webhook.
- A successful synthetic transport request does not prove human alert receipt; human acknowledgement/escalation evidence remains gate #49.
- Incident handling should preserve request IDs, deployment identity, bounded operational/audit evidence, and provider/Stripe event identifiers without copying health payloads into tickets or chat.

See `INCIDENT_RESPONSE.md`, `ops/README.md`, and `docs/EXTERNAL_READINESS_RUNBOOK.md`.

## Recovery, provider, and independent assurance gates

The following remain distinct from code CI:

- **#46:** controlled Stripe live-mode purchase/trial/portal/cancel/failure/recovery evidence;
- **#47:** real provider backup/PITR restore with measured RPO/RTO, retention, and encryption evidence;
- **#49:** production synthetic alert receipt, acknowledgement, and escalation proof;
- **#43:** independent penetration test plus remediation/retest;
- **#44:** independent WCAG 2.2 AA accessibility review plus remediation/retest;
- **#45:** qualified legal/privacy/HIPAA/consumer-health-data/vendor-agreement determination;
- **#48:** independent cryptographic review before enabling/marketing encrypted working-journal storage.

Do not represent Pamet as independently audited, certified, HIPAA compliant, SOC 2 compliant, WCAG-conformant, or end-to-end encrypted unless the specific external evidence needed for that claim has actually been obtained and the claim has been approved for the deployed use case.
