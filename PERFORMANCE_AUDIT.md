# Pamet Performance Audit — v1.5.1

Date: 2026-09-03

## Scope

Reviewed the production entrypoints, bundled asset loading, service worker behavior, navigation/render architecture, global DOM observers, and visual contrast rules in `atskovski/pamet`.

## Primary findings

### 1. Multiple broad MutationObservers were reacting to nearly every DOM change
Several feature modules observe `document.body` with `{ childList: true, subtree: true }`. Each UI render can therefore trigger multiple follow-up scans and renders in the same interaction. This is a strong candidate for the sluggish menu/navigation feel because settings, calendar, insights, care UX, profile UX, and icon hydration all mutate the DOM.

**Fix:** `js/performance-v1.5.1.js` wraps broad document observers and coalesces their callbacks to one animation-frame batch. Targeted observers keep native timing.

### 2. Service worker registration was duplicated
`index.html` registered the service worker and the bundled runtime registered it again with a different query version. That causes unnecessary registration/update work during startup.

**Fix:** registration now remains in the page shell only; the duplicate runtime registration was removed from `js/main.js`.

### 3. Static shell requests were network-first with `cache: no-store`
The service worker forced network access for shell assets before using cache fallback. This reduced the value of the installed PWA cache and made repeat loads more sensitive to hosting/network latency.

**Fix:** versioned `/dist/`, `/assets/`, and manifest resources now use cache-first behavior. Query-string differences are ignored when matching the versioned shell cache, while navigation remains network-first with an offline fallback. API and share routes continue to bypass the cache.

### 4. The service worker precached three large login background images
Only the active login image is required for the initial shell. Preloading unused time-of-day images increases install bandwidth and cache work.

**Fix:** the shell precache now includes the primary login image only. Alternate images can still load normally when requested.

### 5. Primary green actions did not consistently meet the requested contrast treatment
Dark-mode primary buttons used dark text on green, and the plan CTA also used dark text on green.

**Fix:** all primary/green CTAs now use white text in light and dark modes, including the update prompt, plan CTA, first-entry action, and other `.btn-primary` surfaces. Dark-mode green is slightly deepened to maintain readable contrast.

## Bundle observations

Current committed production bundles are approximately:

- JavaScript: 172 KB minified
- CSS: 89 KB minified

Those sizes are not extreme for the current feature set. The more immediate performance risk is runtime DOM churn from cross-cutting observers and repeated render work, so this pass prioritizes interaction latency and repeat-load behavior before a larger code-splitting effort.

## Recommended next performance phase

1. Replace remaining broad MutationObservers in feature modules with explicit Pamet lifecycle events.
2. Add route-level instrumentation using `performance.mark()` / `performance.measure()` for Home, Calendar, Insights, Visit Brief, and Settings.
3. Add a CI performance budget for bundle size and Lighthouse/Web Vitals on a deployed preview.
4. Cache derived Store metrics/pattern calculations by entry revision so repeated screen renders do not rescan the entire journal history.
5. Consider lazy-loading infrequently used modules such as sharing, appointment workspace, QR, security, and billing after the user opens those features.
6. Replace release query strings with a single generated asset revision so HTML, service worker, and bundle cache identifiers cannot drift.

## Validation target after deployment

Run desktop and mobile Lighthouse against `https://pamet.wasmer.app/` and record:

- LCP < 2.5 s
- INP < 200 ms
- CLS < 0.1
- TBT < 200 ms
- repeat navigation should visually respond in the same frame or next animation frame

The current execution environment could inspect and modify GitHub but could not resolve the Wasmer hostname for an independent network timing run, so production timing numbers must be collected after the branch is deployed or through a CI/browser runner with network access.
