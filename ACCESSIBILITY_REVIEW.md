# Pamet Accessibility Review

Pamet targets **WCAG 2.2 AA** for the web/PWA experience. This document defines the external review scope and the evidence needed before Pamet can describe that review as independently completed.

## Current internal guardrails

Pamet currently includes automated/static checks for:

- visible keyboard focus
- skip navigation
- reduced-motion preference
- centered, bounded modal layouts
- mobile safe areas and narrow-screen reflow
- accessible names for icon-only controls where they can be statically verified
- current-screen navigation semantics
- non-color-only Calendar labels
- local authenticator QR plus text setup key fallback
- minimum mobile input sizing to avoid browser focus zoom

These controls are engineering guardrails, not a certification.

## Required independent review

A qualified reviewer should test the deployed production candidate on current versions of at least:

- Chrome + Windows
- Firefox + Windows
- Safari + macOS
- Safari + iOS
- Chrome + Android

Assistive-technology coverage should include at minimum:

- NVDA + Chrome or Firefox
- VoiceOver + Safari on macOS
- VoiceOver + Safari on iOS

## WCAG 2.2 AA review matrix

### Keyboard and focus

- Reach every interactive control without a pointer.
- Verify logical focus order on Home, Calendar, Insights, Visit Brief, Settings, login, registration, recovery, profile switching, sharing, Appointment Workspace, and Account Security.
- Verify visible focus is not obscured by sticky navigation or dialogs.
- Verify Escape behavior for dialogs where closing with Escape is appropriate.
- Verify focus returns to the invoking control after modal dismissal where applicable.

### Screen-reader semantics

- Confirm headings form a meaningful hierarchy.
- Confirm active navigation state is announced.
- Confirm icon-only controls have useful names and decorative icons are ignored.
- Confirm Calendar days announce date plus no-entry / symptom-free / symptom state.
- Confirm Insights filters, 7/30/90-day window controls, trend badges, evidence expansion, Archive/Restore, and data completeness are understandable without relying on visual layout.
- Confirm status/error/success messages are announced at the right time and are not repeatedly announced.

### Reflow and zoom

- Test 200% browser zoom.
- Test 400% browser zoom where applicable under WCAG reflow expectations.
- Verify no essential horizontal scrolling at narrow equivalent widths.
- Verify modals remain reachable and scroll internally rather than clipping content.
- Verify long symptom, medication, clinician, profile, and email values do not destroy layout.

### Color and contrast

- Measure text, icon, border, focus-ring, and control contrast in light and dark modes.
- Confirm severity/health meaning is not conveyed by color alone.
- Confirm teal action semantics and sage/amber/rose health-state semantics remain distinguishable without requiring color perception.
- Confirm Admin purple remains isolated to the separate private Admin environment and is not required to understand production Pamet.

### Pointer and touch

- Verify target size and spacing on narrow phones.
- Test Calendar day selection, Today, search, symptom filters, Insights chips, evidence expansion, Archive/Restore, profile switch, and Account Security controls.
- Confirm no critical action depends on hover.

### Forms, errors, and recovery

- Test registration, login, password reset/change, MFA confirmation, feedback, symptom logging, sharing, Appointment Workspace, and account deletion.
- Confirm labels, instructions, validation, and errors identify the affected field and recovery action.
- Confirm errors are not conveyed solely through color.

### Dynamic content

- Verify profile switching, Calendar search results, Insights rerendering, evidence expansion, plan changes, security state, and success notifications do not create unexpected focus loss.
- Confirm loading and retry states expose meaningful status to assistive technology.

## Evidence package

The independent reviewer should return:

1. tested production/staging commit and URL
2. device/browser/assistive-technology matrix
3. WCAG criterion mapping
4. defect severity and reproduction steps
5. screenshots or short recordings where useful
6. remediation recommendations
7. retest results for fixed issues
8. reviewer/company identity and review date

## Closure rule

Do **not** claim Pamet is independently WCAG 2.2 AA reviewed until the external reviewer has delivered the report, blocking/high-severity findings have been remediated or formally accepted with rationale, and the relevant fixes have been retested.
