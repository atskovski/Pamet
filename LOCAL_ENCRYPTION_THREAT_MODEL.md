# Pamet local-encryption and key-recovery threat model

**Status:** Design gate — approved architecture direction, not an implementation claim  
**Applies to:** Future encryption of Pamet's working device-local journal  
**Current behavior:** The working journal remains readable browser storage. Existing Ultra encrypted sync remains unchanged until a separately reviewed migration is implemented.

## 1. Why this document exists

Pamet's local-first design keeps the full journal off the server by default, but the current working browser copy is readable to software or people that can access the browser profile. Encrypting that copy is a valuable hardening step, but a bad key design can create a worse failure mode: permanent loss of a user's health history or a false promise that encryption protects against threats it cannot stop.

No local-journal encryption implementation should ship until the recovery, migration, browser-storage, and testing gates in this document are met.

## 2. Assets we are protecting

1. Journal entries, symptom observations, medication notes, lifestyle observations, profile details, Visit Brief source data, and other health-adjacent content.
2. The per-profile data-encryption key (DEK) used to encrypt the working journal.
3. The user recovery root key (RRK) and any key-encryption keys derived from it.
4. Device-local wrapping keys used to unlock a profile without repeatedly entering the RRK.
5. Wrapped key envelopes, encrypted sync blobs, revisions, and integrity metadata.
6. Account credentials, session cookies, recovery tokens, and device credentials. These authenticate a user but must not automatically become decryption keys.

## 3. Security goals

The target design must:

- Encrypt health-content records at rest on the device with authenticated encryption.
- Keep server operators, a database-only attacker, Stripe, Resend, logging systems, and support personnel unable to decrypt the journal.
- Ensure an ordinary account-password reset does **not** grant Pamet or an email-account attacker the ability to decrypt old journal content.
- Keep encryption keys, recovery material, plaintext journal content, and decrypted exports out of logs, metrics, crash reports, URLs, analytics, and product-feedback payloads.
- Detect ciphertext tampering before plaintext is accepted.
- Preserve data across password changes and normal session renewal without re-encrypting the entire journal.
- Give users a supported way to recover encrypted data on a replacement device when they still possess either a trusted device or their recovery key.
- Fail safely when recovery is impossible: do not invent a server-side backdoor and do not silently discard encrypted data.
- Make migration from plaintext storage atomic and verifiable so a browser crash, tab close, quota failure, or partial write does not destroy the only usable copy.

## 4. Threat actors and expected controls

| Threat | Target control | Residual risk |
|---|---|---|
| Stolen device or copied browser storage while the OS/profile is not usable | Journal content stored only as AES-256-GCM ciphertext; keys separated from ciphertext | A determined attacker with the complete usable browser/OS profile may still be able to invoke a device-held key |
| Server/database compromise | Server stores ciphertext/key envelopes only; no RRK or plaintext DEK | Metadata such as account/profile identifiers, ciphertext size, revisions, and timing remain visible |
| Email-account takeover followed by Pamet password reset | Password reset restores account access only; it does not unwrap historical journal keys | Attacker may still access non-encrypted account metadata and any newly created data after takeover |
| Malicious browser extension, injected same-origin script, XSS, or compromised dependency | CSP hardening, dependency controls, minimal decryption lifetime, no key export | **Local encryption cannot fully protect against active code executing with Pamet's origin while the journal is unlocked** |
| Unlocked shared device or OS-account compromise | Device/OS protections plus Pamet session/device controls | Encryption is not a substitute for locking the device; an already-unlocked journal may be readable |
| Malicious sharing recipient | Explicit snapshot sharing, expiration, revocation, permission controls | A recipient can retain information already viewed/downloaded before revocation |
| Support/admin misuse | No server-held decryption capability; audited account/support actions | Support cannot recover plaintext for a user who has lost every valid key source |
| User loses every trusted device and recovery key | Clear recovery warnings, recovery-kit verification, trusted-device rewrap path | **Data is intentionally unrecoverable without a valid key source** |

## 5. Explicit non-goals

Encrypted local storage must not be marketed as protection against:

