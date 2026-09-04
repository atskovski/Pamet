/* Pamet v1.6.5 — server-authoritative plan boundary guard.
 * Paid feature state never trusts localStorage. A fresh page starts with Free
 * capabilities and unlocks Pro/Ultra only after /api/entitlements verifies the
 * authenticated server account. This protects ordinary app flows from stale or
 * edited client plan state while preserving local-first journal storage.
 */
(() => {
  'use strict';
  const S = window.PametStore;
  const A = window.PametAuth;
  if (!S || !A || window.PametEntitlements) return;

  const SERVER_CAPABILITIES = Object.freeze([
    'correlations',
    'unlimitedHistory',
    'sharing',
    'appointmentWorkspace',
    'multipleProfiles',
    'advancedVisitBrief',
    'encryptedSync'
  ]);
  const MATRIX = Object.freeze({
    free: Object.freeze({ correlations:false, unlimitedHistory:false, sharing:false, appointmentWorkspace:false, multipleProfiles:false, advancedVisitBrief:false, encryptedSync:false }),
    pro: Object.freeze({ correlations:true, unlimitedHistory:true, sharing:true, appointmentWorkspace:false, multipleProfiles:false, advancedVisitBrief:false, encryptedSync:false }),
    ultra: Object.freeze({ correlations:true, unlimitedHistory:true, sharing:true, appointmentWorkspace:true, multipleProfiles:true, advancedVisitBrief:true, encryptedSync:true })
  });
  const FREE_FEATURES = new Set([
    'logging', 'calendar', 'insights', 'visitBrief', 'themeAccessibility',
    'accountSecurity', 'push', 'weeklyDigest', 'noAds'
  ]);
  const ALIASES = Object.freeze({ whatChanged:'correlations', medicationTiming:'correlations' });
  const nativeFetch = window.fetch.bind(window);
  const originalSwitchProfile = S.switchProfile?.bind(S);
  const originalRemoveProfile = S.removeProfile?.bind(S);
  const originalPatterns = S.patterns?.bind(S);
  const requestedProfileId = String(S._activeProfileId || 'primary');
  let state = { plan:'free', verified:false, capabilities:{ ...MATRIX.free } };
  let refreshPromise = null;

  const normalizePlan = (value) => ['free','pro','ultra'].includes(String(value || '').toLowerCase()) ? String(value).toLowerCase() : 'free';
  const currentMatrix = () => MATRIX[state.plan] || MATRIX.free;
  const has = (feature) => {
    const id = ALIASES[feature] || feature;
    if (FREE_FEATURES.has(id)) return true;
    return state.verified === true && currentMatrix()[id] === true;
  };
  const snapshot = () => Object.freeze({ plan:state.plan, verified:state.verified, capabilities:Object.freeze({ ...currentMatrix() }) });

  function emit() {
    try { window.dispatchEvent(new CustomEvent('pamet:entitlements', { detail:snapshot() })); } catch {}
  }

  function apply(payload, verified) {
    const plan = verified ? normalizePlan(payload?.plan) : 'free';
    if (verified) {
      const supplied = payload?.capabilities || {};
      const expected = MATRIX[plan];
      const mismatch = SERVER_CAPABILITIES.some((capability) => supplied[capability] !== expected[capability]);
      if (mismatch) return apply(null, false);
    }
    state = { plan, verified:verified === true, capabilities:{ ...(MATRIX[plan] || MATRIX.free) } };

    if (has('multipleProfiles')) {
      if (requestedProfileId !== 'primary' && S._profiles?.some((profile) => profile.id === requestedProfileId)) originalSwitchProfile?.(requestedProfileId);
    } else if (S._activeProfileId !== 'primary' && S._profiles?.some((profile) => profile.id === 'primary')) {
      originalSwitchProfile?.('primary');
    }
    emit();
    return snapshot();
  }

  /* Make the runtime plan read-only from ordinary application/client state. */
  try {
    Object.defineProperty(S._settings, 'plan', {
      enumerable:true,
      configurable:false,
      get:() => state.plan,
      set:() => {}
    });
  } catch {}
  S.setPlan = () => false;
  S.hasEntitlement = has;
  S.isPro = () => has('correlations');
  S.isUltra = () => has('appointmentWorkspace');

  /* Legacy pattern generation is a Pro capability even though the journal is local. */
  if (originalPatterns) S.patterns = (...args) => has('correlations') ? originalPatterns(...args) : [];

  /* Multiple profiles are Ultra-only. Keep extra profile data intact on downgrade,
   * but do not expose/switch into it. Removal remains available as a cleanup action. */
  try {
    Object.defineProperty(S, 'profiles', {
      enumerable:true,
      configurable:false,
      get() {
        const all = Array.isArray(S._profiles) ? S._profiles.slice() : [];
        if (has('multipleProfiles')) return all;
        const primary = all.find((profile) => profile.id === 'primary') || all[0];
        return primary ? [primary] : [];
      }
    });
  } catch {}
  if (originalSwitchProfile) {
    S.switchProfile = (id) => {
      const target = String(id || '');
      if (target !== 'primary' && !has('multipleProfiles')) return false;
      return originalSwitchProfile(target);
    };
  }
  if (originalRemoveProfile) {
    S.removeProfile = (id) => {
      const target = String(id || '');
      if (target === 'primary') return false;
      if (has('multipleProfiles')) return originalRemoveProfile(target);
      if (!S._profiles?.some((profile) => profile.id === target)) return false;
      if (S._activeProfileId === target) originalSwitchProfile?.('primary');
      S._profiles = S._profiles.filter((profile) => profile.id !== target);
      try { localStorage.removeItem(`pamet_entries_v2_${target}`); } catch {}
      S.persistProfiles?.();
      return true;
    };
  }

  async function refresh() {
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      if (!A.isAuthed?.()) return apply(null, false);
      try {
        const response = await nativeFetch('/api/entitlements', { credentials:'same-origin', cache:'no-store', headers:{ Accept:'application/json' } });
        if (!response.ok) return apply(null, false);
        return apply(await response.json(), true);
      } catch {
        return apply(null, false);
      }
    })().finally(() => { refreshPromise = null; });
    return refreshPromise;
  }

  function requireCapability(feature, event) {
    if (has(feature)) return true;
    event?.preventDefault?.();
    event?.stopImmediatePropagation?.();
    const upgrade = document.querySelector('#upgradeBtn');
    if (upgrade && !upgrade.disabled) upgrade.click();
    return false;
  }

  /* Stop paid UI surfaces before feature handlers run. Locked controls may remain
   * visible as upgrade discovery, but they cannot open the paid workflow. */
  document.addEventListener('click', (event) => {
    const target = event.target?.closest?.('[data-care-share],[data-enhanced-care-share],[data-phase2],#quickProfileButton');
    if (!target) return;
    if (target.id === 'quickProfileButton') return void requireCapability('multipleProfiles', event);
    if (target.matches('[data-care-share],[data-enhanced-care-share]') || target.dataset.phase2 === 'sharing') return void requireCapability('sharing', event);
    if (target.dataset.phase2 === 'prep') return void requireCapability('appointmentWorkspace', event);
  }, true);

  window.addEventListener('pamet:login', refresh);
  window.addEventListener('pamet:registered', refresh);
  window.addEventListener('pamet:logout', () => apply(null, false));
  window.addEventListener('pamet:logout-all', () => apply(null, false));
  window.addEventListener('focus', () => { if (A.isAuthed?.()) refresh(); });

  /* Observe only successful billing synchronization. The entitlement response is
   * still fetched independently; the billing response itself never grants access. */
  window.fetch = async function pametEntitlementAwareFetch(input, options) {
    const response = await nativeFetch(input, options);
    try {
      const url = new URL(typeof input === 'string' ? input : input?.url || '', location.href);
      if (response.ok && url.origin === location.origin && url.pathname === '/api/billing/sync') queueMicrotask(refresh);
    } catch {}
    return response;
  };

  /* Fail closed immediately, then verify asynchronously. */
  apply(null, false);
  refresh();
  window.PametEntitlements = Object.freeze({ has, refresh, snapshot });
})();
