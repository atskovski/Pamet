# Pamet incident response runbook — v1.6.9

Last reviewed: 2026-09-05

This runbook is an operational procedure, not a determination that any event is legally a breach. Counsel/privacy leadership must make notification and regulatory decisions based on the actual incident, jurisdictions, contracts, and affected data.

## Severity

- **SEV-1:** confirmed or likely unauthorized disclosure/destruction of health, identity, authentication/recovery, encryption-key material, or payment-linked account data; widespread authentication/billing compromise; or an incident that materially prevents safe account access/recovery.
- **SEV-2:** material degradation, repeated 5xx errors, scheduled-job/push failure, entitlement drift, sharing-control failure, provider outage, suspicious abuse, or integrity risk without confirmed sensitive-data disclosure.
- **SEV-3:** isolated defect with a safe workaround and no known sensitive-data, authorization, or availability impact.

When evidence is incomplete, classify to the higher plausible severity until triage narrows the impact.

## First response

1. Acknowledge the alert and assign an incident commander, technical lead, communications owner, and scribe. Record the incident start/detection times and current production release SHA/version.
2. Preserve the minimum evidence needed for investigation: Grafana OTLP/log evidence, request IDs, deployment SHA, bounded runtime metrics, database audit events, redacted Stripe event/object IDs, provider status, and relevant GitHub/Wasmer deployment evidence. Do **not** copy journal payloads, credentials, recovery material, payment data, raw session tokens, share tokens, or unnecessary personal data into tickets or chat.
3. Contain with the smallest reversible action: disable a handler/feature flag, revoke a session/device/share, rotate a provider credential, pause a scheduled job, disable an integration, or roll back to an exact known-good deployment.
4. For suspected credential/key exposure, identify the blast radius before rotation and invalidate dependent credentials where required. Encryption-key rotation that protects stored secrets may require controlled re-encryption/migration; do not overwrite deployment encryption keys blindly.
5. Determine affected users/accounts, time window, data categories, sharing recipients, jurisdictions, vendors/subprocessors, and whether encrypted data/key material was involved. Engage counsel/privacy leadership for legal/regulatory classification.
6. For billing incidents, preserve redacted Stripe event IDs and verify server-authoritative entitlements before making customer-plan corrections. Do not edit billing state directly in the database as a first response when Stripe remains the source of truth.
7. For suspected sharing exposure, revoke affected active shares immediately when appropriate, then document the limitation that Pamet cannot retract copies a recipient previously downloaded/printed/retained.

## Communication

- Use preapproved status and user-notification language. Do not speculate, diagnose, minimize impact, or include medical/journal details.
- Separate operational-status communication from legally required incident/breach notification.
- Coordinate any notification involving a provider/subprocessor with contractual incident-notification terms and counsel.
- Preserve a timestamped record of external communications, recipients, approvals, and the factual basis used at the time.

## Recovery

- Restore from a verified backup only after the initiating cause is contained and the restore target is isolated/validated.
- Validate schema/referential integrity, account/session boundaries, password/recovery/MFA state, entitlements, device revocation, sharing/revocation, encrypted-sync records, push/reminder state, and audit integrity before returning traffic.
- If a provider-level restore is used, record actual RPO/RTO and retain the redacted drill/incident evidence required by go-live gate #47.
- After recovery, monitor error rate/latency, authentication and recovery failures, Stripe reconciliation, sharing authorization, scheduled jobs, push delivery, database health, and operational alert delivery.
- Verify the repaired production release through exact-head CI/Live Acceptance rather than relying only on a manual smoke test.

## Security and privacy escalation triggers

Escalate immediately to counsel/privacy leadership for any credible indication of:

- unauthorized access to or disclosure of user health information, account identity, share snapshots, or Visit Brief attachments;
- compromise of password/session/recovery/MFA material or encryption keys;
- an improperly authorized caregiver/provider share or failure of revocation/expiry controls;
- vendor/subprocessor exposure involving Pamet data;
- material deletion, corruption, or inability to honor deletion/retention commitments;
- an event that may trigger contractual, state consumer-health-data/privacy, breach-notification, or healthcare-specific obligations.

Do not label Pamet, the event, or the affected data as “HIPAA breach,” “HIPAA compliant,” or similar unless qualified counsel has made the applicable determination.

## Closure

Complete a blameless incident review promptly after stabilization, normally within five business days for material incidents. Record:

- timeline and detection source;
- root cause and contributing conditions;
- affected systems/users/data categories and duration;
- containment/recovery actions and exact deployment versions;
- provider/subprocessor involvement;
- regulatory/contractual notification decision and approver;
- detection/control gaps;
- corrective actions, owners, due dates, and verification/retest evidence;
- whether tests, runbooks, alert rules, retention/deletion behavior, or external-review scope must change.

Counsel/privacy leadership determines whether any breach, consumer-health-data, contractual, app-store, or other notification is required. Close the incident only after material corrective actions are either verified or entered into a tracked risk/remediation plan with an accountable owner.
