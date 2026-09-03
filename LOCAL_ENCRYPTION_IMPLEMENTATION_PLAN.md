# Pamet local working-journal encryption implementation plan

**Status:** design and migration framework only. This document does not claim that the current working journal is encrypted.

`LOCAL_ENCRYPTION_THREAT_MODEL.md` is the governing security decision. The implementation must not ship until the key/recovery design and migration code receive independent cryptographic/security review.

## Chosen key hierarchy

For each Pamet profile:

- Generate a random 256-bit **Data Encryption Key (DEK)**.
- Encrypt journal payloads with AES-256-GCM using a fresh 96-bit nonce for every encryption operation.
- Never derive the DEK directly from the resettable Pamet account password.
- Wrap the DEK with a key derived from the user's high-entropy Recovery Root Key (RRK).
- A trusted device may additionally keep a device-local wrapped copy so normal app launches do not require typing the RRK.
- Pamet's backend must not receive the plaintext DEK or RRK.

The account password authenticates the user to Pamet. It is not the master key for historical journal content.

## Versioned encrypted envelope

A future encrypted local profile should use a versioned record similar to:

```text
{
  format: "pamet-local-encrypted-v1",
  profileId,
  keyVersion,
  algorithm: "AES-256-GCM",
  nonce,
  ciphertext,
  contentHash,
  wrappedDek: {
    recovery: { algorithm, salt, nonce, ciphertext },
    device: { algorithm, nonce, ciphertext }
  },
  updatedAt
}
```

The final implementation must bind `format`, `profileId`, and `keyVersion` as authenticated additional data so ciphertext cannot be moved between profiles or silently interpreted as another format.

## Migration state machine

Plaintext local data must never be overwritten in place during first migration.

1. **preflight** — verify WebCrypto support, storage capacity, active profile inventory, and export/recovery readiness;
2. **key generation** — create RRK/DEKs and wrapped-key records;
3. **copy** — read current plaintext profile data and write encrypted candidates under new versioned keys;
4. **verify** — decrypt every candidate and compare a canonical content digest and record count to the source;
5. **commit marker** — atomically mark the encrypted copy authoritative;
6. **re-open verification** — reload through the normal encrypted reader;
7. **plaintext retirement** — delete old plaintext keys only after verified encrypted reopen;
8. **post-migration audit** — store only non-sensitive migration status/version metadata.

A crash at any point before step 7 must leave the old plaintext copy usable. A crash after step 7 must leave a verified encrypted copy and wrapped keys usable.

## Recovery outcomes

### Trusted device available

The trusted device unwraps the DEK locally and can authorize a replacement device/key-wrap flow after normal account authentication and an explicit user action.

### Recovery Root Key available

The user enters/scans the RRK locally. Pamet derives the recovery wrapping key and restores access to the profile DEK. The RRK is not uploaded.

### Password reset only

Resetting the account password restores account access, not journal decryption. If no trusted device or RRK is available, encrypted historical content remains locked.

### All trusted devices and RRK lost

Historical encrypted journal content is intentionally unrecoverable. Pamet may allow the user to start a new empty journal after explicit acknowledgement, but must not imply that support can decrypt the old content.

## Device revocation and rotation

- Revoking a device removes its server authorization immediately.
- A future encrypted-device registry must also remove that device's wrapped-DEK authorization.
- Revocation alone does not erase copies already exfiltrated from a compromised device.
- Rotate the DEK when the threat model requires invalidating a previously authorized device's future access, then re-encrypt or re-wrap according to the reviewed design.
- Maintain `keyVersion` so old/new ciphertext cannot be confused during rotation.

## Interaction with Ultra encrypted sync

Current Ultra sync is a separate versioned ciphertext protocol. Do not silently make local-encryption keys interchangeable with the existing sync key.

Before combining them:

1. define a new sync envelope/key version;
2. specify how local DEKs are wrapped for another trusted device;
3. test stale revisions, concurrent migration, device revocation, and key rotation;
4. preserve rollback to the previous sync format until verified; and
5. obtain cryptographic review of the combined design.

## Required automated tests before enablement

- successful plaintext → encrypted migration;
- crash/failure at every migration state;
- storage quota failure before and after candidate write;
- tampered GCM tag/nonce/ciphertext rejection;
- wrong RRK rejection without destructive fallback;
- profile-A ciphertext cannot be opened as profile B;
- key-version mismatch rejection;
- trusted-device recovery;
- RRK recovery;
- password reset without key does not decrypt content;
- lost-all-keys path is explicit and non-destructive until confirmed;
- device revocation/rotation semantics;
- export before/after migration produces the same user data;
- encrypted-sync conflict behavior remains intact.

## Release gates

The feature remains disabled until all of the following are true:

- independent review of this key hierarchy and migration design;
- implementation tests above are green in CI;
- migration is tested with realistic large journals and low-storage devices;
- recovery UX is tested on mobile and desktop;
- accessibility review covers recovery-key display/input and error states;
- product/legal copy clearly explains recoverability and key loss; and
- rollback instructions are documented and exercised.

Until then, Pamet must continue to state accurately that the working browser journal is readable local storage even though Ultra sync ciphertext is encrypted.
