# Pamet independent assurance handoff — v1.1.0

Code cannot independently certify itself. This document defines the evidence and exit criteria for the three external launch reviews.

## Penetration and privacy review

Provide the reviewer with the architecture, `SECURITY.md`, `THREAT_MODEL.md`, schema, staging environment, test accounts for every plan, Stripe test customer, and redacted deployment configuration inventory. Scope authentication/recovery/MFA, device revocation, IDOR, sharing tokens, Stripe webhooks, Redis failure behavior, Web Push endpoints, CSP/XSS, encrypted-sync cryptography and conflicts, exports, deletion, logs, backups, and dependency/supply-chain risk.

Exit criteria: no open critical/high finding; every medium has an owner and date; retest evidence is attached; the reviewer issues a signed final report.

## WCAG 2.1 AA and screen-reader review

Test keyboard-only use, focus order/visibility, reflow at 320 CSS px, 200%/400% zoom, contrast, reduced motion, errors/status announcements, log form, settings help, recovery, MFA, checkout, exports, sharing, and destructive confirmations. Include VoiceOver/Safari and NVDA/Firefox or JAWS/Chrome. At least one review session should include a screen-reader user who is not part of the development team.

Exit criteria: automated scan attached; manual audit attached; no open Level A/AA blocker; fixes retested with the same assistive technology.

## HIPAA-adjacent legal/privacy review

Counsel must determine Pamet's role and applicable jurisdictional obligations; review privacy policy, terms, consent, minors, consumer-health-data laws, breach notification, retention/deletion, subprocessors, BAAs/DPAs, marketing claims, caregiver/provider sharing, and whether any planned customer makes Pamet a business associate.

Exit criteria: counsel-approved policies and data map; signed vendor agreements where required; documented retention schedule; incident/breach decision tree; approved product claims.

## Release record

Record reviewer, organization, scope, start/completion dates, report location, unresolved findings, owners, due dates, and final launch approver. Never place confidential reports or credentials in the public repository.
