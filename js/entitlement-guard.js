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
  const FEATURE_LABELS = Object.freeze({
    correlations:'Deeper Insights',
    unlimitedHistory:'Unlimited history',
    sharing:'Caregiver and provider sharing',
    appointmentWorkspace:'Appointment Workspace',
    multipleProfiles:'Multiple health profiles',
    advancedVisitBrief:'Advanced Visit Brief',
    encryptedSync:'Encrypted multi-device sync',
    whatChanged:'What Changed',
    medicationTiming:'Medication-timing observations'
  });
  const PHASE2_REQUIREMENTS = Object.freeze({
    profiles:Object.freeze({ feature:'multipleProfiles', label:'Multiple health profiles' }),
    prep:Object.freeze({ feature:'appointmentWorkspace', label:'Appointment Workspace' }),
    longitudinal:Object.freeze({ plans:Object.freeze(['ultra']), label:'Health history over time' }),
    brief:Object.freeze({ feature:'advancedVisitBrief', label:'Advanced Visit Brief' }),
    sharing:Object.freeze({ plans:Object.freeze(['ultra']), label:'Advanced sharing' })
  });
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
        const credential = A.getBackendCredential?.();
        const headers = { Accept:'application/json' };
        if (credential?.deviceKey) headers.Authorization = `Bearer ${credential.deviceKey}`;
        const response = await nativeFetch('/api/entitlements', { credentials:'same-origin', cache:'no-store', headers });
        if (!response.ok) return apply(null, false);
        return apply(await response.json(), true);
      } catch {
        return apply(null, false);
      }
    })().finally(() => { refreshPromise = null; });
    return refreshPromise;
  }

  function catalogFeature(feature) {
    const catalog = window.PametPlanCatalog;
    if (!Array.isArray(catalog?.features)) return null;
    return catalog.features.find((item) => item.id === feature) || catalog.features.find((item) => item.id === (ALIASES[feature] || feature)) || null;
  }

  function requirementPlans(requirement) {
    if (Array.isArray(requirement?.plans) && requirement.plans.length) return requirement.plans.filter((key) => ['pro','ultra'].includes(key));
    const feature = requirement?.feature;
    const definition = catalogFeature(feature);
    if (definition) return ['pro','ultra'].filter((key) => definition[key] === true);
    const capability = ALIASES[feature] || feature;
    return ['pro','ultra'].filter((key) => MATRIX[key]?.[capability] === true);
  }

  function requirementAllowed(requirement) {
    if (!requirement) return true;
    if (Array.isArray(requirement.plans)) return state.verified === true && requirement.plans.includes(state.plan);
    return has(requirement.feature);
  }

  function lockCopy(plans) {
    const proAndUltra = plans.includes('pro') && plans.includes('ultra');
    if (proAndUltra) return {
      included:'Pro and Ultra',
      description:'Pro adds deeper insights and secure sharing for individual tracking. Ultra includes everything in Pro, plus family profiles, coordinated care, and appointment preparation.'
    };
    return {
      included:'Ultra',
      description:'Ultra is designed for family profiles, coordinated care, and appointment preparation. Pro remains the best fit for individual tracking and insights.'
    };
  }

  function closeLock(root) {
    if (root) root.innerHTML = '';
  }

  function showPlanLock(requirement) {
    const plans = requirementPlans(requirement);
    const copy = lockCopy(plans);
    const feature = requirement?.feature;
    const label = requirement?.label || FEATURE_LABELS[feature] || catalogFeature(feature)?.label || 'This feature';
    let root = document.querySelector('#pametEntitlementModalRoot');
    if (!root) {
      root = document.createElement('div');
      root.id = 'pametEntitlementModalRoot';
      document.body.appendChild(root);
    }
    root.innerHTML = `<div class="pamet-modal-backdrop care-ux-backdrop"><section class="pamet-modal phase2-modal entitlement-lock-modal" role="dialog" aria-modal="true" aria-labelledby="pametEntitlementLockTitle"><div class="pamet-modal-head"><div><h2 class="pamet-modal-title" id="pametEntitlementLockTitle">${String(label).replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))} is included with ${copy.included}</h2><p class="pamet-modal-sub">${copy.description}</p></div><button type="button" class="pamet-close" data-entitlement-close aria-label="Close">×</button></div><button type="button" class="btn btn-primary btn-block" data-entitlement-see-plans>See Pro &amp; Ultra</button></section></div>`;
    root.querySelectorAll('[data-entitlement-close]').forEach((button) => button.addEventListener('click', () => closeLock(root)));
    root.querySelector('.pamet-modal-backdrop')?.addEventListener('click', (event) => { if (event.target === event.currentTarget) closeLock(root); });
    root.querySelector('[data-entitlement-see-plans]')?.addEventListener('click', () => {
      closeLock(root);
      const upgrade = document.querySelector('#upgradeBtn');
      if (upgrade && !upgrade.disabled) upgrade.click();
      else window.PametPlanComparison?.open?.(state.plan);
    });
    requestAnimationFrame(() => root.querySelector('[data-entitlement-see-plans]')?.focus());
    return root;
  }

  function requireAccess(requirement, event) {
    if (requirementAllowed(requirement)) return true;
    event?.preventDefault?.();
    event?.stopImmediatePropagation?.();
    showPlanLock(requirement);
    return false;
  }

  function requireCapability(feature, event, label) {
    return requireAccess({ feature, label }, event);
  }

  function shareRequirement(target) {
    const kind = target?.dataset?.enhancedCareShare || target?.dataset?.careShare;
    return { feature:'sharing', label:kind === 'provider' ? 'Primary care sharing' : kind === 'caregiver' ? 'Caregiver sharing' : 'Caregiver and provider sharing' };
  }

  /* Stop every visible paid UI surface before feature handlers run. Locked controls
   * remain visible for discovery, but Free users get a feature-specific plan nudge
   * instead of entering the paid workflow. The event handler is capture-phase so
   * later feature modules cannot open their modals first. */
  document.addEventListener('click', (event) => {
    const target = event.target?.closest?.('[data-care-share],[data-enhanced-care-share],[data-phase2],[data-pamet-entitlement],#quickProfileButton');
    if (!target) return;
    if (target.id === 'quickProfileButton') return void requireCapability('multipleProfiles', event, 'Multiple health profiles');
    if (target.dataset.pametEntitlement) return void requireCapability(target.dataset.pametEntitlement, event, target.dataset.pametEntitlementLabel || undefined);
    if (target.matches('[data-care-share],[data-enhanced-care-share]')) return void requireAccess(shareRequirement(target), event);
    const phaseRequirement = PHASE2_REQUIREMENTS[target.dataset.phase2];
    if (phaseRequirement) return void requireAccess(phaseRequirement, event);
  }, true);

  function wrapPublicMethod(object, key, requirementForArgs) {
    const original = object?.[key];
    if (typeof original !== 'function' || original.__pametEntitlementWrapped) return;
    const wrapped = function (...args) {
      const requirement = typeof requirementForArgs === 'function' ? requirementForArgs(...args) : requirementForArgs;
      if (!requireAccess(requirement)) return false;
      return original.apply(this, args);
    };
    try { Object.defineProperty(wrapped, '__pametEntitlementWrapped', { value:true }); } catch {}
    try { object[key] = wrapped; } catch {}
  }

  /* Exported feature APIs are hardened too so application code cannot bypass the
   * same plan boundary by calling a public helper instead of clicking its control. */
  function hardenPublicPaidApis() {
    wrapPublicMethod(window.PametCareUx, 'openShare', (kind) => ({ feature:'sharing', label:kind === 'provider' ? 'Primary care sharing' : 'Caregiver sharing' }));
    wrapPublicMethod(window.PametCareUx, 'openAppointmentWorkspace', { feature:'appointmentWorkspace', label:'Appointment Workspace' });
    wrapPublicMethod(window.PametCareSharingEnhancements, 'open', (kind) => ({ feature:'sharing', label:kind === 'provider' ? 'Primary care sharing' : 'Caregiver sharing' }));
    wrapPublicMethod(window.PametPhase2, 'manageProfiles', { feature:'multipleProfiles', label:'Multiple health profiles' });
    wrapPublicMethod(window.PametPhase2, 'appointmentPrep', { feature:'appointmentWorkspace', label:'Appointment Workspace' });
    wrapPublicMethod(window.PametPhase2, 'advancedSharing', { plans:['ultra'], label:'Advanced sharing' });
  }

  window.addEventListener('pamet:login', refresh);
  window.addEventListener('pamet:registered', refresh);
  window.addEventListener('pamet:logout', () => apply(null, false));
  window.addEventListener('pamet:logout-all', () => apply(null, false));
  window.addEventListener('focus', () => { if (A.isAuthed?.()) refresh(); });
  document.addEventListener('DOMContentLoaded', hardenPublicPaidApis, { once:true });
  document.addEventListener('pamet:settings-rendered', hardenPublicPaidApis);

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
  window.PametEntitlements = Object.freeze({ has, refresh, snapshot, require:requireCapability, requireAccess, showPlanLock });
})();