# Pamet — Personal Health Journal

**Version 2.0.1 — Phase 2 production hardening** · **Your health history, finally useful.**

Pamet is a privacy-first personal health journal designed to help people consistently document symptoms, medications, lifestyle factors, and user-provided medical information, then turn those observations into useful, understandable health history.

> **Track what you feel. See what changes. Bring the story to your doctor.**

Pamet is observational, not diagnostic: **Pamet observes. Pamet does not diagnose.** It is not an emergency-monitoring system, clinical decision tool, or replacement for professional medical care.

## Executive Summary

Most symptom trackers are good at collecting information but leave the user responsible for interpreting it. Pamet is designed around a clearer progression:

- **Free — Track:** Build a reliable health history.
- **Pro — Understand:** Identify trends, patterns, and relationships in that history.
- **Ultra — Prepare:** Turn that history into useful information for appointments and coordinated care.

**Track → Understand → Prepare**

## Product Vision

Create the most trusted personal health journal for turning everyday symptoms and health observations into information people can actually use.

Pamet should help a person answer:

- What have I been experiencing?
- When did it change?
- Is there a pattern?
- What has changed since my last appointment?
- What should I remember to tell my doctor?
- Can I show my doctor a concise history instead of trying to remember everything?

### Product Promise

> **Don't just track your symptoms. Understand them.**

The long-term vision is a longitudinal health-history layer: a structured record of what a person experiences between medical appointments that complements medical care rather than replacing it.

## Product Principles

1. **Pamet observes; it does not diagnose.** Trends and relationships are described as observations, not diagnoses or causal conclusions.
2. **Logging must remain easy.** The core habit is capture, and meaningful entries should take seconds: **Three taps. That's the whole log.**
3. **Build trust before monetizing.** Privacy language, data handling, subscription terms, cancellation, export, and deletion should be clear and non-manipulative.
4. **Data accumulation creates value.** Free users receive enough history and functionality to experience real value before an upgrade is requested.

## Core Product Architecture

Pamet is organized around six areas:

| Area | Purpose |
| --- | --- |
| **Today** | Fast logging of symptoms, medications, mood, sleep, activity, lifestyle factors, notes, and custom trackers. |
| **History** | Timeline/calendar review, date filtering, symptom/medication/lifestyle history, notes, and record references. |
| **Insights** | Trends, comparisons, **What Changed?**, correlation observations, and data-strength context. |
| **Medical Records** | A structured home for user-provided health records. Clinical integrations are not implied by the MVP. |
| **Reports** | Concise, doctor-ready summaries. The core artifact is the **Visit Brief**. |
| **Care** | Explicit, revocable sharing with trusted people. Care is coordination, not continuous monitoring. |

The core loop is **Log → Accumulate → Understand → Summarize → Share → Return**.

## Plans

Pamet contains **no advertising on any plan**.

|  | Free — **Track** | Pro — **Understand** | Ultra — **Prepare** |
| --- | --- | --- | --- |
| Price | $0 | $6.99/mo or $59.99/yr | $12.99/mo or $99.99/yr |
| Logging | Unlimited | Unlimited | Unlimited |
| History | 90-day rolling view | Unlimited | Unlimited |
| Weekly summary | ✓ | ✓ | ✓ |
| Custom trackers | 3 | Unlimited | Unlimited |
| Reminders | 1 | Unlimited | Unlimited |
| Correlation insights | — | ✓ | ✓ |
| Advanced trends / What Changed? | — | ✓ | Advanced |
| Visit Briefs | 1/month | Unlimited | Unlimited |
| CSV / JSON data export | ✓ | ✓ | ✓ |
| Basic sharing | — | ✓ | ✓ |
| Multiple caregivers / roles | — | — | ✓ |
| Appointment preparation | — | — | ✓ |
| Longitudinal analysis | — | — | ✓ |
| Multiple separate profiles | — | — | ✓ |
| Advanced Visit Brief | — | — | ✓ |

