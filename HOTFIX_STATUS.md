# Pamet 1.6.7 Interaction Hotfix

Date: 2026-09-04  
Base release: **Pamet 1.6.6**  
Assurance baseline: **Pamet 1.6.6**

## Scope

Pamet 1.6.7 is a patch-only client interaction and layout hotfix. It does not change the database schema, authentication model, billing behavior, server-side entitlement enforcement, encryption design, or dependency specifications reviewed for 1.6.6.

## Fixes

- Centers and scales the logging reward badge so the icon and tier label sit cleanly inside one circular treatment.
- Makes the Patterns / Insights window controls functional with 7, 30, 60, and 90-day windows; 7 days is the default.
- Keeps Pattern readiness, data completeness, observation summaries, and supporting evidence synchronized to the selected time window.
- Makes “Why am I seeing this?” expand a visible evidence panel with the selected-window context.
- Makes Archive persist per profile, removes archived observations from the active workspace, and supports restoration from Archived.
- Adds live selection feedback to the plan-aware Log a symptom quota rows while preserving the existing Free / Pro / Ultra custom-field limits.
- Keeps built-in logging choices outside the custom-field quota; only saved custom fields consume custom slots.
- Aligns the Security & Devices recovery/session explanatory copy with the rest of the settings card.

## Release gate

The hotfix is not considered live until all of the following are true:

1. Exact-head CI quality, unit/security, MySQL integration, and Chromium/Firefox/mobile UI-integrity checks are green.
2. The hotfix PR is squash-merged to `main` without bypassing unresolved gates.
3. Wasmer deploys the merged `main` SHA.
4. Production `/api/health` reports `1.6.7`.
5. Production desktop/mobile browser smoke passes against the deployed SHA.

## Assurance note

Existing penetration, accessibility, legal/compliance, provider, capacity, and production-readiness records that explicitly identify Pamet 1.6.6 remain the evidence baseline for this patch. This document does not convert repository/self-review evidence into an independent certification and does not claim that external assurance was rerun merely because the patch version changed.
