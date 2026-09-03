# Pamet 1.5.1 — Go-Live Status at a Glance

Last reviewed: 2026-09-03  
Source of truth: `main` release baseline plus current CI evidence.  
Rule: a code/self-review result is not presented as an independent certification.

| Area | Status | Evidence / remaining gate |
| --- | --- | --- |
| Authentication / sessions / MFA | **Strong by code + automated review** | Secure session/device model, password hashing, MFA/TOTP, breach-password checks, revocation and recovery controls are covered by code/tests. Independent penetration testing remains open. |
| SQL injection surface | **Clean in reviewed paths** | Parameterized MySQL access is the required pattern and security checks cover the production paths. Independent adversarial review remains open. |
| Rate limiting | **Strong implementation** | Production limiter is designed to fail closed with Redis/Valkey when configured and MySQL fallback. Production topology/load evidence should still be retained. |
| Billing (Stripe) | **Strong implementation; live acceptance open** | Webhook idempotency and server-side price/plan validation exist. A complete live-mode checkout → subscription/trial → cancellation → failed-payment → webhook/reconciliation dry run remains a go-live evidence gate. |
| Working-journal end-to-end/local encryption | **Not shipped** | Deliberately gated pending independent cryptographic review. Ultra encrypted sync is separate from encrypting the working browser copy. |
| CSP hardening | **Partial** | Script execution is externalized for production; style CSP still permits `unsafe-inline`. Final style-CSP cleanup remains open. |
| Frontend maintainability | **Needs planned refactor** | Production is bundled, but source still contains historical version-suffixed feature layers. Consolidate into feature-owned modules after the launch stabilization window rather than doing a high-risk rewrite immediately before release. |
| Server maintainability | **Needs planned refactor** | `server.js` remains broad in responsibility. Extract auth, billing, sync, push, appointments and health routes/services with shared middleware after current release stabilization. |
| CI automation | **Active** | `.github/workflows/ci.yml` runs production build/check/test/audit plus MySQL lifecycle and disposable backup/restore exercises. Earlier reports saying CI was missing are stale. |
| Live acceptance automation | **Active, environment-dependent** | `live-acceptance.yml` and scripts validate deployed health/readiness/version when credentials/environment are available. Keep live evidence separate from code-only CI. |
| Independent penetration test | **Open** | Self-review and automated tests are not a substitute for independent adversarial testing. |
| Accessibility (WCAG 2.2 AA) | **Automated/self-assessed; independent review open** | Static/accessibility guardrails exist; independent keyboard, screen-reader, zoom/reflow, mobile/landscape and contrast review remains open. |
| Backup / restore | **CI drill exercised; production-provider drill open** | Disposable MySQL backup → isolated restore runs in CI. Provider-level production PITR/restore evidence and recorded RPO/RTO are still required. |
| Dependency security | **Automated** | Production dependency audit is part of release CI. Keep results tied to the exact release commit. |
| Mobile contract | **Established** | `contracts/mobile-api.json` is the production-owned contract used by iOS and Android release baselines. |
| iOS release engineering | **Native baseline in validation** | Simulator test + Release compile CI exists. Store signing, final icon/artwork, App Store Connect, device/accessibility/security review and product parity remain external gates. |
| Android release engineering | **Native baseline in validation** | Unit/lint/debug/release build gate exists. Play signing/console, device/accessibility/security review and product parity remain external gates. |

## Launch blocking evidence

The remaining items that should block a claim of fully independently validated production readiness are:

1. Production Stripe live-mode end-to-end acceptance evidence.
2. Provider-level production backup/PITR restore exercise with recorded RPO/RTO.
3. Independent penetration test and remediation review.
4. Independent WCAG 2.2 AA accessibility review and remediation review.
5. Privacy/legal review for the actual operating model, including whether HIPAA, BAA/DPA, state consumer-health-data, retention/deletion, or other obligations apply.
6. Independent cryptographic review before enabling or marketing encrypted working-journal storage.

## Important wording

Pamet may store or organize health-related information, but that alone does not establish HIPAA compliance or make every Pamet relationship HIPAA-covered. Do not market Pamet as HIPAA compliant, SOC 2 certified, independently penetration-tested, or independently WCAG certified until the corresponding external evidence is complete.

## Release discipline

Every production change should preserve this separation:

- **Code evidence:** source review, tests, static checks, dependency audit, build/lint.
- **Environment evidence:** live Wasmer health/readiness, provider integrations, billing, delivery, backup/restore.
- **Independent evidence:** penetration testing, accessibility audit, cryptographic review, legal/compliance determinations.

A green CI build is necessary for release; it is not, by itself, proof that the independent/environment gates have been completed.