**Pro is the recommended plan for most individual users.** Its annual option saves about 28%. Ultra is intentionally positioned as a stretch tier for families, caregivers, and people preparing for more complex care conversations. Ultra purchasing requires its Stripe price IDs and `ULTRA_ENABLED=true` in the deployment.

## Phase 2 Highlights

- Ten useful starting choices in each logging category: physical symptoms, emotional feelings, activity, and medication types.
- Paired **+ / −** controls in every category; removing a custom option identifies it by name and requires confirmation.
- A lighter, layered dark palette with WCAG AA text contrast and 3:1 control-boundary contrast.
- Tap/click Settings explanations with keyboard support, outside-click dismissal, and correct behavior inside toggle labels.
- Data export on every plan, a validated local password-change workflow, persistent logout, and complete account deletion across local storage, backend account data, sharing records, audit records, and active Stripe billing.
- Ultra multi-profile management with separate on-device entry storage for every profile.
- Ultra appointment preparation, 90-day longitudinal comparisons with data-strength context, Advanced Visit Briefs, and role/expiration-based sharing.

## v1.0.3 Highlights

- New accounts begin with a truthful empty health history: no sample entries, fake dashboard metrics, observations, streaks, or recent-entry content.
- Home replaces empty metrics with one focused first-log prompt. Metrics and Recent entries appear only after a real entry exists.
- “Pamet pattern detection” and observational Pamet language replace AI-first product labels.
- Logging requires a symptom status, mood, and activity before saving; **No symptoms today** remains a valid entry.
- **Help improve Pamet** records privacy-minimal product feedback without account identifiers or health data.
- Refined scalable Pamet mark plus complete installable-PWA icons, manifest metadata, shortcut, and offline shell.

## v1.0.2 Foundations

- Persistent sign-in across browser restarts until explicit logout.
- Account creation is hidden on devices that already have a Pamet account.
- New **Warm Clinical Minimalism** brand system using Deep Teal, Sage, Sky Blue, warm neutrals, Inter UI typography, restrained surfaces, and an organic Pamet mark.
- **Custom symptoms** removed from Settings; custom fields remain managed from the Log flow.
- **Caregiver access** and **Primary Care Access** are Pro-or-higher features with entitlement checks before access can be configured.
- Caregiver/provider sharing uses explicit invitations, read-only snapshots, expiration, and revocation. It does **not** provide live monitoring or a live doctor portal.
- **Weekly digest email** is explicit opt-in and uses the account email.
- Registration confirmation email support.
- Stripe web subscriptions with an in-app Payment Element, server-verified entitlements, webhook handling, seven-day trial support, and a customer billing portal.
- **What Changed?** added as a signature Pro experience.
- Pattern language rewritten to remain observational rather than causal or prescriptive.
- Repository-only `CHANGELOG.md` added as the ongoing system of record.

## Visual Identity

Pamet uses **Warm Clinical Minimalism**: warm and personal enough to feel like a journal, credible enough for health information, and precise enough for insights.

| Role | Color | Hex |
| --- | --- | --- |
| Brand primary | Deep Teal | `#0F3D3E` |
| Primary action | Sage Green | `#4CAF7A` |
| Information | Sky Blue | `#6EA8D8` |
| Application background | Warm Gray | `#F4F5F2` |
| Warm/editorial background | Soft Sand | `#F5EDE4` |
| Secondary text | Slate | `#5B6B73` |
| Primary text | Charcoal | `#263638` |
| Accent | Terracotta | `#C1633D` |
| Caution/change | Ochre | `#D9A441` |
| Increased-symptom data accent | Muted Berry | `#8E3B4F` |

**Inter** is the primary product typeface. A restrained serif may be used only for selective editorial moments. Color must never be the sole indicator of a trend, error, completion state, or permission state.

## Architecture

Pamet remains **local-first** for journal entries. Phase 2 uses a Node.js backend only for functionality that cannot safely be implemented as browser-only JavaScript:

Production deployments track the protected `main` branch so only reviewed, merged releases are promoted to `pamet.wasmer.app`.

- Stripe subscriptions and verified entitlements
- Registration and weekly-digest email delivery
- Secure, expiring caregiver/provider shares
- Minimal account metadata needed to support those services

