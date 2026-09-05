# Pamet Performance Architecture — v1.6.9

Date: 2026-09-04  
Architecture branch: `perf/best-in-class-architecture`  
Baseline: `atskovski/pamet@ba2a08f213bf9f7a7d12e03b2de055d3735bbf56`

## Outcome

The high-impact architecture work identified in the repository-wide performance review has been implemented and is enforced by CI. The release now optimizes the signed-out/login critical path separately from authenticated feature code, serves immutable content-hashed production assets, memoizes repeated journal derivations, bounds authentication activity writes and telemetry amplification, and records privacy-preserving real-user performance measurements.

The previous production shell required approximately **339.9 KiB raw JavaScript + CSS** before the application could use the monolithic browser bundle. The performance-first build currently measures:

- Signed-out critical path: **184.1 KiB raw / 48.1 KiB gzip**
- Total split application payload: **431.9 KiB raw / 115.3 KiB gzip**
- Bootstrap JavaScript: **100.5 KiB raw**
- Authenticated feature JavaScript: **189.8 KiB raw**

That is approximately a **45.8% reduction in raw JavaScript/CSS on the signed-out critical path** versus the prior monolithic shell. Total code is intentionally larger than the old single bundle because the new architecture adds real-user measurement, store memoization, split-release infrastructure, and a repeated final dark-mode safety layer while moving non-critical work off the first-load path.

## Implemented architecture

### 1. Split the signed-out critical path from authenticated features

`js/main.js` is now the small security/login/bootstrap entrypoint. It eagerly loads only the code required for authentication, account isolation, entitlement enforcement, local store integrity, security/recovery, login presentation, version handling, and the shared shell.

Authenticated/heavy modules are owned by `js/authenticated-features.js` and load only after a valid Pamet session. The feature payload includes Insights, care/appointment workspaces, sharing, encrypted sync, QR sharing, billing, notifications, advanced UI, and other authenticated product surfaces.

The browser also prefetches the authenticated payload after the user starts interacting with sign-in, but skips speculative prefetch on Save-Data or constrained 2G connections.

### 2. Split critical and authenticated CSS

`css/bootstrap.css` contains the shell, login, design system, security/recovery, accessibility, release update, mobile, contrast, and dark-mode rules required before authentication.

`css/authenticated.css` contains feature-specific styles and is loaded with the authenticated JavaScript bundle. The unified dark-mode layer remains last in both style contracts so lazily loaded feature CSS cannot regress dark-surface readability.

### 3. Content-hashed immutable release assets

The production build now emits both stable compatibility aliases and content-hashed immutable files:

- `pamet.bootstrap.<hash>.js`
- `pamet.features.<hash>.js`
- `pamet.styles.<hash>.css`
- `pamet.features.<hash>.css`

`dist/asset-manifest.json` is generated on every production build. The secure edge reads that manifest, injects the exact release assets into the server-rendered shell, preloads critical CSS/JavaScript, and serves hashed files with `Cache-Control: public, max-age=31536000, immutable`.

HTML, the service worker, and the asset manifest remain revalidated/no-store so releases cannot be pinned by stale shell metadata.

### 4. Manifest-driven service worker

The service worker no longer relies on manually coordinated query tokens for production bundles. At install time it reads the generated asset manifest and caches the exact hashed release assets. Static assets remain cache-first, navigation remains network-first with an offline shell fallback, and `/api/` plus `/share` traffic bypasses the PWA cache.

### 5. Memoized journal analytics

Repeated local derivations are memoized by store revision without changing Pamet's data contract. The cache covers:

- pattern calculations
- dashboard metrics
- Visit Brief/report derivations
- total logged-day calculations
- calendar date lookup

Caches invalidate after journal, settings, or profile persistence changes. This prevents repeated full-history scans when the underlying health journal has not changed.

### 6. Bounded authentication activity writes

The production database bootstrap throttles `pamet_sessions.last_used_at` and `pamet_devices.last_used_at` activity updates. Repeated authenticated requests inside the five-minute activity window do not perform redundant database writes, while stale activity timestamps use a conditional database update.

This turns a formerly write-amplified authenticated read path back into a predominantly read-oriented workload and reduces index/row churn as traffic grows.

### 7. Batched telemetry transport

Grafana OTLP logs and metrics are now queued into small bounded batches before leaving the process instead of creating an outbound transport request for every API completion. Repetitive successful request log-drain records are coalesced briefly because exact request counts already exist in metrics; failures and alert-oriented traffic stay on the immediate path.

This reduces telemetry connection/request amplification without removing operational visibility.

### 8. Privacy-preserving Web Vitals

The browser now records LCP, INP, CLS, FCP, and TTFB through `PerformanceObserver` and sends a bounded payload to `/api/performance`.

The payload contains only performance timings/ratings and a coarse Pamet screen name. It does **not** include symptom entries, medications, notes, journal text, form values, email addresses, account identifiers, or other health-journal content.

The platform runtime snapshot aggregates these measurements so actual deployed-user performance can guide further optimization instead of relying only on synthetic bundle size.

### 9. Performance-specific release gates

CI now blocks regressions using separate budgets for bootstrap and authenticated bundles as well as aggregate raw/gzip limits. Current ceilings are:

- Bootstrap JS: 170 KiB raw / 55 KiB gzip
- Authenticated JS: 190 KiB raw / 65 KiB gzip
- Bootstrap CSS: 115 KiB raw / 38 KiB gzip
- Authenticated CSS: 90 KiB raw / 30 KiB gzip
- Signed-out initial path: 260 KiB raw / 88 KiB gzip
- Total application payload: 500 KiB raw / 175 KiB gzip

CI also uploads the generated manifest and performance bundles as build evidence, validates content hashing/immutable delivery, runs architecture-specific tests, executes MySQL lifecycle + backup/restore integration, and retains the Chromium/Firefox/mobile UI-integrity gate.

## Performance principles now enforced

1. Do not make signed-out users download code they cannot use.
2. Do not make returning browsers re-download unchanged versioned assets.
3. Do not recompute journal analytics when the journal revision has not changed.
4. Do not turn every authenticated read into a database activity write.
5. Do not create one observability network request per application request when batching is safe.
6. Do not trade performance for weaker entitlement, CSP, account-isolation, or health-data boundaries.
7. Measure real deployed performance and optimize the slowest actual paths rather than guessing.

## Remaining optimization policy

The architecture is now prepared for finer route/feature-group splitting if real-user Web Vitals and authenticated navigation measurements show that the authenticated feature bundle is still a meaningful interaction bottleneck. That next split should be evidence-driven because many existing Pamet feature modules initialize through side effects; converting them into route-level lifecycle modules without measurements would add complexity and regression risk while providing uncertain user-visible benefit.

The immediate production targets remain:

- LCP < 2.5 s
- INP < 200 ms
- CLS < 0.1
- synthetic TBT < 200 ms
- authenticated API p95 tracked per release
- no regression in auth, entitlements, account isolation, strict CSP, offline shell behavior, or health-journal privacy

The new RUM path makes those targets observable after deployment and gives future optimization work a concrete performance baseline.
