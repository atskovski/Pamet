# Contributing to Pamet

Pamet is organized by feature ownership rather than release-numbered source files. Keep changes inside the smallest owning module possible so health-data, authentication, billing, sharing, and presentation concerns do not silently bleed together.

## Browser module ownership

- `js/auth.js` — email/password account lifecycle and session UX.
- `js/oauth-login.js` — Google/Apple provider discovery and OAuth entry/return UX.
- `js/store.js` — local application state and persistence contract.
- `js/insights.js` — Pamet observations, evidence, trend windows, and insight presentation.
- `js/care-planning.js` — care-planning and visit preparation flows.
- `js/care-ux.js` — caregiver/provider sharing UX and appointment-workspace presentation.
- `js/billing-sharing.js` — Stripe checkout, plan state, and sharing-related paid capability UX.
- `js/security.js` — account-security dialogs, recovery/device/MFA UX.
- `js/notifications.js` — browser notification and push subscription UX.
- `js/platform-foundation.js` — capability discovery, export foundation, and notification health.
- `js/platform-experience.js` — user-facing platform capability/status experiences.
- `js/experience.js` — calendar, Visit Brief, and broader product-experience flows.
- `js/product-clarity.js` — cross-screen clarity, empty states, profile context, and explanatory UI.
- `js/ui-ux.js` — cross-cutting shell/UI refinements that do not belong to a narrower feature owner.
- `js/main.js` — composition only: imports feature modules and publishes canonical browser release identity. Avoid feature logic here.

## Server ownership

- `secure-server.js` — deployment edge only: release normalization, hardened headers, bounded auth edge controls, and reviewed route composition.
- `server.js` — legacy application composition while extraction continues. New self-contained domains should prefer `routes/` + `lib/` rather than adding more direct handlers here.
- `routes/oauth-auth.js` — Google/Apple OAuth authorization-code flows and external identity linking.
- `routes/platform.js` — platform capability/status routes.
- `routes/operations-jobs.js` — protected operational/background-job endpoints.
- `lib/` — reusable domain/service logic with no browser presentation responsibility.

## Change rules

1. Do not add release-numbered source filenames. Release identity comes from `package.json`.
2. Do not hard-code asset cache versions. Derive them from the canonical package version/build path.
3. Do not commit provider credentials, API keys, Apple `.p8` material, or deployment secrets.
4. Keep health-data semantics observational; do not introduce causal/diagnostic claims without the corresponding reviewed product/clinical gate.
5. Keep new browser behavior compatible with strict CSP: no inline event handlers or inline style attributes in active production UI.
6. Update or add an executable acceptance check when changing a high-blast-radius contract such as authentication, billing, sharing, encryption, migrations, or production deployment behavior.
7. `npm run build`, `npm run check`, `npm test`, the MySQL integration matrix, dependency audit, and backup/restore drill must all be green before production merge.

## External production dependencies

Repository CI proves code readiness. External services are considered ready only when the live acceptance workflow verifies the deployed environment. For Google/Apple sign-in, follow `docs/OAUTH_SETUP.md`; production must report both providers enabled and redirect their start routes to the expected provider hosts before the release is considered green.
