# Pamet browser-data threat model

Pamet v1.0.4 is local-first, not end-to-end encrypted. Journal entries and profile data are stored as readable browser local storage for the signed-in browser profile. The device-local password protects access through Pamet's interface, but it does not encrypt the underlying journal records.

This protects against routine server-side disclosure because the complete journal is not automatically uploaded. It does not protect journal data from malware, a malicious browser extension, operating-system account access, browser developer tools, an unlocked shared device, or an origin-level script compromise. Explicit sharing and weekly summaries send selected snapshots to the backend in plaintext over TLS.

Before claiming encrypted local storage or multi-device E2E sync, Pamet needs an independently reviewed design covering key derivation, authenticated encryption, per-record nonces, migration, password changes, recovery, device enrollment/revocation, backup, metadata leakage, and safe failure behavior. Until then, product copy must describe Pamet as local-first and must not claim E2E encryption.