- malware or a malicious extension running with access to the unlocked browser profile;
- a same-origin application compromise while the journal is decrypted in memory;
- screenshots, clipboard capture, user-created exports, or information intentionally shared with another person;
- an attacker using an already-unlocked device/session;
- secure deletion guarantees from browser storage, SSD wear leveling, OS snapshots, or backups.

These limitations must remain explicit in `THREAT_MODEL.md` and product/security copy.

## 6. Target key hierarchy

### 6.1 Per-profile data-encryption key

Each profile should have a random 256-bit **DEK**, generated client-side with Web Crypto. Journal content should be encrypted with AES-256-GCM using a unique 96-bit nonce for every encryption operation. Nonce uniqueness is mandatory for a given DEK.

The DEK should be independent from the user's Pamet account password. Password changes and password resets therefore do not require journal re-encryption and do not create a decryption backdoor.

### 6.2 User recovery root key

Pamet should generate a random 256-bit **RRK** client-side. The RRK is user-held recovery material and must never be uploaded in plaintext.

A recovery key-encryption key should be derived from the RRK with HKDF-SHA-256 using explicit Pamet/profile/version context. That derived key wraps the profile DEK with authenticated encryption. The server may store the resulting wrapped key envelope because it cannot unwrap it without the RRK.

**Do not derive the journal DEK directly from the Pamet account password.** Account passwords serve authentication and can be reset through email. Coupling them directly to encryption would either make password reset destroy access or require Pamet to possess a recovery capability that conflicts with the local-first trust model.

### 6.3 Device unlock key

For normal use, a device may generate a separate random, non-exportable Web Crypto key and use it to wrap the profile DEK locally. The browser should store the non-exportable key through a supported browser key store/IndexedDB mechanism rather than storing raw key bytes alongside ciphertext.

This improves resistance to simple local-storage/file copying, but it is **not** an endpoint-security boundary. Same-origin malicious code or a sufficiently compromised browser profile may be able to ask the browser to use the key even when it cannot export the raw bytes.

Browser support and actual persistence behavior must be tested before this mechanism is relied upon.

## 7. Recovery model

Pamet should support these recovery paths in order:

### Path A — existing trusted device

A currently trusted and unlocked device can unwrap the profile DEK and rewrap it for a newly authenticated device. The transfer protocol must be separately designed so the server only relays encrypted key material and cannot decrypt it.

### Path B — user recovery key

On a new device, the user enters the RRK. The client derives the recovery wrapping key, unwraps the DEK, verifies authenticated decryption, and creates a new device wrapper.

The UI must require the user to verify the recovery key after it is generated (for example, re-enter/reconfirm it) before Pamet treats recovery setup as complete.

### Path C — password/email recovery only

Pamet account recovery may restore login access, revoke old sessions, and reset the account password. **It must not decrypt the previous encrypted journal by itself.** The user must still provide an RRK or use a trusted device.

### Path D — no trusted device and no recovery key

Historical encrypted journal content is unrecoverable. Pamet must state this plainly before encryption is enabled and during account/recovery setup. Support personnel must not have an override key.

The application may allow the recovered account to begin a new empty journal, but must not silently delete or overwrite the inaccessible ciphertext. The user should explicitly choose whether to retain or delete the inaccessible encrypted data.

## 8. Key rotation and device revocation

- **Password change:** no DEK rotation required.
- **Recovery-key rotation while a trusted key source exists:** generate a new RRK and rewrap the existing DEK. Full journal re-encryption is unnecessary.
- **Device revocation:** remove/revoke that device's server credential and key envelope. This prevents future sync authorization but cannot erase keys or plaintext already copied onto the physical device.
- **Suspected DEK compromise:** generate a new DEK and re-encrypt the complete profile using an atomic migration. Increment `keyVersion` and prevent old ciphertext from being accepted as current.
- **Lost RRK with a still-trusted device:** generate a new RRK from the trusted device and rewrap the DEK after strong user confirmation.

## 9. Local storage layout

After migration, health-content fields should not remain in readable `localStorage`.

Target storage should separate:

