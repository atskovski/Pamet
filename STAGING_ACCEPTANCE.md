# Pamet staging and controlled-production acceptance

This checklist separates what CI can prove from what must be exercised against real configured infrastructure before broad launch.

## Environment prerequisites

- `/api/health` returns HTTP 200.
- `/api/ready` returns HTTP 200 and `launchReady: true` before the environment is called launch-ready.
- MySQL uses encrypted transport and controlled migrations.
- Redis/Valkey, Resend, VAPID, metrics/logging, alerts, Stripe, and identity encryption are configured through secrets, not source control.
- Test accounts contain synthetic data only.

## Identity and recovery

Using controlled accounts:

- create a new account;
- log out and log back in on the same device;
- log in on a second browser/device;
- change the password and confirm other sessions are invalidated;
- use **Sign out everywhere** and confirm every session must log in again;
- exercise one authorized legacy-device migration and confirm the browser drops the legacy bearer credential afterward;
- request a password-reset email and verify the 30-minute one-time link;
- confirm a used reset token cannot be reused;
- confirm an expired reset token is rejected;
- enable MFA by scanning the in-app QR and confirming a six-digit code;
- start setup again and verify a fresh pending secret/QR is generated;
- disable MFA only with a current authenticator code;
- verify recovery requires MFA when MFA is enabled;
- revoke a non-current device and confirm its credential stops working.

## Stripe controlled-live acceptance

Use a dedicated controlled production account and real low-risk payment method approved for launch testing. Do not use customer accounts.

- verify Pro monthly, Pro annual, Ultra monthly, and Ultra annual prices match the approved catalog;
- start the seven-day trial and confirm the expected entitlement immediately;
- verify Stripe webhook delivery for `customer.subscription.created` and `updated`;
- replay a webhook and confirm idempotency;
- complete the trial-to-paid transition;
- exercise billing-portal plan management;
- cancel and confirm entitlement returns to Free according to product policy;
- exercise a failed-payment state and verify paid capabilities are not incorrectly granted;
- run `/api/jobs/stripe-reconcile` with the controlled account and verify drift correction;
- confirm no secret/payment data appears in application logs.

## Push notifications

- enroll a real supported browser/device with explicit permission;
- confirm the stored subscription is tied to the correct account/device;
- trigger the reminder job in a controlled window;
- verify timezone behavior and once-per-local-date deduplication;
- revoke browser permission/subscription and confirm terminal push errors disable stale endpoints;
- verify no health detail appears in lock-screen notification text.

## Sharing

- create Pro and Ultra caregiver/provider shares;
- verify the emailed token opens only the intended snapshot;
- verify Pro permission/active-share limits;
- verify Ultra view/download behavior;
- revoke the share and confirm the same URL returns 404;
- verify an expired share returns 404;
- confirm share content carries the non-diagnosis/non-emergency framing.

## Encrypted sync and key-loss exercises

- synchronize a synthetic Ultra journal from device A;
- retrieve it on device B with the correct recovery key;
- confirm the server/database contains ciphertext rather than plaintext journal content;
- create a stale revision and verify 409 conflict handling;
- verify wrong-key decryption fails without overwriting the remote blob;
- test recovery-key export/import UX;
- test the documented lost-key behavior explicitly;
- confirm password reset alone does not promise recovery of end-to-end encrypted content.

## Mobile/reflow acceptance

Test at minimum:

- 320x568;
- 360x800;
- 375x667;
- 390x844;
- 393x852;
- 412x915;
- 430x932;
- landscape phone heights near 360–430px;
- tablet portrait/landscape; and
- desktop at 100%, 200%, and browser zoom/reflow up to the accessibility review target.

Verify login, Create Account, reset password, all settings sections, Account Security, MFA QR, log entry, calendar, patterns, reports, plan/checkout, feedback, sharing, and destructive confirmations. No modal may render partly off-screen without an internal/viewport scroll path.

## Exit record

For every acceptance run record environment, app commit, tester, date, scenarios passed/failed, screenshots with synthetic data only, external provider event IDs where appropriate, defects opened, and final approver.

Passing this checklist is engineering evidence. It is not a penetration-test report, accessibility certification, legal opinion, HIPAA determination, SOC report, or other independent assurance.
