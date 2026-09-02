/* Pamet v1.1.0 — client-side encrypted Ultra sync. The server receives ciphertext only. */
(function () {
  "use strict";
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
  const unb64 = (value) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
  const hex = (value) => { if (!/^[a-f0-9]{64}$/i.test(value || "")) throw new Error("Use a 64-character Pamet recovery key."); return Uint8Array.from(value.match(/../g), (part) => parseInt(part, 16)); };
  async function key(recoveryKey, profileId) {
    const material = await crypto.subtle.importKey("raw", hex(recoveryKey), "HKDF", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: encoder.encode("pamet-sync-v1"), info: encoder.encode(profileId) }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  async function encrypt(data, recoveryKey, profileId) {
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, additionalData: encoder.encode(`pamet:${profileId}:1`) }, await key(recoveryKey, profileId), encoder.encode(JSON.stringify(data)));
    return { ciphertext: b64(new Uint8Array(ciphertext)), nonce: b64(nonce), keyVersion: 1 };
  }
  async function decrypt(payload, recoveryKey, profileId) {
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(payload.nonce), additionalData: encoder.encode(`pamet:${profileId}:${payload.keyVersion}`) }, await key(recoveryKey, profileId), unb64(payload.ciphertext));
    return JSON.parse(decoder.decode(plaintext));
  }
  async function request(path, options = {}) {
    const credential = window.PametAuth?.getBackendCredential?.(); if (!credential) throw new Error("Sign in before syncing.");
    const response = await fetch(path, { ...options, headers: { "Content-Type": "application/json", ...(credential.deviceKey ? { Authorization: `Bearer ${credential.deviceKey}` } : {}), ...(options.headers || {}) } });
    const body = await response.json().catch(() => ({})); if (!response.ok) throw Object.assign(new Error(body.error || "Encrypted sync failed."), { status: response.status, body }); return body;
  }
  window.PametEncryptedSync = {
    createRecoveryKey: () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join(""),
    encrypt, decrypt,
    async upload(profileId, data, recoveryKey, expectedRevision = 0) { const payload = await encrypt(data, recoveryKey, profileId); return request(`/api/sync/${encodeURIComponent(profileId)}`, { method: "PUT", body: JSON.stringify({ ...payload, expectedRevision }) }); },
    async download(profileId, recoveryKey) { const payload = await request(`/api/sync/${encodeURIComponent(profileId)}`); return { data: await decrypt(payload, recoveryKey, profileId), revision: payload.revision, updatedAt: payload.updatedAt }; }
  };
})();
