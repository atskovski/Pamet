# Pamet Security and Privacy Notes

Pamet handles sensitive personal health observations. This document records engineering boundaries for the v1.0.2 web implementation; it is not a legal privacy policy, security certification, or representation of HIPAA compliance.

## Design boundaries

- Health journal entries remain local-first in browser storage.
- Passwords are never sent to the Pamet backend.
- Server services receive only what they require to perform billing, email, or explicitly initiated sharing.
- Pamet does not perform emergency monitoring, diagnosis, medication recommendations, or clinical escalation.

## Authentication

The current account gate is local to the device. Passwords are salted and PBKDF2-hashed. A persistent local session keeps users signed in until explicit logout.

Optional server services use a random installation credential. The browser sends that credential over HTTPS; the backend stores only its SHA-256 hash.

Before multi-device accounts or password recovery are introduced, migrate to a reviewed server-side identity system with email verification, secure recovery, session rotation/revocation, rate limiting, and MFA/passkey support where appropriate.

## Billing

- Stripe secret keys and webhook secrets exist only in server-side environment variables.
- Payment card fields are rendered by Stripe Payment Element.
- Subscription entitlements are granted from server-verified Stripe state, not local UI state.
- Stripe webhook signatures are verified using the raw request body.

## Email

Transactional email uses the configured email provider only when enabled. Weekly digest email is explicit opt-in. Subject lines do not include symptom information. Digest snapshots exclude free-text notes.

## Sharing

Caregiver and provider sharing is user-initiated and read-only in v1.0.2.

- Share tokens use cryptographically secure randomness.
- Only token hashes are stored server-side.
- Links expire and can be revoked.
- Provider sharing is not a live clinician portal.
- Caregiver sharing is not continuous monitoring or an emergency-alert mechanism.

## Data minimization

The backend stores account metadata, subscription state, digest preference/aggregate snapshot, sharing snapshots explicitly chosen by the user, and audit events. It does not automatically synchronize the user's complete local journal.

## Production review

Before production handling of sensitive health data, complete a professional security/privacy review covering threat modeling, database encryption, backups, logging/redaction, retention/deletion, incident response, access controls, dependency scanning, rate limiting, abuse controls, data-processing agreements, and applicable legal/regulatory requirements.
