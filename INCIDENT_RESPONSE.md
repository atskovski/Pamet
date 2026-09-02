# Pamet incident response runbook — v1.1.0

## Severity

- **SEV-1:** confirmed or likely disclosure/destruction of health, identity, payment, encryption, or recovery data; widespread authentication/billing failure.
- **SEV-2:** material degradation, repeated 5xx errors, push/scheduler failure, entitlement drift, or suspicious abuse without confirmed disclosure.
- **SEV-3:** isolated defect with a safe workaround and no sensitive-data impact.

## First response

1. Acknowledge the page and assign incident commander, technical lead, communications owner, and scribe.
2. Preserve log-drain events, request IDs, deployment SHA, database audit events, Stripe event IDs, and relevant provider status without copying health payloads into tickets or chat.
3. Contain with the smallest reversible action: disable a handler, revoke a credential/device, rotate a provider secret, pause a scheduler, revoke a share, or roll back the deployment.
4. For suspected key exposure, rotate the affected key and invalidate dependent credentials. An `IDENTITY_ENCRYPTION_KEY` rotation requires a controlled re-encryption migration for MFA seeds; do not overwrite it blindly.
5. Determine affected users, time window, data categories, jurisdictions, and vendor involvement with counsel/privacy leadership.

## Communication and recovery

- Use preapproved status and user-notification templates. Do not speculate or include medical details.
- Restore from a verified backup only after the cause is contained. Validate account deletion, entitlements, device revocation, shares, encrypted blobs, and audit integrity.
- Monitor error rate, latency, authentication, recovery, Stripe reconciliation, push delivery, and database health after restoration.

## Closure

Complete a blameless review within five business days: timeline, root cause, detection gap, user impact, regulatory decision, corrective actions, owners/dates, and verification evidence. Counsel determines whether breach or consumer-health-data notifications are required.
