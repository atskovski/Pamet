# Pamet UI Integrity Gate

Pamet treats a user-facing control that silently does nothing as a release defect. The UI integrity gate combines static navigation-contract checks, disposable browser journeys, and a post-deployment production smoke test.

## What is covered

The gate validates:

- login ↔ create-account reversibility;
- primary navigation across Home, Calendar, Insights, Visit brief, and Settings;
- exactly one active primary screen after navigation;
- mobile and desktop Chromium layouts;
- the first-entry sheet open/close path;
- calendar previous/next controls;
- theme toggling;
- Notification health recheck behavior when the control is present;
- the full Free / Pro / Ultra plan comparison dialog;
- logout returning to a usable login/create-account state;
- visible interactive controls having accessible names;
- duplicate DOM IDs;
- placeholder `href="#"` links that are not explicitly controlled by application JavaScript;
- static `data-tab` / `data-nav` destinations resolving to real screens;
- uncaught browser exceptions and same-origin request failures;
- unexpected same-origin HTTP 5xx responses during UI journeys;
- deployed production public-shell and synthetic-session navigation smoke coverage.

## Three layers

### 1. Static UI contract

`npm run check:ui-contract`

Runs without a browser and is part of the normal `npm run check` release chain. It rejects duplicate IDs, orphaned navigation targets, unclassified placeholder links, missing primary screens, and static interactive controls that do not have application behavior or native form semantics.

### 2. Disposable end-to-end browser gate

`npm run test:ui-integrity`

Runs Playwright against the local production server wrapper with a disposable MySQL database. It creates test-only accounts and can safely exercise authentication, navigation, Settings, modal/sheet behavior, and logout without touching production data.

The CI job runs both desktop and mobile Chromium projects. Failed runs retain screenshots, video, traces, and the Playwright HTML report for 14 days. The application shell uses local/system typography rather than a blocking remote font stylesheet, and browser navigation waits on `DOMContentLoaded` so nonessential third-party resources cannot create false release failures after the shell is ready.

### 3. Production browser smoke

`PAMET_UI_BASE_URL=https://pamet.wasmer.app npm run test:ui-smoke`

Runs only non-destructive production journeys after the normal Wasmer release acceptance succeeds. It checks the deployed login/create-account shell and uses a browser-local synthetic session only to exercise SPA navigation and plan-comparison surfaces. It does not create, edit, or delete production health records.

## No-silent-control policy

Every interactive control must do at least one of the following:

1. navigate to another valid Pamet screen;
2. open or close a dialog, sheet, menu, or disclosure;
3. change persistent or visible UI state;
4. submit or initiate a request;
5. be disabled with a clear explanation of the unmet dependency.

A control that is enabled, clickable, and produces none of those effects is a defect. Dependency-backed features such as Stripe, email, OAuth, browser notifications, or external provider operations must fail with an actionable user-facing explanation rather than a silent no-op.

## Dead-end and loop definition

A dead end is a reachable state in which a user cannot continue, cancel, close, go back, switch primary tabs, or understand why progress is blocked. A loop is an unintended repeated transition between states that prevents the user from completing or abandoning a task.

Primary navigation is always expected to remain reachable outside intentionally blocking confirmation/security dialogs. Modal and sheet workflows must expose a close, cancel, completion, or equivalent exit path.

## Release policy

A PR is not considered release-green unless all three PR-side Pamet CI jobs pass:

- `quality`
- `integration`
- `UI integrity (desktop + mobile)`

After merge, production is not considered deployment-green until:

- Wasmer live acceptance passes;
- production browser UI smoke passes;
- scheduled-job OIDC acceptance passes;
- mobile contract validation passes;
- `pamet-admin` exact-SHA parity passes.

The browser gate complements, rather than replaces, independent accessibility testing, penetration testing, legal/privacy review, live Stripe lifecycle evidence, provider recovery exercises, and other external assurance work tracked in `GO_LIVE_STATUS.md`.
