# Pamet Security and Privacy Notes

Pamet handles sensitive personal health observations. This document records engineering boundaries for the v1.1.0 web implementation; it is not a legal privacy policy, security certification, or representation of HIPAA compliance.

## Design boundaries

- Health journal entries remain local-first in browser `localStorage`. They are not currently encrypted at rest by Pamet, so the application does not claim end-to-end encryption.
- Passwords are never sent to the Pamet backend.
- Server services receive only what they require to perform billing, email, or explicitly initiated sharing.
- Pamet does not perform emergency monitoring, diagnosis, medication recommendations, or clinical escalation.

## Authentication

The account gate remains local to each device. Passwords are salted and PBKDF2-HMAC-SHA-256 hashed with 600,000 iterations. Server services use separate 256-bit per-device credentials stored as hashes. Users can revoke another device, request a 30-minute single-use recovery link, and protect recovery with TOTP MFA. TOTP seeds are encrypted with a deployment key.

Optional server services use a random installation credential. The browser sends that credential over HTTPS; the backend stores only its SHA-256 hash.

These controls require independent review and production exercises before they should be described as audited. Recovery email security remains dependent on the user's email account and the configured mail provider.

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

Caregiver and provider sharing is user-initiated in v1.1.0. Pro links are view-only; Ultra links may also allow the recipient to print/save the shared summary.

- Share tokens use cryptographically secure randomness.
- Only token hashes are stored server-side.
- Links expire and can be revoked.
- Provider sharing is not a live clinician portal.
- Caregiver sharing is not continuous monitoring or an emergency-alert mechanism.

## Data minimization

The backend stores account metadata, subscription state, digest preference/aggregate snapshot, sharing snapshots explicitly chosen by the user, audit events, push subscriptions, and—only for Ultra encrypted sync—opaque ciphertext blobs. Pamet never receives an encrypted-sync recovery key.

## Production review

The v1.1.0 runtime applies a static-file allowlist, CSP, HSTS, frame protection, request IDs, body limits, handler validation, generic production errors, endpoint rate limits, database readiness checks, and automated HTTP security tests.

Before representing Pamet as certified or compliant for sensitive health data, configure and exercise the v1.1.0 Redis, alerting, recovery, MFA, device, Web Push, and encrypted-sync controls; complete database encryption/restore drills, retention enforcement, vendor agreements, and independent security, accessibility, privacy, and applicable legal review.
