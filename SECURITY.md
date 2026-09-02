# Pamet Security and Privacy Notes

Pamet handles sensitive personal health observations. This document records engineering boundaries for the v1.0.5 web implementation; it is not a legal privacy policy, security certification, or representation of HIPAA compliance.

## Design boundaries

- Health journal entries remain local-first in browser `localStorage`. They are not currently encrypted at rest by Pamet, so the application does not claim end-to-end encryption.
- Passwords are never sent to the Pamet backend.
- Server services receive only what they require to perform billing, email, or explicitly initiated sharing.
- Pamet does not perform emergency monitoring, diagnosis, medication recommendations, or clinical escalation.

## Authentication

The current account gate is local to the device. Passwords are salted and PBKDF2-HMAC-SHA-256 hashed with 600,000 iterations. Legacy hashes are upgraded after a successful login. A persistent local session keeps users signed in until explicit logout.

Optional server services use a random installation credential. The browser sends that credential over HTTPS; the backend stores only its SHA-256 hash.

Before multi-device accounts or password recovery are introduced, migrate to a reviewed server-side identity system with email verification, secure recovery, session rotation/revocation, rate limiting, and MFA/passkey support where appropriate.

## Billing

- Stripe secret keys and webhook secrets exist only in server-side environment variables.
- Payment card fields are rendered by Stripe Payment Element.
- Subscription entitlements are granted from server-verified Stripe state, not local UI state.
- Stripe webhook signatures are verified using the raw request body.
- Checkout and customer creation use idempotency keys; webhook event IDs are claimed in the database before processing.
- Configured Stripe price IDs are verified against the approved USD amounts and billing intervals before subscription creation.

## Email

Transactional email uses the configured email provider only when enabled. Weekly digest email is explicit opt-in. Subject lines do not include symptom information. Digest snapshots exclude free-text notes.

## Sharing

Caregiver and provider sharing is user-initiated in v1.0.5. Pro links are view-only; Ultra links may also allow the recipient to print/save the shared summary.

- Share tokens use cryptographically secure randomness.
- Only token hashes are stored server-side.
- Links expire and can be revoked.
- Provider sharing is not a live clinician portal.
- Caregiver sharing is not continuous monitoring or an emergency-alert mechanism.

## Data minimization

The backend stores account metadata, subscription state, digest preference/aggregate snapshot, sharing snapshots explicitly chosen by the user, and audit events. It does not automatically synchronize the user's complete local journal.

## Production review

The v1.0.5 runtime applies a static-file allowlist, CSP, HSTS, frame protection, request IDs, body limits, handler validation, generic production errors, endpoint rate limits, database readiness checks, and automated HTTP security tests.

Before representing Pamet as legally or operationally production-ready for sensitive health data, complete an independent security/privacy review plus database encryption and restore drills, centralized redacted logging, distributed rate limiting, incident response, retention enforcement, vendor/data-processing agreements, and applicable legal/regulatory analysis. Multi-device identity, recovery, MFA/passkeys, and session revocation require a reviewed server-side identity provider.
