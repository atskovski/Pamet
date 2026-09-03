# Pamet Production / Staging Exercise Runbook

This runbook covers the remaining controlled exercises that cannot be honestly proven by unit/integration CI alone. Use a dedicated test account and synthetic health data. Never use a real customer's health history for release validation.

## A. Database backup and provider restore

The CI job runs `scripts/backup-restore-drill.sh` on every PR against disposable MySQL and verifies schema/table/row integrity. Before broad launch, repeat the exercise using the actual production database provider's supported backup/PITR mechanism.

Record:

- provider and database version
- backup type and backup timestamp
- restore target isolated from production
- recovery point achieved (RPO)
- elapsed time from restore start until validated application readiness (RTO)
- table/row validation results for identity, sessions, devices, sharing, sync blobs, feedback, push subscriptions, and appointments
- application `/api/ready` result against the restored environment
- reviewer/date and evidence location

Do not close production-readiness issue #7 solely because CI's logical dump/restore passes.

## B. Controlled live Stripe exercise

Use a controlled production test account and the real live catalog only after the approved price IDs have been independently checked.

1. Register a clean account.
2. Confirm Free entitlements.
3. Start Pro monthly checkout and verify the seven-day trial state.
4. Confirm webhook receipt and entitlement transition.
5. Open the billing portal and verify plan/payment-management access.
6. Cancel and verify the server removes paid capabilities after the authoritative Stripe state changes.
7. Repeat for Ultra and verify encrypted sync/appointment workspace gates.
8. Exercise a failed payment using an appropriate controlled Stripe test mechanism/environment; do not intentionally create a fraudulent real charge.
9. Replay/retry the same webhook and verify deduplication.
10. Run the entitlement reconciliation path and compare Pamet state to Stripe.

Capture Stripe event IDs, Pamet audit event names, timestamps, and final entitlement state. Do not record card data or secrets in GitHub.

## C. Recovery / MFA / session exercise

1. Register and sign in on two independent browsers/devices.
2. Open Settings → Security and devices → Manage security.
3. Confirm both authorized devices are visible where applicable.
4. Start authenticator setup and verify a fresh QR/setup key is generated.
5. Scan the QR with a TOTP-compatible authenticator and confirm a valid six-digit code.
6. Verify an invalid code is rejected.
7. Request password recovery and confirm the link expires/works once.
8. Complete recovery with MFA enabled and verify the authenticator code is required.
9. Verify other active sessions are revoked after password reset.
10. Use Sign out everywhere and verify every active session can no longer access protected endpoints.
11. Revoke a legacy device credential and verify it stops authenticating.

## D. Push reminder exercise

Test on supported mobile browsers/PWA contexts:

- permission denied, granted, and later revoked
- subscription registration
- timezone/reminder-hour behavior
- one notification per intended local day (deduplication)
- stale/expired push endpoint handling
- closed-app delivery where the browser/platform supports it
- no health-sensitive content exposed on the lock screen beyond the approved reminder copy

## E. Encrypted sync / key-loss exercise

For Ultra encrypted sync:

- create encrypted data on device A
- sync/fetch ciphertext on device B
- verify stale revision produces 409 and current revision succeeds
- verify server/database never receives plaintext journal content or recovery key
- lose the current local key but retain the recovery material and prove recovery
- test the documented lost-all-keys outcome without weakening the security model

The working local-journal encryption framework in `js/local-encryption-v1.2.0.js` is deliberately **not enabled**. Before enablement, an independent reviewer must approve the threat model, recovery UX, migration behavior, and data-loss handling. Only then should a separate PR wire staged encryption into persistent storage.

## F. Release evidence record

For each exercise attach or record:

- release/commit SHA
- environment
- synthetic test account identifier (not credentials)
- start/end time
- expected result
- actual result
- relevant event/request IDs with secrets removed
- defects found and remediation PR
- retest result
- reviewer/approver

A release should not be described as broadly production-assured until the applicable external assurance work and these controlled environment exercises have passed.
