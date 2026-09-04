# Pamet 1.6.6 Tracking & Insights UX Patch

Date: 2026-09-04  
Base release: **Pamet 1.6.5**  
Assurance baseline: **Pamet 1.6.4**  
Dependency baseline: **Pamet 1.6.4**

## Scope

Pamet 1.6.6 is a client-focused tracking, Home, and observational-insights patch built on the 1.6.5 application release. It keeps the authentication, billing, server-side entitlement verification, encryption, database architecture, and dependency graph unchanged. The repository's formal security/go-live/readiness records remain on the 1.6.4 assurance baseline; 1.6.5 was a client/Home patch and did not advance those independent/provider assurance records.

This patch extends the browser journal schema with optional context fields, clearer plan-aware custom-field limits, richer observational analysis, and a compact logging-reward experience.

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

The repository governance/security assurance baseline remains Pamet 1.6.4, including the current `THREAT_MODEL.md`, `GO_LIVE_STATUS.md`, `PRODUCTION_READINESS.md`, and `REAL_ENVIRONMENT_ACCEPTANCE.md` records. Those records explicitly distinguish automated repository evidence from still-open independent/provider assurance gates. The unchanged `package-lock.json` dependency graph is also rooted at Pamet 1.6.4. Pamet 1.6.6 does not broaden those assurance claims; its new client tracking and analytics behavior must pass the repository CI/browser gates and is not presented as clinical validation, diagnosis, or emergency monitoring.