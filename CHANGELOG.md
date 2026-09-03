# Pamet Change Log

## [1.5.1] — 2026-09-03

### Care sharing and appointment clarity

- Replaced Caregiver access and Primary Care Access toggles with explicit sharing actions.
- Keeps sending, error, and success confirmations inside the active sharing window.
- Returns to Settings automatically after a successful secure invitation.
- Gives caregivers a deliberately limited summary while Primary Care receives a richer patient-generated Visit Brief with supported observations, medications, context, and discussion prompts.
- Refreshes the quick-profile badge when profiles are added or removed.
- Adds explicit date/time confirmation before saving an appointment.
- Makes local draft storage and secure appointment storage visibly distinct.
- Retries secure appointment sync before suggesting authentication and never logs the user out as a recovery shortcut.

---

This file is the repository system of record for completed product and engineering changes. It is not rendered inside the Pamet application.

## [1.5.0] — 2026-09-03

### Insights becomes an observational workspace

- Added 7 / 30 / 90-day comparison windows.
- Added filters for **Symptoms**, **Lifestyle**, **Medications**, and **Sleep / Stress**.
- Added per-observation first-seen, last-seen, supporting-entry count, and recent-vs-earlier direction.
- Added **Why am I seeing this?** evidence expansion with the actual comparison logic explained in plain language.
- Added data-completeness scoring across symptoms, sleep, stress, hydration, activity, medications, and notes.
- Added Archive / Restore for observations without deleting or mutating underlying journal entries.
- Reframed correlations as recorded co-occurrence and comparison only; Pamet does not infer diagnosis, direction, medication effectiveness, or cause.
- Kept quiet/no-observation states explicit rather than manufacturing a conclusion from sparse data.

### Visit Brief

- Renamed the user-facing **Doctor Report** surface to **Visit Brief**.
- Updated the primary sharing action to **Email visit brief** while retaining PDF export.
- Added compatibility normalization so historical feature-layer strings render with the current product name.

### Unified visual system

- Added a centralized `PametIcons` registry with one stroke weight, one coordinate system, and consistent accessibility semantics.
- Migrated primary navigation, appearance, profile, Visit Brief, Calendar, and new Insights controls onto the shared icon system.
- Formalized metadata, helper, body, control, section-heading, and page-heading type roles.
- Formalized production semantic colors: teal for navigation/actions; neutral for structure; sage/amber/rose for health-state meaning.
- Prevented the 1.5 production design layer from introducing Admin purple.

### Calendar evolution

- Added a **Today** shortcut.
- Added long-history text search across dates, symptoms, medications, activities, mood, and notes.
- Added symptom filtering and visual dimming for non-matching days in the current month.
- Added searchable history results that jump back to the matching calendar date.

### Accessibility hardening

- Added a keyboard-visible **Skip to Pamet content** link.
- Added stronger `aria-current`, screen labelling, accessible icon handling, and Escape support for profile dialogs.
- Standardized visible focus states and reduced-motion behavior.
- Added a release gate for the new accessibility/design-system requirements.
- External WCAG 2.2 AA review remains an independent assurance requirement and is not self-certified by this release.

### Release discipline

- Promoted Pamet to **1.5.0**.
- Rotated the PWA shell to `pamet-shell-v150-0`.
- Added static product-system regression checks for Insights behavior, observational language, type scale, semantic color usage, Calendar tools, icon consistency, and accessibility affordances.

---

## [1.4.0] — 2026-09-03

### Product clarity

- Added a shared top-bar profile icon when multiple profiles exist, giving users a fast profile switch path from every primary screen.
- Added a centered quick-profile chooser with current-profile context and a non-destructive switch confirmation.
- Reworked the Insights introduction into **Pattern readiness** states instead of a generic “0 days of data” message.
- Added staged guidance for first entry, baseline started, early comparisons, developing observations, and supported observations.
- Added explicit coaching to include ordinary/symptom-free days so Pamet does not overlearn only difficult days.
- Kept all pattern language observational and non-diagnostic.
- Corrected Calendar empty-day copy from “No symptoms logged” to **No entry recorded for this day**.
- Expanded the Calendar legend and per-day accessible labels so no-entry, symptom-free, mild, significant, and today states are distinguishable.

### Appointment reminders

- Added `/api/jobs/appointment-reminders` to the secure production edge.
- Uses the reminder timing stored by Appointment Workspace and checks due appointments every 15 minutes.
- Delivers only through user-approved Web Push subscriptions.
- Uses privacy-minimal lock-screen copy; detailed visit content stays inside Pamet.
- Uses appointment-specific push tags plus audit-log deduplication to avoid intentional repeat delivery.
- Serializes cron executions with a MySQL advisory lock and disables terminally invalid push endpoints.
- Kept existing daily reminder delivery in the same scheduled workflow.

### Repository cleanup

- Replaced release-numbered update files with stable `js/version-update.js` and `css/version-update.css` entry points.
- Removed the superseded duplicate `css/brand-v1.0.2.css`.
- Removed superseded version-specific update JS/CSS files.
- Refocused README on current product state, architecture, boundaries, repository organization, and active operational documents.
- Rotated the PWA shell to `pamet-shell-v140-0`.

---

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

### Appointment workspace

- Rebuilt Appointment Workspace so the UI renders before contacting the server.
- Replaced the unexplained **Authentication required** dead end with clear local-planning and reconnect states.
- Added local draft persistence that does not delete or overwrite health-history data.
- Added visit type, clinician/practice, date/time, visit reason, concerns, questions, and expanded reminder timing choices.
- Added a live Discussion Guide using the active profile's recent symptom changes, Pamet patterns, medications, and recent notes.
- Added a practical pre-visit checklist.
- Filtered displayed appointments to the currently active profile.
- Continued using the Ultra-only MySQL appointment create/list/delete backend and stored reminder timing with each appointment.

---

## [1.2.3] — 2026-09-03

- Added safe in-app release update prompts and PWA cache recovery.
- Separated loaded-client version from server version.
- Ensured update refreshes do not clear local Pamet data.

## [1.2.2] — 2026-09-03

- Hardened Wasmer deployment, server-authoritative release identity, and asset cache-busting.

## [1.2.1] — 2026-09-03

- Added security/mobile/PWA hardening, safe account switching, global sign-out, MFA QR setup, MySQL lifecycle coverage, and backup/restore CI drill.

## [1.2.0] — 2026-09-02

- Added cross-device account architecture, password reset, production observability, encrypted-sync infrastructure, and server-authoritative entitlements.

## [1.1.0]

- Added remote device revocation, MFA, Web Push, encrypted Ultra sync, distributed limits, and observability frameworks.

## [1.0.5]

- Dark-mode and authentication-brand refinements.

## [1.0.4]

- Production runtime consolidation and entitlement hardening.

## [1.0.3]

- Truthful empty state, Pamet pattern language, and privacy-minimal feedback.

## [1.0.2]

- Warm Clinical Minimalism, Pro/Ultra architecture, sharing/email/Stripe foundations.
