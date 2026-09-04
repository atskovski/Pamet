# Pamet 1.6.6 Tracking & Insights UX Patch

Date: 2026-09-04  
Base release: **Pamet 1.6.5**  
Assurance baseline: **Pamet 1.6.5**

## Scope

Pamet 1.6.6 is a client-focused tracking, Home, and observational-insights patch. It keeps the 1.6.5 authentication, billing, server-side entitlement verification, encryption, database architecture, and dependency baseline while extending the browser journal schema with optional context fields and clearer plan-aware custom-field limits.

## Improvements

- Clarifies **What are you feeling?** with explicit multi-select guidance.
- Replaces the ambiguous **Overall severity** wording with a plain-language symptom-intensity question and a 0–10 explanation.
- Adds optional context for sleep quality, caffeine, skipped meals, and a small set of routine/environment tags without making those fields mandatory.
- Adds **Auto-summarize** beside Notes. Notes remain blank by default; the user chooses whether to populate and edit a deterministic summary of the current check-in.
- Adds plan-aware custom-field guidance in the log sheet:
  - Free: up to 3 custom symptoms, moods, and activities; built-in medication list only.
  - Pro: up to 10 custom symptoms, moods, activities, and medication names.
  - Ultra: unlimited custom fields.
- Adds persistent current-plan / limit indicators and an upgrade comparison dialog when a limit is reached.
- Expands built-in medication categories while keeping specific custom medication names a Pro/Ultra capability.
- Adds a conservative observational analytics engine with data-completeness scoring, recent-change summaries, factor comparisons, context-tag comparisons, medication co-occurrence summaries, and an Ultra multi-factor comparison. Minimum sample/effect thresholds suppress weak noise.
- Ensures analytics language describes recorded associations only and does not diagnose, predict disease, infer medication effectiveness, or claim causation.
- Fixes the Home **Show Pamet observations** setting so the Home observation is visibly synchronized with the toggle.
- Changes **WHAT HOME WILL BUILD** to **WHAT PAMET WILL BUILD**.
- Expands the logging reward ladder to Bronze, Silver, Gold, Platinum, Diamond, and Beast with compact Home icons and progress toward the next tier.

## Release gate

Pamet 1.6.6 is not considered live until all of the following are true:

1. Exact-head CI quality, unit/security, MySQL integration, and browser UI-integrity checks are green.
2. The release PR is squash-merged to `main` without bypassing unresolved gates.
3. Wasmer deploys the merged `main` SHA.
4. Production `/api/health` reports `1.6.6`.
5. Production desktop/mobile browser smoke passes against the deployed SHA.
6. The `pamet-admin` mirror reaches exact-SHA parity where applicable.

## Assurance note

Independent penetration, accessibility, legal/compliance, provider, capacity, and production-readiness records that explicitly identify Pamet 1.6.5 remain the external assurance baseline for unchanged server/security architecture. The new client tracking and analytics behavior still requires the repository CI/browser gates in this release and is not presented as a clinical system or independent medical validation.