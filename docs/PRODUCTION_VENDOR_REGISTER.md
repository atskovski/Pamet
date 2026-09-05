# Pamet Production Vendor & Data-Flow Register

Last reviewed: 2026-09-05  
Release context: Pamet 1.6.9  
Owner: Pamet operator / privacy lead  
Review gate: #45 — qualified legal/privacy determination

This register records the production services Pamet is designed or configured to use, the data categories involved, engineering safeguards, and the contract/privacy questions that still require operator or counsel verification. It is an engineering inventory, not a legal opinion, HIPAA determination, certification, or statement that any agreement has been executed.

## Status vocabulary

- **Configured / active:** repository or production capability evidence shows the integration is in use.
- **Optional / conditional:** code supports the integration but production use depends on configuration or user action.
- **Fail-closed:** the data flow is disabled unless a separate explicit approval/configuration condition is satisfied.
- **Verify contract:** confirm the actual Pamet account/order form, DPA, BAA if applicable, region, retention, and subprocessor terms; a public provider document is not proof that Pamet has executed a particular contract.

## Core production processors / service providers

| Provider / service | Pamet purpose | Data that may be processed | Current engineering posture | Public privacy/contract artifact | Pamet verification required |
| --- | --- | --- | --- | --- | --- |
| **Wasmer / Wasmer Edge + Wasmer MySQL** | Application hosting, edge runtime, production database | Account identity/auth metadata, sessions/devices, subscription state, audit records, sharing snapshots selected by the user, push/reminder metadata, feedback, and opaque encrypted-sync blobs when applicable. HTTP infrastructure also necessarily processes network/request metadata. | **Configured / active.** Production health/readiness is release-gated. Database access is bounded and parameterized; production backup/restore evidence remains #47. | Wasmer Privacy Policy: `https://wasmer.io/policies/privacy` | **Verify contract.** Confirm the actual paid-service terms/order, DPA or equivalent processor terms, data region/residency, retention/backups, encryption-at-rest commitments, subprocessors, incident terms, and BAA availability/applicability if counsel determines one is needed. A public Wasmer DPA/BAA was not located during the 2026-09-05 engineering review. |
| **Stripe** | Subscription billing, customer portal, price/subscription lifecycle and entitlement source data | Stripe customer/subscription/invoice identifiers, customer contact/billing information supplied to Stripe, Pamet plan/interval/user identifier metadata, payment status and limited billing metadata. Payment card entry is handled by Stripe rather than Pamet application fields. | **Configured / active.** Live prices and subscription webhook coverage verified; paid lifecycle acceptance remains #46. Pamet must not place journal/health content in Stripe metadata or descriptions. | Stripe DPA: `https://stripe.com/legal/dpa` | **Verify contract.** Confirm the Pamet Stripe Services Agreement/DPA, enabled products, data retention, processor/controller roles for the chosen services, subprocessors, and whether any additional healthcare-specific agreement is applicable. Do not infer a BAA requirement from use of Stripe alone. |
| **Resend** | Transactional account email and, only if separately approved, user-initiated Visit Brief PDF email | Account email addresses and transactional message metadata. A Visit Brief PDF can contain user-entered health information; its recipient address and attachment would be transmitted to Resend when that feature is enabled. | **Configured provider may exist, but health-PDF transmission is fail-closed.** `PAMET_FEATURE_VISIT_BRIEF_EMAIL` defaults false/unset and must be explicitly enabled in addition to provider configuration. Local Download/Save PDF remains available. | DPA: `https://resend.com/legal/dpa`; Enterprise Terms: `https://resend.com/legal/enterprise-terms`; subprocessors: `https://resend.com/legal/subprocessors` | **Verify contract before enabling health-PDF email.** Resend's current Enterprise Terms treat PHI subject to HIPAA as Restricted Data and permit it only when the Order Form expressly allows it and a BAA is signed. Counsel must first determine whether Pamet's intended flow is subject to HIPAA or other regulated-health-data obligations, then confirm the actual Resend contract permits the intended data category. |
| **Grafana Cloud** | Operational logs, metrics, production observability and synthetic alert transport | Service/version/environment, route/status/latency metrics, bounded operational events and synthetic non-health alerts. Engineering policy is to exclude journal/health payloads, credentials, session/bearer material and secrets. | **Configured / active** for OTLP in production. Protected metrics are enabled. Human alert receipt/escalation acceptance remains #49. | Grafana DPA: `https://grafana.com/legal/data-processing-agreement/`; subprocessors: `https://grafana.com/legal/list-of-subprocessors/` | **Verify contract.** Confirm Pamet account terms/DPA, selected Grafana Cloud region, retention, alert/contact integrations, subprocessors, access controls, and that operational payload minimization remains enforced. |

## Conditional integrations

