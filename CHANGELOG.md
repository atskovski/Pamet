# Pamet Change Log

This file is the repository system of record for completed product and engineering changes. It is not rendered inside the Pamet application.

## [1.3.0] — 2026-09-03

### Profile-aware Settings

- Added a persistent **Currently viewing** profile context card at the top of Settings.
- Shows active profile name, relationship, and entry count without requiring users to reopen Manage Profiles.
- Preserved the existing profile picker and separate per-profile local journal storage.
- Added an in-window confirmation before a new profile is created and activated.
- Confirmation explains that the current profile session will switch, the Pamet account remains signed in, existing profile data is preserved, and the new profile starts with zero entries.
- Existing-profile switches now show the same clear session/data-preservation explanation before reload.
- New profiles continue to receive their own empty entry store and must be tracked from scratch.

### Advanced sharing

- Reworked Advanced Sharing so progress, delivery errors, and success confirmation remain inside the active sharing modal.
- Added email-delivery readiness detection before sending.
- Added a visible sending state and a durable success state showing recipient, profile, permission, and expiration.
- Added **Send another** without leaving the current workflow.
- Continued using the authenticated `/api/sharing/invites` backend and Resend delivery path.
- Confirmed the backend removes the stored invite if email delivery fails.
- Documented `RESEND_API_KEY` + `EMAIL_FROM` and a verified sender/domain as the production email requirement.

### Appointment workspace

- Rebuilt Appointment Workspace so the UI renders before contacting the server.
- Replaced the unexplained **Authentication required** dead end with clear local-planning and reconnect states.
- Added local draft persistence that does not delete or overwrite health-history data.
- Added visit type, clinician/practice, date/time, visit reason, concerns, questions, and expanded reminder timing choices.
- Added a live Discussion Guide using the active profile's recent symptom changes, Pamet patterns, medications, and recent notes.
- Added a practical pre-visit checklist.
- Filtered displayed appointments to the currently active profile.
- Continued using the Ultra-only MySQL appointment create/list/delete backend and stored reminder timing with each appointment.
- Added regression checks for profile isolation, sharing delivery UX, appointment fallback behavior, and existing backend persistence routes.

### Layout and release discipline

- Realigned **Prepare with Ultra** headings, explanatory copy, and tool cards.
- Added dedicated responsive styles for profile context, confirmations, sharing results, appointment planning, and the discussion guide.
- Promoted the release from 1.2.x to **1.3.0** because this is a substantial backward-compatible capability expansion.
- Refreshed the service-worker release cache to `pamet-shell-v130-0`.

---

## [1.2.3] — 2026-09-03

### Safe application updates

- Added an in-app **New Pamet version available** prompt.
- Added **Update now** and **Later** actions.
- Checks `/api/health` with cache bypass on load, when the app returns to the foreground, and every 15 minutes while open.
- Separates the **actually loaded client version** from the **server version**, preventing a stale client from falsely displaying itself as current.
- Keeps the Settings footer tied to the loaded application release until the refresh completes.
- `Update now` requests a service-worker update/activation and reloads with a release-specific cache-buster.
- The update path does not clear localStorage, IndexedDB, journal entries, or other local Pamet data.
- Added service-worker `SKIP_WAITING` message support.
- Refreshed the PWA shell to `pamet-shell-v123-0` and service-worker registration to `sw.js?v=1230`.
- Added release assertions that fail if update detection is removed, local data clearing is introduced, or stale clients disguise their loaded version.
- Added responsive update-prompt styling with safe-area/mobile handling.

---

## [1.2.2] — 2026-09-03

### Deployment and release identity hardening

- Bumped the stabilization patch release to **1.2.2**.
- Made `package.json` the canonical production version source.
- Made the production edge serve the primary app document and inject the release into the Settings footer.
- Added `X-Pamet-Version` for direct deployed-release verification.
- Normalized `/api/health` and `/api/ready` to the same canonical release.
- Added production asset cache-buster rewriting.
- Refreshed the PWA shell to `pamet-shell-v122-0`.
- Added live environment acceptance checks for deployed release identity and readiness.
- Diagnosed Wasmer Anybuild failures from production logs: `npm install` ran before source copy, so a `postinstall: npm run build` hook could not resolve `js/main.js`.
- Removed the invalid `postinstall` build and kept `npm start` deterministic as `node secure-server.js`.
- Retained the explicit `npm run build` command for Wasmer's post-source-copy build phase.
- Regenerated `package-lock.json` and committed production bundles after stale artifact drift was found.
- Restored successful Wasmer promotion from GitHub `main` and verified production `/api/health`, `/api/ready`, and the Settings footer on 1.2.2.

---

## [1.2.1] — 2026-09-03

### Stability and release discipline

- Standardized semantic versioning and made `package.json` canonical.
- Added release-version consistency checks to CI.
- Reworked README/release-status documentation around current state vs future state.

### Security and account UX

- Centered Account Security and password-recovery dialogs.
- Fixed the asynchronous password-reset form-reference crash.
- Added safe account switching and local-data isolation between accounts.
- Replaced the legacy-device sign-in dead end with authorized migration to normal account sessions.
- Added **Sign out everywhere**.
- Rebuilt Account Security around devices, sessions, MFA setup/disable, and retry/error states.
- Added a local-only authenticator QR encoder.

### Mobile and PWA hardening

- Added safe-area, narrow-phone, landscape, input-zoom, touch-target, settings, report, QR, and modal safeguards.
- Made feedback confirmation prominent and auto-dismiss after five seconds.
- Moved service-worker registration into the external production bundle for CSP compatibility.
- Explicitly excluded API and sensitive sharing routes from service-worker caching.

### Production assurance

- Extended MySQL integration coverage for legacy upgrades and all-session revocation.
- Retained account/Stripe/device/sharing/encrypted-sync lifecycle coverage.
- Added a disposable MySQL backup → isolated restore drill.
- Added a disabled-by-default local journal encryption implementation framework with explicit review/recovery gates.

---

## [1.2.0] — 2026-09-02

### Production architecture

- Consolidated the browser runtime into one minified JavaScript bundle and one minified stylesheet.
- Added cross-device email/password authentication with revocable HttpOnly sessions.
- Added password-reset email flow and account recovery.
- Added server-authoritative Stripe entitlements and persisted Ultra appointment records.
- Added explicit sharing/session deletion and Stripe cleanup.
- Added Wasmer/MySQL migration hardening and distributed-rate-limit fallback.
- Added Grafana Cloud OTLP logs/metrics and readiness integration.

---

## [1.1.0]

- Added remote device revocation and Account Security.
- Added authenticator MFA.
- Added Web Push infrastructure.
- Added encrypted Ultra sync infrastructure.
- Added distributed rate limiting and observability frameworks.

---

## [1.0.5]

- Dark-mode and authentication-brand refinements.

## [1.0.4]

- Production runtime consolidation, entitlement hardening, and advanced plan capabilities.

## [1.0.3]

- Truthful empty state with no sample health history.
- Pamet pattern language instead of AI-first labels.
- Privacy-minimal product feedback.

## [1.0.2]

- Warm Clinical Minimalism brand system.
- Pro/Ultra plan architecture.
- Sharing, email, Stripe, persistent-login, and custom-symptom-management foundations.
