# Pamet browser-data threat model

Pamet v1.2.0 is local-first, not end-to-end encrypted for the working browser copy. Journal entries and profile data are stored as readable browser local storage for the signed-in browser profile. The account password protects access through Pamet's interface, but it does not encrypt the underlying working journal records.

This protects against routine server-side disclosure because the complete journal is not automatically uploaded. It does not protect journal data from malware, a malicious browser extension, operating-system account access, browser developer tools, an unlocked shared device, or an origin-level script compromise. Explicit sharing and weekly summaries send selected snapshots to the backend in plaintext over TLS.

Pamet includes an Ultra encrypted-sync framework: the browser derives a profile-specific AES-256-GCM key from a 256-bit user recovery key with HKDF, uses unique 96-bit nonces, and uploads only ciphertext with optimistic revisions. The server can observe account/profile identifiers, ciphertext size, revision, and timing. It cannot decrypt content without the recovery key. The recovery key is intentionally unrecoverable by Pamet.

The working browser copy remains readable local storage. Encrypted sync therefore does not equal encrypted local storage, does not mitigate an origin compromise or malicious extension, and must not be marketed as independently audited until external cryptographic and penetration review is complete.

## Local working-journal encryption design gate

Before Pamet encrypts the working local journal, the key hierarchy, migration behavior, device unlock model, password-reset behavior, and lost-key recovery semantics are governed by [`LOCAL_ENCRYPTION_THREAT_MODEL.md`](LOCAL_ENCRYPTION_THREAT_MODEL.md).

The approved architectural direction is to keep account authentication separate from content encryption: a random per-profile data-encryption key is wrapped by user-held recovery material and, where supported, a device-local wrapping key. A normal account password reset must not become a decryption backdoor. If every trusted device and user recovery key is lost, historical encrypted content is intentionally unrecoverable rather than recoverable by Pamet support.

No product claim that the working journal is "encrypted at rest" should be made until the implementation and independent-review gates in that document are complete.
