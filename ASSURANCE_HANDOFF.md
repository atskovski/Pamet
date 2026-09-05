# Pamet independent assurance handoff — v1.6.9

Last reviewed: 2026-09-05  
Release evidence target: current production `main` and the deployed Pamet 1.6.9 environment.

Code cannot independently certify itself. This document defines the reviewer package and exit criteria for Pamet's external assurance gates. Repository/self-review evidence is supporting material only; it is not a penetration-test result, accessibility conformance claim, legal opinion, HIPAA determination, or cryptographic certification.

## Gate #43 — Independent penetration test

Provide the tester with:

- the architecture and current data-flow description;
- `SECURITY.md`, `THREAT_MODEL.md`, `PRODUCTION_READINESS.md`, and `GO_LIVE_STATUS.md`;
- staging or a controlled production-equivalent environment containing no real user health data;
- test accounts for Free, Pro, and Ultra;
- Stripe test/live acceptance boundaries and redacted configuration inventory;
- API/mobile contracts and sharing-flow descriptions.

Scope at minimum:

- registration, login, sessions, logout-all, password change/reset, MFA, account recovery, legacy-device migration, and device revocation;
- session fixation, cookie attributes, CSRF/origin enforcement, brute-force/rate limiting, account enumeration, and recovery-token replay;
- authorization/IDOR boundaries across plans, profiles, caregiver/provider sharing, snapshots, revocation, and expiry;
- Stripe webhook signature verification, replay/idempotency, subscription transitions, entitlement boundaries, and billing-portal access;
- SQL injection, SSRF, stored/reflected DOM injection, CSP bypass, unsafe URL handling, error disclosure, dependency/supply-chain risk, and production security headers;
- Web Push endpoints and scheduled-job authentication;
- encrypted-sync endpoint authorization, stale/conflicting revisions, payload limits, ciphertext/metadata handling, and abuse cases;
- Admin isolation boundaries and API contract assumptions used by native clients.

Required deliverable: signed/final findings report with severity, reproduction steps, affected deployment/commit, remediation recommendation, remediation evidence, and retest disposition.

Exit criteria: no unresolved Critical/High finding unless explicitly risk-accepted by the launch owner with documented rationale; remediated Critical/High findings are independently retested; the redacted completion record is linked from `GO_LIVE_STATUS.md` and issue #43.

## Gate #44 — Independent WCAG 2.2 AA accessibility review

Use WCAG 2.2 AA as the audit baseline. Test the full user journeys rather than isolated components, including login/recovery/MFA, Home, Log, Calendar/history, Insights, Visit Brief, sharing dialogs, Settings, plan/billing flows, Privacy/Safety/Support surfaces, and light/dark modes.

Manual coverage must include:

- keyboard-only operation, focus order, visible focus, modal focus entry/trapping/return, and Escape/close behavior;
- VoiceOver/Safari and NVDA/Firefox or another documented equivalent assistive-technology matrix;
- 200% and 400% zoom/reflow, narrow mobile widths, and landscape orientation;
- names, roles, states, labels, instructions, form-error association, status announcements, and non-color state indicators;
- light/dark contrast, text resizing, touch-target sizing, and reduced-motion behavior;
- authenticator/QR setup with an equivalent text setup-key path;
- destructive confirmations, billing/checkout/portal handoffs, exports, and sharing/revocation states.

At least one manual review session should involve an accessibility specialist or assistive-technology user independent of the development team.

Required deliverable: tested browser/OS/assistive-technology matrix, WCAG success-criterion mapping, findings, remediation status, and retest result. A VPAT/ACR or equivalent conformance report may be produced when appropriate, but a document label alone does not substitute for the underlying manual audit.

Exit criteria: no open Level A/AA launch blocker; material issues are remediated and independently retested; completion evidence is linked from `GO_LIVE_STATUS.md` and issue #44.

## Gate #45 — Legal/privacy/HIPAA and consumer-health-data determination

Qualified counsel/privacy review must determine Pamet's actual role and applicable jurisdictional obligations based on the deployed operating model—not on marketing labels or engineering assumptions.

Provide counsel with:

- architecture/data-flow diagram and data inventory;
- storage locations and retention/deletion behavior for account, journal, sharing, billing, push, audit, feedback, and operational data;
- production vendor/subprocessor register covering hosting/database, Redis/Valkey, Stripe, Resend, Grafana/observability, and any support/error-reporting provider;
- each vendor's data categories, purpose, region/residency where relevant, retention/deletion controls, security commitments, incident terms, DPA status, BAA availability/status where applicable, and current subprocessor-review date;
- caregiver/provider sharing flows and recipient-email handling;
- encryption/key-management boundaries, including the distinction between encrypted sync and disabled working-journal encryption;
- account recovery, export, deletion, breach/incident-response, and backup behavior;
- iOS/Android distribution plans and proposed App Store/Play Store health-data disclosures;
- current privacy policy, terms/consent copy, support/safety copy, and product/marketing claims.

Counsel should explicitly address at minimum:

- HIPAA covered-entity/business-associate applicability and whether any planned customer/use case changes that determination;
- required BAAs/DPAs and other processor agreements;
- applicable state consumer-health-data/privacy laws, including consent, authorization, deletion, geofencing/advertising restrictions where applicable, and breach-notification obligations;
- retention/deletion schedule and whether implementation matches disclosed policy;
- caregiver/provider sharing disclosures and downstream-download limitations;
- minors/age-policy questions if Pamet will permit minor accounts;
- App Store/Play Store health-data/privacy disclosures and allowed product claims.

Exit criteria: written scoped determination; counsel-approved policy/disclosure changes; required vendor agreements/status documented; retention schedule and breach decision tree approved; product changes/remediations completed; evidence linked from `GO_LIVE_STATUS.md` and issue #45.

## Gate #48 — Independent cryptographic review before working-journal encryption

This gate is deferred for broad launch while working-journal encryption remains disabled. Do not enable or market it as end-to-end/working-journal encryption until independent review validates the design and key lifecycle.

Review scope must include key generation/entropy, derivation/wrapping, local-storage threat model, migration/rollback, recovery/revocation, multi-device interaction, metadata leakage, backup/export implications, failure/partial-write recovery, and the relationship between browser working storage and encrypted sync.

Exit criteria: independent design/code review, remediation of material findings, explicit approval of the enabled design, and a controlled rollout plan. Keep `PAMET_FEATURE_ENCRYPTED_JOURNAL=false` until then.

## Operator evidence that complements independent review

Independent reviewers may use but must not mistake these for independent certification:

- #46 controlled Stripe live-mode lifecycle evidence;
- #47 provider-level backup/PITR restore with measured RPO/RTO;
- #49 production synthetic alert delivery plus human acknowledgement/escalation;
- exact-head CI, production Live Acceptance, browser smoke, scheduled-job acceptance, and Admin parity;
- `docs/EXTERNAL_READINESS_RUNBOOK.md`, `docs/EXTERNAL_ASSURANCE_READINESS.md`, and repository test/evidence artifacts.

## Release record

For each external engagement, record reviewer, organization, scope, start/completion dates, tested production/staging version or commit, report location, unresolved findings, owners, due dates, retest status, risk acceptances, and final launch approver.

Never commit confidential reviewer reports, credentials, secrets, payment data, or user health data to the public repository. Store only redacted completion evidence and references needed to support the go-live decision.
