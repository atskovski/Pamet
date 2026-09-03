/* Pamet local journal encryption framework — REVIEW REQUIRED BEFORE ENABLEMENT.
 *
 * This module implements the cryptographic building blocks from
 * docs/LOCAL_ENCRYPTION_THREAT_MODEL.md but intentionally performs no storage
 * migration and is not imported by the production bundle yet.
 *
 * Architecture:
 * - random 256-bit per-profile DEK encrypts journal JSON with AES-256-GCM
 * - a user-held 256-bit Recovery Root Key (RRK) derives a wrapping key via HKDF
 * - the DEK is wrapped with AES-256-GCM; Pamet does not receive the RRK
 * - migration callers must round-trip verify ciphertext before switching stores
 */
(function (global) {
  "use strict";

  const subtle = () => global.crypto && global.crypto.subtle;
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const VERSION = 1;

  function requireCrypto() {
    if (!subtle() || !global.crypto?.getRandomValues) throw new Error("Web Crypto is required for local journal encryption.");
  }
  function randomBytes(size) { requireCrypto(); const out = new Uint8Array(size); global.crypto.getRandomValues(out); return out; }
  function b64(bytes) {
    let binary = ""; bytes.forEach((value) => { binary += String.fromCharCode(value); });
    const raw = (global.btoa ? global.btoa(binary) : Buffer.from(bytes).toString("base64"));
    return raw.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }
  function unb64(value) {
    const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    const binary = global.atob ? global.atob(padded) : Buffer.from(padded, "base64").toString("binary");
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }
  function aad(profileId) { return enc.encode(`pamet-local-journal-v${VERSION}:${String(profileId)}`); }
  function wrapInfo(profileId) { return enc.encode(`pamet-local-dek-wrap-v${VERSION}:${String(profileId)}`); }
  async function importAes(raw, usages) { return subtle().importKey("raw", raw, { name: "AES-GCM" }, false, usages); }
  async function sha256(bytes) { return new Uint8Array(await subtle().digest("SHA-256", bytes)); }

  async function deriveWrappingKey(recoveryRoot, salt, profileId) {
    requireCrypto();
    const base = await subtle().importKey("raw", recoveryRoot, "HKDF", false, ["deriveKey"]);
    return subtle().deriveKey({ name: "HKDF", hash: "SHA-256", salt, info: wrapInfo(profileId) }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }

  async function encryptWithDek(profileId, value, dek) {
    const nonce = randomBytes(12);
    const key = await importAes(dek, ["encrypt"]);
    const plaintext = enc.encode(JSON.stringify(value));
    const ciphertext = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv: nonce, additionalData: aad(profileId), tagLength: 128 }, key, plaintext));
    const digest = await sha256(plaintext);
    return { version: VERSION, algorithm: "AES-256-GCM", profileId: String(profileId), nonce: b64(nonce), ciphertext: b64(ciphertext), plaintextSha256: b64(digest) };
  }

  async function decryptWithDek(envelope, dek) {
    if (!envelope || envelope.version !== VERSION || envelope.algorithm !== "AES-256-GCM") throw new Error("Unsupported Pamet local journal envelope.");
    const key = await importAes(dek, ["decrypt"]);
    const plaintext = new Uint8Array(await subtle().decrypt({ name: "AES-GCM", iv: unb64(envelope.nonce), additionalData: aad(envelope.profileId), tagLength: 128 }, key, unb64(envelope.ciphertext)));
    const digest = b64(await sha256(plaintext));
    if (digest !== envelope.plaintextSha256) throw new Error("Local journal integrity verification failed.");
    return JSON.parse(dec.decode(plaintext));
  }

  async function wrapDek(profileId, dek, recoveryRoot) {
    const salt = randomBytes(16);
    const nonce = randomBytes(12);
    const wrappingKey = await deriveWrappingKey(recoveryRoot, salt, profileId);
    const ciphertext = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv: nonce, additionalData: wrapInfo(profileId), tagLength: 128 }, wrappingKey, dek));
    return { version: VERSION, algorithm: "HKDF-SHA256+A256GCM", profileId: String(profileId), salt: b64(salt), nonce: b64(nonce), wrappedDek: b64(ciphertext) };
  }

  async function unwrapDek(wrapped, recoveryRoot) {
    if (!wrapped || wrapped.version !== VERSION || wrapped.algorithm !== "HKDF-SHA256+A256GCM") throw new Error("Unsupported Pamet DEK wrapper.");
    const wrappingKey = await deriveWrappingKey(recoveryRoot, unb64(wrapped.salt), wrapped.profileId);
    return new Uint8Array(await subtle().decrypt({ name: "AES-GCM", iv: unb64(wrapped.nonce), additionalData: wrapInfo(wrapped.profileId), tagLength: 128 }, wrappingKey, unb64(wrapped.wrappedDek)));
  }

  async function stageMigration(profileId, journalValue, recoveryKeyText) {
    requireCrypto();
    const recoveryRoot = recoveryKeyText ? unb64(recoveryKeyText) : randomBytes(32);
    if (recoveryRoot.length !== 32) throw new Error("Pamet recovery key must be 256 bits.");
    const dek = randomBytes(32);
    const [journal, wrappedDek] = await Promise.all([encryptWithDek(profileId, journalValue, dek), wrapDek(profileId, dek, recoveryRoot)]);
    const restoredDek = await unwrapDek(wrappedDek, recoveryRoot);
    const verified = await decryptWithDek(journal, restoredDek);
    if (JSON.stringify(verified) !== JSON.stringify(journalValue)) throw new Error("Pamet refused to stage an unverified local encryption migration.");
    return {
      status: "staged-not-committed",
      recoveryKey: recoveryKeyText || b64(recoveryRoot),
      wrappedDek,
      journal,
      verified: true
    };
  }

  global.PametLocalEncryption = Object.freeze({
    version: VERSION,
    enabled: false,
    reviewRequired: true,
    generateRecoveryKey: () => b64(randomBytes(32)),
    stageMigration,
    encryptWithDek,
    decryptWithDek,
    wrapDek,
    unwrapDek
  });
})(typeof window !== "undefined" ? window : globalThis);
