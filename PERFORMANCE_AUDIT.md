# Pamet Performance Audit — current `main`

Date: 2026-09-04  
Baseline reviewed: `atskovski/pamet@1f0ffa503819fd3c893b17979d4fc62adba6cd07` (Pamet 1.6.9)

## Scope

Reviewed the complete repository tree and the production-critical execution paths across the browser entrypoint and production bundles, authentication/session lifecycle, service worker and static delivery, Express edge/application servers, database/session access patterns, telemetry, build pipeline, performance budgets, tests, and CI release gates.

The review intentionally prioritizes changes that affect startup cost, interaction latency, request amplification, database write volume, repeat-load behavior, and production operability. It does not treat a static source review as a substitute for deployed Lighthouse/Web Vitals or production load testing.

## Current production footprint

The committed production bundles on the reviewed `main` tree are:

- `dist/pamet.min.js`: **228,282 bytes** (~222.9 KiB raw)
- `dist/pamet.min.css`: **119,827 bytes** (~117.0 KiB raw)
- Combined raw CSS + JavaScript: **348,109 bytes** (~339.9 KiB)

The existing CI budget remains useful and currently allows:

- JavaScript: 300 KiB raw / 90 KiB gzip
- CSS: 160 KiB raw / 45 KiB gzip
- Combined: 450 KiB raw / 125 KiB gzip

The current bundle is still within the configured raw ceiling, but the login/startup path now pays for substantially more application code than it did during the earlier v1.5.1 audit.

## Findings and recommendations

### P0 — No performance blocker found in the Remember me change

The Remember me implementation adds no dependency and only a small UI/control layer. It uses the existing secure server session model rather than storing a plain-text password in browser storage. When selected, the existing persistent cookie/session behavior is retained for 30 days; when cleared, the server cookie and local browser marker become session-only.

This is preferable to saving a username/password pair in local storage and keeps the feature compatible with browser password managers through the existing `autocomplete="username"` and `autocomplete="current-password"` fields.

### P1 — Split the monolithic browser bundle after authentication

`js/main.js` eagerly imports nearly the entire application into one browser bundle, including billing/sharing, entitlement UI, care planning/workspace, notifications, encrypted sync, QR sharing, security, insights, advanced UX, and legal/version surfaces. A signed-out user on the login screen therefore downloads and parses code that cannot be used until after authentication, and many authenticated users download feature modules they may never open.

**Recommended implementation:** keep a minimal bootstrap bundle for performance guard, authentication, login presentation, brand shell, account switching, and release/update handling. Lazy-load the authenticated application after a valid session is established, then lazy-load infrequent feature groups on first navigation (billing/sharing, appointment/care workspace, QR/security, encrypted sync, advanced reports). Preserve the current fail-closed entitlement boundary server-side.

**Target:** reduce initial signed-out JavaScript transfer/parse cost materially without weakening CSP or entitlement checks.

### P1 — Reduce authentication database write amplification

The session authentication path updates `pamet_sessions.last_used_at` on every authenticated request. The legacy/device credential path similarly updates `pamet_devices.last_used_at` whenever a device credential is used. At higher request volume this converts otherwise read-heavy authenticated traffic into continuous writes and can increase row/index churn and database contention.

**Recommended implementation:** include `last_used_at` in the authentication read and only refresh it when stale by a coarse interval such as five minutes. A conditional update (`... WHERE last_used_at < NOW() - INTERVAL 5 MINUTE`) also works and keeps correctness simple. Device activity timestamps can use the same policy.

### P1 — Batch request telemetry instead of exporting on every API completion

The application currently records request metrics and can send OTLP metric/log requests for each API response, with an additional optional log-drain request. This is operationally useful but can multiply outbound requests under load and make telemetry transport part of the application's resource profile.

**Recommended implementation:** enqueue bounded in-memory telemetry records and flush in batches on a short interval or size threshold, with backpressure/drop accounting. Security/availability alerts that require immediate delivery can remain on the direct path. Flush best-effort during graceful shutdown.

### P1 — Move release assets to content-hashed immutable URLs

The service worker correctly uses release-specific cache names and bypasses API/share caching. However, the inner Express static layer intentionally serves `/assets` and `/dist` with ETags and `maxAge: 0` because filenames are not content-hashed. Outside the service-worker cache, browsers and intermediaries must revalidate assets rather than safely treating them as immutable.

**Recommended implementation:** emit content-hashed bundle names (for example `pamet.<hash>.js` / `.css`) plus a generated asset manifest consumed by the server-rendered shell and service worker. Serve hashed files with `Cache-Control: public, max-age=31536000, immutable`; keep HTML and `sw.js` no-store. This also removes the need to coordinate multiple manual `?v=` release tokens.

### P2 — Cache derived journal computations by entry revision

Pattern, dashboard, and report surfaces repeatedly derive summaries from the local journal. As history grows, repeated full-history scans can dominate render cost even when the underlying entry set has not changed.

**Recommended implementation:** maintain an entry revision/hash in the store and memoize derived metrics, pattern candidates, and summary inputs against that revision plus relevant time-window/filter arguments. Invalidate only on entry mutation/import/profile switch.

### P2 — Continue replacing broad DOM observation with lifecycle events

The existing `js/performance.js` guard coalesces page-wide MutationObserver callbacks to one animation-frame batch, which is a useful defensive measure. The longer-term architecture should continue moving feature refreshes to explicit Pamet lifecycle/navigation/store events so modules do not scan the document in response to unrelated DOM work.

### P2 — Add measured performance gates, not only bundle-size gates

The existing bundle budget prevents unbounded artifact growth but cannot catch long tasks, render churn, layout shift, slow API requests, or database contention.

**Recommended implementation:** add deployed-preview performance collection for desktop and mobile, plus a small authenticated navigation benchmark. Track at minimum LCP, INP, CLS, TBT/long tasks, API p50/p95 latency, and DB pool saturation. Keep performance thresholds visible in CI artifacts and trend them across releases rather than treating one Lighthouse run as a release guarantee.

## Existing strengths retained

- The broad MutationObserver guard coalesces expensive page-wide callbacks.
- Service-worker registration is centralized and explicitly checks for updates.
- Static PWA shell assets are cache-first inside the service worker while API and share routes bypass that cache.
- Production JavaScript/CSS already have blocking raw/gzip bundle budgets.
- MySQL uses a connection pool and recent schema/migration work includes scale-oriented indexes.
- CI runs build, static/release checks, unit/security tests, MySQL lifecycle integration, backup/restore, and multi-browser UI integrity.

## Recommended optimization sequence

1. Land the Remember me session-control change independently and validate login/logout/session expiry behavior.
2. Split signed-out/bootstrap code from the authenticated application bundle.
3. Throttle session/device `last_used_at` writes.
4. Batch OTLP/log-drain request telemetry.
5. Introduce content-hashed immutable release assets.
6. Memoize derived journal analytics by entry revision.
7. Add deployed-preview Web Vitals and authenticated navigation measurements.

This ordering targets measurable startup and backend amplification gains while avoiding a risky all-at-once rewrite of the health-journal application.

## Validation targets after deployment

Collect desktop and mobile measurements against the deployed preview and production release:

- LCP < 2.5 s
- INP < 200 ms
- CLS < 0.1
- TBT < 200 ms for the synthetic desktop/mobile smoke path
- authenticated API p95 tracked per release and alert threshold
- repeat navigation should visibly respond in the same frame or next animation frame for local-data screens
- no regression in auth, entitlement, local-data isolation, CSP, or offline shell behavior

Production timing and load numbers must be collected in a real deployed environment; this repository review does not invent those measurements.
