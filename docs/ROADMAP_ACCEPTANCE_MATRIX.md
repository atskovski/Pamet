# Roadmap acceptance matrix

This matrix defines the minimum evidence required before roadmap feature gates may be enabled in production.

| Capability | Default | Frontend acceptance | Backend acceptance | External dependency |
| --- | --- | --- | --- | --- |
| Pattern confidence | Off | Shows evidence count, confidence and uncertainty; never diagnostic language | Deterministic scoring rules, minimum sample threshold, tests | Legal/accessibility review of claims/UI |
| Visit Brief selection | Off | User can include/exclude entries and preview/print | Export contract preserves only selected records | Accessibility review |
| Quick Log | Off | One-tap recent symptoms with undo/edit path | Uses same canonical entry contract as full log | None |
| Care circles | Off | Clear recipient, profile, permission, expiry and revoke controls | Server-authoritative membership, scoped tokens, audit log, expiry/revocation | Pen test + legal review |
| Appointment prep | Off | User approves generated discussion prompts before sharing | Uses bounded recent-history inputs and stores provenance | Legal review of wording |
| Encrypted journal | Off | Recovery/key-loss UX is explicit | Reviewed key lifecycle, migration, rotation, recovery and failure tests | Independent crypto/security review |
| Data export | On | Full JSON export downloads locally and identifies format/version | Existing store export contract remains stable | Legal review may add required fields/formats |
| Push health | Off | Non-nagging re-enable guidance only when reminders are expected | Subscription health/failure state can be queried safely | Browser/platform behavior testing |
| Ops dashboard | Off | Admin-only; no production user exposure | Requires metrics secret, no raw credentials/health data, bounded telemetry | Alert-delivery drill |

A capability moves from Off to On only after its acceptance row is satisfied and the corresponding release has CI, staging, and rollback evidence.