- **Encrypted content:** journal/profile payload ciphertext, nonce, key version, schema version, and integrity/version metadata.
- **Key envelopes:** recovery-wrapped DEK and device-wrapped DEK.
- **Minimal plaintext metadata:** only what is required to locate/decode the encrypted record, such as format version, pseudonymous profile identifier, revision, and key version.

No symptom names, medication names, notes, Visit Brief text, or other health-content fields should be required in plaintext indexes.

## 10. Plaintext-to-encrypted migration requirements

Migration must be copy-verify-switch, never overwrite-in-place:

1. Read the existing plaintext journal without deleting it.
2. Generate/resolve the DEK and recovery/device wrappers.
3. Write a complete encrypted copy to the new store with a migration state marker.
4. Read the ciphertext back, decrypt it, and verify a canonical content hash/count against the source.
5. Only after verification, atomically mark the encrypted record as authoritative.
6. Delete the old plaintext working records on a best-effort basis.
7. Clear the migration marker only after the encrypted journal opens successfully from the authoritative store.

A crash at any step must leave at least one verified usable copy. Pamet must not automatically downgrade encrypted data back to plaintext if a later version has trouble opening it.

Browser storage cannot promise forensic secure deletion; product/security copy must not claim that deleted plaintext remnants are cryptographically wiped from SSD/browser backups.

## 11. Sync-format compatibility

The existing Ultra sync format derives a profile-specific AES-256-GCM key from the current user recovery key. That format must remain readable until a versioned migration is explicitly implemented and tested.

A future random-DEK/key-envelope format must use a new format/key version and include a deterministic migration path. Do not silently reinterpret existing ciphertext under the new hierarchy.

## 12. Logging, telemetry, and support rules

The following values are forbidden from logs/telemetry/support tooling:

- RRK or any printable/encoded recovery representation;
- raw DEKs or device wrapping keys;
- decrypted journal/profile payloads;
- plaintext share snapshots beyond the deliberately existing sharing workflow;
- encryption passphrases, if any are ever introduced;
- full ciphertext when it could create excessive retention or accidental data copies.

Permitted operational metadata should be limited to non-sensitive identifiers, version numbers, success/failure classes, ciphertext byte counts, revision conflicts, and timing.

## 13. Required implementation gates

Local working-journal encryption is **not production-ready** until all of these are true:

1. The key hierarchy, nonce handling, HKDF context, and wrapper format receive independent cryptographic/security review.
2. Recovery UX is implemented and tested for trusted-device recovery, RRK recovery, password-reset-without-key, lost RRK, and lost-all-devices scenarios.
3. Migration tests inject failure after every migration stage and prove there is always a recoverable copy.
4. Browser/device-key persistence is tested on the supported Chrome/Edge/Firefox/Safari/PWA targets before relying on it.
5. Automated tests prove health-content fields no longer remain in readable working local storage after successful migration.
6. Automated tests prove password changes and account password recovery do not invalidate encrypted journal access when a valid journal key source still exists.
7. Automated tests prove a user with account access but without RRK/trusted-device material cannot decrypt historical ciphertext.
8. Key rotation and revoked-device scenarios are tested with multiple key versions and stale sync revisions.
9. CSP hardening and dependency controls are strong enough that Pamet does not imply at-rest encryption solves active origin compromise.
10. Product copy, `THREAT_MODEL.md`, `SECURITY.md`, and recovery screens accurately state that Pamet cannot recover encrypted data after all user-held key sources are lost.
11. No production release uses test bypasses, test keys, deterministic nonces, or network interception hooks.
12. External penetration/privacy review is completed before stronger encryption/security claims are marketed broadly.

## 14. Decision record

**Approved direction:** random per-profile DEK + user-held RRK wrapper + device-local wrapper; account authentication remains separate from content encryption.

**Rejected direction:** deriving the working journal directly from the resettable Pamet account password.

**Not yet approved:** exact trusted-device transfer protocol, exact browser persistence mechanism for the device wrapper key, migration implementation, and UI wording. These require implementation prototypes and review against the gates above.

This threat model intentionally favors recoverability clarity and honest security boundaries over a marketing claim. Pamet should only call the working journal "encrypted at rest" after the migration and recovery controls above have been implemented and independently reviewed.
