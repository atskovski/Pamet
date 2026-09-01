/* ============================================================
   Pamet — local auth (v1.0.2)

   Privacy-first, client-side account gate:
   - Password is salted + hashed with PBKDF2 (Web Crypto) and the
     hash is stored locally. The plaintext password is never stored.
   - The signed-in session is intentionally persistent so the user
     stays signed in across browser restarts until explicit logout.
   - A random per-installation device credential is used only for
     optional Pamet server services (billing/email/sharing). The
     backend stores only a one-way hash of that credential.

   NOTE: the password gate remains local-first. Multi-device account
   recovery/authentication should use a reviewed identity provider in
   a future release.
   ============================================================ */
(function (global) {
  "use strict";

  var USER_KEY = "pamet_user_v1";
  var SESSION_KEY = "pamet_session_v2";
  var LEGACY_SESSION_KEY = "pamet_session_v1";
  var PBKDF2_ITERATIONS = 120000;

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

  function uuid() {
    if (global.crypto && typeof global.crypto.randomUUID === "function") return global.crypto.randomUUID();
    return "local-" + randomHex(16);
  }

  function utf8(s) { return new TextEncoder().encode(String(s)); }

  async function pbkdf2(password, saltHex, iterations) {
    var salt = new Uint8Array(saltHex.match(/.{2}/g).map(function (b) { return parseInt(b, 16); }));
    var key = await subtle().importKey("raw", utf8(password), "PBKDF2", false, ["deriveBits"]);
    var bits = await subtle().deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt: salt, iterations: iterations },
      key, 256
    );
    return Array.from(new Uint8Array(bits)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
  }

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

  async function deriveHash(password, saltHex, iterations) {
    iterations = iterations || PBKDF2_ITERATIONS;
    if (subtle()) {
      try { return { algo: "pbkdf2", iterations: iterations, hash: await pbkdf2(password, saltHex, iterations) }; }
      catch (e) { /* fall through */ }
    }
    return { algo: "fnv1a", iterations: 0, hash: fallbackHash(password, saltHex) };
  }

  function loadUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch (e) { return null; }
  }

  function saveUser(u) { localStorage.setItem(USER_KEY, JSON.stringify(u)); }

  function loadSession() {
    try {
      var current = JSON.parse(localStorage.getItem(SESSION_KEY));
      if (current && current.token) return current;
    } catch (e) { /* ignore */ }

    // One-time migration from the v1.0.1 tab-only session.
    try {
      var legacy = JSON.parse(sessionStorage.getItem(LEGACY_SESSION_KEY));
      if (legacy && legacy.token && loadUser()) {
        var migrated = { token: legacy.token, at: legacy.at || Date.now(), migratedFrom: "v1.0.1" };
        localStorage.setItem(SESSION_KEY, JSON.stringify(migrated));
        sessionStorage.removeItem(LEGACY_SESSION_KEY);
        return migrated;
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  function migrateUser() {
    var u = loadUser();
    if (!u) return null;
    var changed = false;
    if (!u.id) { u.id = uuid(); changed = true; }
    if (!u.deviceKey) { u.deviceKey = randomHex(32); changed = true; }
    if (changed) saveUser(u);
    return u;
  }

  function emit(name, detail) {
    try { global.dispatchEvent(new CustomEvent(name, { detail: detail || null })); } catch (e) { /* ignore */ }
  }

  migrateUser();

  const Auth = {
    isSecure: !!subtle(),

    getUser() {
      const u = migrateUser();
      if (!u) return null;
      const { hash, iterations, salt, deviceKey, ...rest } = u;
      return rest;
    },

    // Used only for same-origin optional backend services. Never includes the
    // password, salt, or password hash.
    getBackendCredential() {
      const u = migrateUser();
      if (!u) return null;
      return {
        localUserId: u.id,
        deviceKey: u.deviceKey,
        email: u.email,
        firstName: u.firstName || "",
        lastName: u.lastName || ""
      };
    },

    hasAccount() { return !!loadUser(); },

    async register({ firstName, lastName, email, password }) {
      if (loadUser()) throw new Error("An account already exists on this device.");
      const salt = randomHex(16);
      const derived = await deriveHash(password, salt, PBKDF2_ITERATIONS);
      const user = {
        id: uuid(),
        deviceKey: randomHex(32),
        firstName: (firstName || "").trim(),
        lastName: (lastName || "").trim(),
        email: (email || "").trim().toLowerCase(),
        salt,
        hash: derived.hash,
        iterations: derived.iterations,
        algo: derived.algo,
        plan: "free",
        createdAt: new Date().toISOString()
      };
      saveUser(user);
      this.startSession();
      emit("pamet:registered", this.getUser());
      return user;
    },

    async login(email, password) {
      const u = loadUser();
      if (!u) throw new Error("No account found on this device.");
      const normalized = (email || "").trim().toLowerCase();
      if (normalized !== u.email) throw new Error("Email not recognized.");
      const iterations = u.iterations || PBKDF2_ITERATIONS;
      const derived = await deriveHash(password, u.salt, iterations);
      if (derived.hash !== u.hash) throw new Error("Incorrect password.");
      this.startSession();
      emit("pamet:login", this.getUser());
      return u;
    },

    startSession() {
      // Persistent by design: the user stays signed in across browser restarts
      // until they explicitly choose Log out.
      localStorage.setItem(SESSION_KEY, JSON.stringify({ token: randomHex(16), at: Date.now() }));
      try { sessionStorage.removeItem(LEGACY_SESSION_KEY); } catch (e) { /* ignore */ }
    },

    endSession() {
      localStorage.removeItem(SESSION_KEY);
      try { sessionStorage.removeItem(LEGACY_SESSION_KEY); } catch (e) { /* ignore */ }
      emit("pamet:logout");
    },

    isAuthed() { return !!loadUser() && !!loadSession(); },

    updateProfile({ firstName, lastName, email }) {
      const u = loadUser();
      if (!u) return null;
      if (firstName !== undefined) u.firstName = ("" + firstName).trim();
      if (lastName !== undefined) u.lastName = ("" + lastName).trim();
      if (email !== undefined) u.email = ("" + email).trim().toLowerCase();
      saveUser(u);
      emit("pamet:profile-updated", this.getUser());
      return u;
    },

    async changePassword(oldPassword, newPassword) {
      const u = loadUser();
      if (!u) throw new Error("No account found.");
      const check = await deriveHash(oldPassword, u.salt, u.iterations || PBKDF2_ITERATIONS);
      if (check.hash !== u.hash) throw new Error("Current password is incorrect.");
      const salt = randomHex(16);
      const derived = await deriveHash(newPassword, salt, PBKDF2_ITERATIONS);
      u.salt = salt;
      u.hash = derived.hash;
      u.iterations = derived.iterations;
      u.algo = derived.algo;
      saveUser(u);
    }
  };

  global.PametAuth = Auth;

  // v1.0.2 is intentionally layered over the stable v1.0.1 UI so the
  // existing local-first data model can be upgraded without a rewrite.
  global.addEventListener("DOMContentLoaded", function () {
    try {
      if (!document.querySelector('link[data-pamet-brand-v102]')) {
        const brand = document.createElement("link");
        brand.rel = "stylesheet";
        brand.href = "css/brand-v1.0.2.css";
        brand.dataset.pametBrandV102 = "true";
        document.head.appendChild(brand);
      }
    } catch (e) { /* ignore */ }
  });

  global.addEventListener("load", function () {
    if (document.querySelector('script[data-pamet-v102]')) return;
    const script = document.createElement("script");
    script.src = "js/v1.0.2.js";
    script.dataset.pametV102 = "true";
    document.body.appendChild(script);
  });
})(window);
