# Pamet 1.6.5 Browser Stability Hotfix

Date: 2026-09-04  
Base release: **Pamet 1.6.4**  
Assurance baseline: **Pamet 1.6.4**

## Scope

Pamet 1.6.5 is a patch-only browser-loading and cache-consistency hotfix. It does not change the database schema, authentication model, plan entitlements, billing behavior, health-journal data model, encryption design, or server-side dependency architecture reviewed for 1.6.4.

## Fixes

- Removed the redundant Google Fonts request for Georgia from the application shell.
- Aligned the HTML JavaScript and CSS asset URLs to the release token `v=165`.
- Rotated the service-worker shell cache to `pamet-shell-v165-1` and aligned its cached JavaScript/CSS URLs to `v=165`.
- Rotated the browser service-worker registration URL to `sw.js?v=1650` with `updateViaCache: none`.
- Removed the obsolete inline service-worker registration from `index.html`; `js/main.js` is the single owner of registration/update behavior.
- Updated HTTP/release checks so asset URLs are derived from the semantic release version instead of accepting the historical hard-coded `v=1200` token.
- Added regression assertions covering HTML ↔ service-worker asset-token parity and the absence of the redundant Georgia request/inline worker registration.

## Release gate

The hotfix is not considered live until all of the following are true:

1. Exact-head CI quality, unit/security, MySQL integration, and browser UI-integrity checks are green.
2. The hotfix PR is squash-merged to `main` without bypassing unresolved gates.
3. Wasmer deploys the merged `main` SHA.
4. Production `/api/health` reports `1.6.5`.
5. Production desktop/mobile browser smoke passes against the deployed SHA.
6. The `pamet-admin` mirror reaches exact-SHA parity where applicable.

## Assurance note

Existing penetration, accessibility, legal/compliance, provider, capacity, and production-readiness records that explicitly identify Pamet 1.6.4 remain the evidence baseline for this patch. This document does not convert repository/self-review evidence into an independent certification and does not claim that external assurance was rerun merely because the patch version changed.