Journal notes and full health history are **not automatically synchronized to the server**. Weekly digest data is an aggregate snapshot. Sharing uploads only the snapshot the user explicitly chooses to share.

```text
Pamet/
├── index.html
├── share.html
├── css/styles.css
├── css/brand-v1.0.3.css
├── css/release-v1.0.3.css
├── css/phase2.css
├── js/auth.js
├── js/store.js
├── js/app.js
├── js/v1.0.3.js
├── js/feedback-v1.0.3.js
├── js/phase2.js
├── assets/pamet-mark.svg
├── db/schema.sql
├── server.js
├── package.json
├── manifest.webmanifest
├── sw.js
├── .env.example
└── .github/workflows/weekly-digest.yml
```

## Run locally

The core journal still works as a static local-first app:

```bash
python3 -m http.server 8099
```

Full billing/email/sharing services require Node 20+, MySQL, and configured environment variables:

```bash
cp .env.example .env
npm install
npm start
```

## Optional Email Setup

Email remains disabled unless both Resend environment variables are configured. Phase 2 does not require email for core logging, feedback, billing, or installability.

```text
RESEND_API_KEY=
EMAIL_FROM=Pamet <hello@your-verified-domain.example>
```

Supported emails:

- Registration confirmation: “Thanks for registering with Pamet.”
- Weekly digest: sent only after explicit opt-in to the account email.
- Caregiver/provider invitation: secure expiring link to the selected read-only snapshot.

Email subjects intentionally avoid symptom details.

## Product Feedback Storage

The Settings screen includes **Help improve Pamet**. Feedback is stored in the deployment’s existing MySQL database in `pamet_feedback` with only:

- category
- optional 1–5 rating
- message (maximum 1,000 characters)
- app version
- originating screen
- created timestamp

The table contains no user ID, email, device credential, IP-address field, journal-entry field, symptom field, medication field, or note field. Pamet does not automatically attach health or account data; the form also asks users not to put medical or account details in the free-text message. A valid Pamet device credential is required to submit feedback, but it is used only to authenticate the request and is not attached to the stored feedback row.

## Weekly Digest Scheduling

The included GitHub Action calls the protected weekly job. Configure repository Action secrets:

```text
PAMET_APP_URL=https://pamet.wasmer.app
PAMET_CRON_SECRET=<same value as deployment CRON_SECRET>
```

## Privacy and Security Boundaries

- User passwords stay device-local and are PBKDF2-hashed; the backend does not receive the password.
- Stripe plan state is verified server-side; the browser cannot self-upgrade a plan.
- Sharing links are random, expiring, revocable, and stored only as token hashes server-side.
- Weekly digest email subjects contain no symptom details.
- Caregiver sharing is **coordination, not monitoring**. There are no live caregiver alerts, missed-log alerts, emergency detection, or automated symptom escalation.
- Primary-care sharing is a read-only Visit Brief link, **not** a live clinician portal.
- The old “End-to-end encryption” toggle is hidden because v1.0.1 did not implement true E2E encryption. That claim should not return until a real encryption architecture is built and reviewed.

Before production handling of sensitive health information, complete qualified security, privacy, and legal review of the deployed architecture and claims.

## Roadmap Boundaries

### Now — v1.0.3

Local-first logging, 90-day Free history, Pro unlimited history, weekly summary/digest infrastructure, basic trends/correlations, What Changed?, Visit Brief, reminders, subscription management, export/delete, and basic read-only sharing.

### Next — Phase 2

Ultra, multi-profile management, advanced caregiver permissions, appointment preparation, longitudinal analysis, advanced Visit Briefs, and more sophisticated sharing.

### Not planned for initial product

Live caregiver alerts, real-time symptom escalation, missed-log caregiver notifications, emergency detection, diagnosis, medication recommendations, definitive drug-interaction flagging, and a live doctor portal.

---

**Pamet**  
**Your health history, finally useful.**  
Track what you feel. See what changes. Bring the story to your doctor.
