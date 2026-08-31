/* ============================================================
   Pamet — local auth (v1.0.1)

   Privacy-first, client-side account gate:
   - Password is salted + hashed with PBKDF2 (Web Crypto) and the
     hash is stored locally. The plaintext password is never stored.
   - Works in secure contexts (localhost, HTTPS / GitHub Pages).
   - In non-secure contexts (file://) Web Crypto is unavailable, so a
     simple deterministic fallback hash is used and a warning is shown.

   NOTE: this is a local privacy gate, not server-side auth. For real
   multi-device accounts + strong security, a backend is required.
   ============================================================ */
(function (global) {
  "use strict";

  var USER_KEY = "pamet_user_v1";
  var SESSION_KEY = "pamet_session_v1";
  var PBKDF2_ITERATIONS = 60000;

  // ---- Web Crypto availability (secure contexts only) ----
  function subtle() {
    return (global.crypto && global.crypto.subtle) ? global.crypto.subtle : null;
  }

  function randomHex(bytes) {
    var arr = new Uint8Array(bytes);
    if (global.crypto && global.crypto.getRandomValues) {
      global.crypto.getRandomValues(arr);
    } else {
      for (var i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(arr).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
  }

  function utf8(s) { return new TextEncoder().encode(String(s)); }

  // ---- Primary: PBKDF2 via Web Crypto ----
  async function pbkdf2(password, saltHex, iterations) {
    var salt = new Uint8Array(saltHex.match(/.{2}/g).map(function (b) { return parseInt(b, 16); }));
    var key = await subtle().importKey("raw", utf8(password), "PBKDF2", false, ["deriveBits"]);
    var bits = await subtle().deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt: salt, iterations: iterations },
      key, 256
    );
    return Array.from(new Uint8Array(bits)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
  }

  // ---- Fallback: iterated FNV-1a (non-secure contexts only) ----
  function fnv1a(str, seed) {
    var h = (seed >>> 0);
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
  }

  function fallbackHash(password, saltHex) {
    var h = "00000000";
    for (var i = 0; i < 5000; i++) {
      h = fnv1a(password + saltHex + h, parseInt(h.slice(0, 8), 16));
    }
    return h + fnv1a(saltHex + password + "pamet", 0x811c9dc5);
  }

  // Unified hash: uses PBKDF2 when available, else the fallback.
  async function deriveHash(password, saltHex) {
    if (subtle()) {
      try { return { algo: "pbkdf2", iterations: PBKDF2_ITERATIONS, hash: await pbkdf2(password, saltHex, PBKDF2_ITERATIONS) }; }
      catch (e) { /* fall through */ }
    }
    return { algo: "fnv1a", iterations: 0, hash: fallbackHash(password, saltHex) };
  }

  // ---- Storage ----
  function loadUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch (e) { return null; }
  }
  function saveUser(u) { localStorage.setItem(USER_KEY, JSON.stringify(u)); }
  function loadSession() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch (e) { return null; }
  }

  // ---- Public API ----
  const Auth = {
    isSecure: !!subtle(),

    // Returns the stored user (without the hash for display) or null.
    getUser() {
      const u = loadUser();
      if (!u) return null;
      const { hash, iterations, ...rest } = u;
      return rest;
    },

    hasAccount() { return !!loadUser(); },

    // Create a new account.
    async register({ firstName, lastName, email, password }) {
      if (loadUser()) throw new Error("An account already exists on this device.");
      const salt = randomHex(16);
      const derived = await deriveHash(password, salt);
      const user = {
        firstName: (firstName || "").trim(),
        lastName: (lastName || "").trim(),
        email: (email || "").trim().toLowerCase(),
        salt, hash: derived.hash, iterations: derived.iterations, algo: derived.algo,
        plan: "free",
        createdAt: new Date().toISOString()
      };
      saveUser(user);
      this.startSession();
      return user;
    },

    // Verify credentials. Returns the user or throws.
    async login(email, password) {
      const u = loadUser();
      if (!u) throw new Error("No account found on this device.");
      const normalized = (email || "").trim().toLowerCase();
      if (normalized !== u.email) throw new Error("Email not recognized.");
      const derived = await deriveHash(password, u.salt);
      if (derived.hash !== u.hash) throw new Error("Incorrect password.");
      this.startSession();
      return u;
    },

    startSession() {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token: randomHex(16), at: Date.now() }));
    },

    endSession() { sessionStorage.removeItem(SESSION_KEY); },

    isAuthed() { return !!loadSession(); },

    // Update profile fields (first/last name, email). Returns the user.
    updateProfile({ firstName, lastName, email }) {
      const u = loadUser();
      if (!u) return null;
      if (firstName !== undefined) u.firstName = ("" + firstName).trim();
      if (lastName !== undefined) u.lastName = ("" + lastName).trim();
      if (email !== undefined) u.email = ("" + email).trim().toLowerCase();
      saveUser(u);
      return u;
    },

    // Change password (kept in sync with the stored hash).
    async changePassword(oldPassword, newPassword) {
      const u = loadUser();
      if (!u) throw new Error("No account found.");
      const check = await deriveHash(oldPassword, u.salt);
      if (check.hash !== u.hash) throw new Error("Current password is incorrect.");
      const salt = randomHex(16);
      const derived = await deriveHash(newPassword, salt);
      u.salt = salt; u.hash = derived.hash; u.iterations = derived.iterations; u.algo = derived.algo;
      saveUser(u);
    }
  };

  global.PametAuth = Auth;
})(window);
