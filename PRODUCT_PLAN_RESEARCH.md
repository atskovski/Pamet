# Pamet v1.2.0 plan and product review

Reviewed 2026-09-02. This document records product decisions, not medical or legal advice.

## Competitive evidence

- Bearable makes broad tracking, reminders, a 30-day view, and CSV export available free; premium differentiates with deeper correlations, comparison grids, longer reports, and unlimited goals/experiments. This means Pamet should not rely on basic logging as its paid differentiator. Sources: [Bearable Free vs Premium](https://bearable.app/support/common-questions/bearable-free-vs-premium-features/), [Bearable Premium guide](https://bearable.app/support/uncategorized/how-to-use-bearable-premium/).
- Daylio differentiates on extremely fast entry, customization, goals, visual history, backups, biometric locking, advanced statistics, and PDF/CSV export. Pamet should match clarity and speed but avoid becoming a generic mood journal. Sources: [Daylio](https://daylio.net/), [Daylio Premium features](https://daylio.net/faq/docs/daylio-faq/about/daylio-premium-features/), [Daylio App Store](https://apps.apple.com/us/app/daylio-journal-mood-tracker/id1194023242).
- Guava’s strongest distinction is assembling records and helping users prepare for visits. Pamet can compete with a narrower, calmer experience focused on turning user-recorded history into an effective care conversation. Sources: [Guava plans](https://guavahealth.com/plans), [Guava](https://guavahealth.com/).
- Bearable’s listed US pricing ($6.99 monthly and $34.99 annual) and Daylio’s App Store pricing ($4.99 monthly and $35.99 annual) make Pamet Pro’s $59.99 annual price a premium position. It is reasonable only if What Changed, health-focused correlations, sharing, and Visit Briefs feel substantially more useful than generic statistics. Sources: [Bearable pricing](https://bearable.app/our-pricing-and-principles/), [Bearable App Store](https://apps.apple.com/us/app/bearable-symptom-tracker/id1482581097), [Daylio App Store](https://apps.apple.com/us/app/daylio-journal-mood-tracker/id1194023242).

## Recommended tier story

| Tier | Customer promise | Defining capabilities |
|---|---|---|
| Free — Track | Build a useful health history without pressure. | Unlimited logging, 90-day view, weekly summary, 3 custom trackers, 1 reminder, monthly Visit Brief, CSV/JSON export. |
| Pro — Understand | See what changed and which recorded factors appear together. | Unlimited history/trackers/reminders, correlations, What Changed, visible data strength, medication-timing observations, unlimited standard Visit Briefs, one active care-team share. |
| Ultra — Prepare | Walk into appointments organized and keep trusted people aligned. | Appointment workspace, Health history over time, Advanced Visit Brief, multiple profiles, multiple role-based recipients, scheduled caregiver summaries, encrypted sync, FHIR-ready export. |

Pro should remain visually recommended. Ultra should be described as **best for complex care and families**, not a “stretch tier.”

## Plain-language feature definitions

### Health history over time

This replaces “longitudinal analysis.” It compares meaningful periods—such as the latest 90 days against the previous 90—and shows symptom frequency, severity, medication timing, and context changes alongside a visible data-strength label. It reports observations, never causation.

### Appointment workspace

This is more than a reminder. It stores the clinician, appointment date/time, visit reason, prioritized concerns, medication changes, questions, desired outcomes, and reminder timing. It combines those inputs with recorded changes and feeds the Advanced Visit Brief. Calendar-file export is appropriate; direct third-party calendar connections should wait for explicit OAuth scope and privacy review.

### Advanced Visit Brief

The brief should contain the visit purpose, top concerns, symptom onset/frequency/severity, meaningful period changes, medication names/doses/timing/changes, adherence notes, contextual factors, questions, goals, data-strength context, covered dates, and a clear “recorded by the user—not a diagnosis” notice. Outputs are print/PDF, revocable share, and a FHIR-ready JSON bundle using Observation and MedicationStatement-shaped data. Formal interoperability claims require validation against the relevant [HL7 FHIR resources](https://hl7.org/fhir/resourcelist.html).

### Medication timing observations

Capture medication name, dose, and taken-at time plus symptom onset time. Only show an observation after a minimum number of paired records, disclose the comparison window and sample size, and use language such as “was recorded less often within two hours” rather than “improved.” Do not provide interaction or dosing advice.

## Trust boundary

OWASP advises against storing session identifiers in local storage because JavaScript can read them. v1.2.0 therefore uses hashed server session records and Secure/HttpOnly/SameSite cookies for new accounts; the legacy static device bearer is migration-only. Sources: [OWASP HTML5 Security](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html), [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).

Passkeys are a strong next authentication factor because WebAuthn uses origin-bound public-key credentials and platform authenticators; implementation still needs enrollment/recovery UX and independent security review. Sources: [MDN Web Authentication API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API), [W3C WebAuthn Level 3](https://www.w3.org/TR/webauthn-3/).