| Provider / service | Trigger / purpose | Data that may leave Pamet | Current engineering posture | Review requirement |
| --- | --- | --- | --- | --- |
| **Redis / Valkey provider** | Optional distributed rate-limit store | Rate-limit keys/counters and associated bounded request metadata. No journal payload should be stored in the limiter. | **Optional.** If absent, Pamet uses its transactional MySQL limiter. | Record the actual provider if `REDIS_URL` is configured; review its DPA/terms, region, encryption, retention/TTL and subprocessors. Do not list a hypothetical provider as executed. |
| **Google OAuth / Sign-In** | Optional account authentication | OAuth identifiers/tokens plus user-approved identity information such as name/email. | **Conditional on complete provider configuration and user action.** | Verify OAuth consent-screen disclosures, requested scopes, token handling/deletion, Google developer terms and privacy disclosures. |
| **Google Calendar API** | Optional direct insertion of an appointment after explicit user action | Appointment title/time and the Pamet-generated event description, which can include reason-for-visit and questions entered by the user. | **Opt-in and separately gated.** Without direct API configuration Pamet opens a prefilled Google Calendar event for the user to review/confirm. | Treat appointment content as potentially sensitive. Confirm minimum scope (`calendar.events`), consent language, token lifecycle, privacy notice and legal basis before enabling direct insertion. |
| **Apple Sign in with Apple** | Optional account authentication | Apple-provided scoped identifier and user-approved name/email information. | **Conditional on provider configuration and user action.** | Verify current Apple Developer Program/Sign in with Apple terms, account-change notifications, deletion obligations and privacy disclosures. |
| **Apple Calendar / `.ics`** | User-requested calendar export | An `.ics` file generated for the user can contain appointment time, clinician, reason and questions. | **Local/user-directed handoff.** Pamet does not need an Apple Calendar server credential for this export; the user opens/confirms the file. | Privacy copy should make clear that once imported, the user's calendar provider/device settings govern storage/sync. Review mobile/app-store disclosure implications. |
| **Web Push browser push services** | Closed-app reminders / notification delivery | Push subscription endpoint/keys and deliberately minimized reminder payloads. Lock-screen notification content is designed to avoid symptom, medication, clinician and diagnosis details. | **Conditional on user permission and device subscription.** | Document browser/platform push providers as applicable, review endpoint retention/revocation and keep notification payload minimization tested. |
| **Feedback webhook provider** | Optional routing of product feedback | Submitted feedback fields designed to exclude account and health details. | **Optional.** No provider should be considered active solely because the environment variable exists in `.env.example`. | If configured, record the actual provider, retention and DPA/terms; maintain payload tests preventing account/health detail expansion. |
| **Additional log drain / alert webhook** | Optional secondary operational routing | Same minimized operational/log or synthetic alert payloads; never health journal content or secrets. | **Optional.** Grafana OTLP can serve the current synthetic alert transport without a separate webhook. | Record the actual destination if enabled and review contract, retention, access and escalation ownership. |

## Data-flow rules that apply to every provider

1. **No secrets in evidence.** API keys, webhook secrets, session tokens, recovery material, encryption keys and provider credentials stay in deployment/provider secret stores and never in public GitHub issues, screenshots or runbooks.
2. **No health payloads in observability.** Logs, metrics, alerting and support evidence use route/status/request IDs and bounded metadata rather than symptoms, medications, notes, Visit Brief contents or sharing snapshots.
3. **No health data in billing metadata.** Stripe metadata is limited to internal Pamet user/plan/interval identifiers needed to reconcile subscriptions.
4. **Health-bearing email is separate from ordinary email.** A verified Resend sender does not imply approval to send a Visit Brief attachment. `PAMET_FEATURE_VISIT_BRIEF_EMAIL=true` is a separate operational/legal approval gate.
5. **User-directed exports remain user-controlled.** Local JSON/PDF/ICS outputs can leave Pamet when the user saves, imports or shares them; the destination's privacy/security practices then matter.
6. **Optional means absent until proven configured.** The existence of code or an environment-variable name is not evidence that a provider is active in production.
7. **Minimize and expire.** Retain only fields required for the documented purpose, apply expiry/revocation where implemented, and align provider retention with Pamet's counsel-approved retention schedule once #45 is complete.

## Contract and privacy review checklist

For every active production provider, record privately with the operator/legal evidence pack:

- contracting legal entity and account owner
- service/product actually enabled
- controller / processor / independent-controller role by data flow
- categories of personal/sensitive data permitted by contract
- DPA execution/incorporation status and version/date
- BAA availability/execution status **only if applicable to the legally determined use case**
- selected processing/storage region and cross-border transfer mechanism where relevant
- encryption in transit/at rest commitments
- provider retention/deletion controls and backup retention
- subprocessor list and review date / change-notification mechanism
- security/incident notification commitments
- account-level access controls, MFA/SSO and privileged administrator ownership
- offboarding/export/deletion process
- next review date and owner

Do not place confidential contracts, legal advice, account identifiers, credentials, payment details or user health data in this public repository. The public register should record status and evidence locations only.

## Current open decisions

- **#45 Legal/privacy:** determine Pamet's direct-to-consumer/provider/caregiver legal roles; consumer-health/state obligations; privacy/consent/retention/store disclosures; and provider DPA/BAA posture.
- **#46 Stripe live lifecycle:** live trial creation/cancellation is partially evidenced, but paid charge, portal, Pamet entitlement activation/downgrade and failure/recovery still require controlled acceptance.
- **#47 Provider restore:** measure production-provider restore RPO/RTO and document retention/encryption evidence.
- **#49 Alert acceptance:** prove the intended Grafana/contact-point recipient receives and acknowledges the synthetic alert.

This file should be reviewed whenever a provider, data category, region, contract, feature flag or external sharing path changes.