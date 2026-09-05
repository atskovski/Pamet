# Pamet External Assurance Readiness

Last reviewed: 2026-09-05  
Status: **evidence pack ready; independent review still required**.

This document supports external go-live gates #43, #44, #45, and #48 with a concrete review package. It is not a certification, legal opinion, accessibility conformance claim, penetration-test result, HIPAA determination, cryptographic approval, or regulatory approval.

## 1. Independent penetration test scope

Provide the reviewer with a staging environment that mirrors production integrations but contains no real user health data. At minimum, test:

- registration, login, logout, logout-all, password change, password reset, and MFA enrollment/disable
- legacy-device migration and device revocation
- session fixation, cookie attributes, CSRF/origin enforcement, brute-force/rate-limit behavior, account enumeration, and recovery-token replay
- authorization boundaries across Free, Pro, and Ultra
- Stripe webhook signature verification, event replay/idempotency, entitlement downgrade, and billing-portal access
- caregiver/provider share creation, token entropy, expiry, permission enforcement, revocation, and post-revocation fetch behavior
- encrypted sync ciphertext handling, profile authorization, stale revision conflicts, payload limits, and metadata leakage
- push-subscription ownership and scheduled reminder endpoints
- stored/reflected DOM injection, CSP bypass attempts, unsafe URL handling, file/export formula injection, and error disclosure
- database injection, SSRF, secret exposure, dependency attack surface, and production header configuration

Required deliverable: findings with severity, reproduction steps, affected commit/deployment, remediation evidence, and retest disposition.

## 2. Privacy and data-protection review

Reviewer should map each data class to collection purpose, storage location, retention, deletion, export, sharing, and vendor flow. Include:

- local journal content and browser-local settings
- account identity and authentication metadata
- encrypted sync blobs and their metadata
- caregiver/provider share snapshots and recipient email addresses
- Stripe customer/subscription identifiers
- feedback records (designed to exclude account and health details)
- push subscriptions and timezone/reminder metadata
- operational logs, metrics, audit events, IP/rate-limit metadata, and alert payloads

Confirm that public-facing claims match actual implementation, especially local-first behavior, encrypted sync versus local working-copy encryption, zero-ads positioning, and the statement that Pamet observes/organizes rather than diagnoses.

## 3. BAA / DPA / vendor posture decision

Create and maintain a vendor register for every production processor/subprocessor, including at minimum hosting/database, Redis/Valkey, Stripe, Resend, Grafana/observability, and any support/error-reporting provider added later.

For each vendor record:

- service and data categories received
- purpose and lawful/contractual basis
- region/data residency where relevant
- retention/deletion controls
- encryption/security commitments
- incident notification terms
- DPA status
- BAA availability/status where applicable to the intended Pamet use case
- subprocessor list/review date

Counsel/privacy review must explicitly decide whether Pamet's intended workflows create HIPAA covered-entity/business-associate obligations, consumer-health-data obligations, state privacy obligations, or other healthcare-specific duties. Do not market Pamet as HIPAA compliant or certified without the appropriate legal and assurance basis.

## 4. Accessibility assurance scope

Target WCAG 2.2 AA as the review baseline unless counsel/product requirements set a different applicable standard. Test at minimum:

- keyboard-only operation and visible focus
- modal focus entry, Escape/close behavior, focus return, and no off-screen dialog content
- screen-reader names/roles/states for navigation, forms, settings, security controls, errors, and status messages
- zoom/reflow at 200% and 400%
- responsive use at narrow mobile widths and landscape
- touch target sizing
- contrast in light and dark modes
- text resizing without clipping
- form error association/instructions
- authenticator QR setup with a text setup-key alternative
- reduced-motion expectations where animation exists

Required deliverable: tested browser/OS/assistive-technology matrix, issues, WCAG success criteria, remediation, and retest result.

## 5. Sharing legal/product review

Caregiver/provider sharing needs an explicit policy decision before broad production use. Review:

- user consent language before creating a share
- recipient email handling
- what exact snapshot data is disclosed
- expiry defaults and maximum duration
- download versus view-only semantics
- revocation behavior and limitations after a recipient downloads data
- auditability and user-visible share history
- whether additional healthcare/privacy disclosures or contractual terms are required

## 6. Evidence to hand reviewers

Use these repository artifacts as the starting evidence set:

- `GO_LIVE_STATUS.md`
- `PRODUCTION_READINESS.md`
- `ASSURANCE_HANDOFF.md`
- `SECURITY.md`
- `THREAT_MODEL.md`
- `docs/LOCAL_ENCRYPTION_THREAT_MODEL.md`
- `docs/EXTERNAL_READINESS_RUNBOOK.md`
- `.github/workflows/ci.yml`
- `tests/integration.test.js`
- `tests/ui-hardening.test.js`
- `tests/crypto-ui.test.js`
- `tests/ops-alert.test.js`
- `scripts/backup-restore-drill.sh`
- `scripts/check-production.js`
- `server.js`, `secure-server.js`, and `lib/edge-account.js`
- `db/schema.sql`

Also provide deployment architecture, production vendor list, data-flow diagram, secret inventory by name (never secret values), backup policy, incident-response contacts/process, privacy policy, terms, and release/change-management process.

## 7. Exit criteria for external assurance gates

Issues #43, #44, #45, and #48 must remain open until their applicable independent reviews are completed and material findings are remediated/retested. Minimum closure evidence across the applicable gates:

- independent penetration-test report and retest closure for high/critical findings (#43)
- documented privacy/data-protection and legal determination for applicable healthcare/privacy obligations (#45)
- vendor DPA/BAA posture recorded as applicable (#45)
- independent WCAG 2.2 AA accessibility review and remediation/retest results (#44)
- independent cryptographic design/code review before enabling working-journal encryption (#48)
- final product/marketing claims reviewed against the deployed behavior

Until the applicable gates are closed, describe Pamet as staged/beta production readiness—not independently audited, certified, broadly compliance-assured, or cryptographically reviewed beyond the evidence actually obtained.
