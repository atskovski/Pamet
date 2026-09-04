'use strict';

const fs = require('fs');

const catalog = JSON.parse(fs.readFileSync('contracts/plan-features.json', 'utf8'));
const mobile = JSON.parse(fs.readFileSync('contracts/mobile-api.json', 'utf8'));
const server = fs.readFileSync('server.js', 'utf8');
const comparison = fs.readFileSync('js/plan-comparison.js', 'utf8');
const main = fs.readFileSync('js/main.js', 'utf8');
const guard = fs.readFileSync('js/entitlement-guard.js', 'utf8');
const insights = fs.readFileSync('js/insights.js', 'utf8');

function check(condition, message) {
  if (!condition) throw new Error(message);
}

const planKeys = catalog.plans.map((plan) => plan.key);
check(JSON.stringify(planKeys) === JSON.stringify(['free', 'pro', 'ultra']), 'Canonical plan order must be Free, Pro, Ultra.');
check(mobile.plans && planKeys.every((key) => mobile.plans[key]), 'Mobile contract must define all canonical plans.');

/* Paid tiers are cumulative: Pro includes Free, and Ultra includes Free + Pro.
 * A capability may never disappear as the customer moves to a higher tier. */
for (const feature of catalog.features) {
  check(!feature.free || (feature.pro && feature.ultra), `${feature.id}: a Free feature must remain available on Pro and Ultra.`);
  check(!feature.pro || feature.ultra, `${feature.id}: a Pro feature must remain available on Ultra.`);
  if (!feature.serverCapability) continue;
  const capability = feature.serverCapability;
  for (const key of planKeys) {
    check(typeof mobile.plans[key][capability] === 'boolean', `Mobile contract is missing ${key}.${capability}.`);
    check(mobile.plans[key][capability] === feature[key], `Plan catalog drift: ${feature.id} does not match mobile entitlement ${key}.${capability}.`);
  }
}

const expectedServerRules = {
  correlations: "correlations: ['pro','ultra'].includes(req.user.plan)",
  unlimitedHistory: "unlimitedHistory: ['pro','ultra'].includes(req.user.plan)",
  sharing: "sharing: ['pro','ultra'].includes(req.user.plan)",
  appointmentWorkspace: "appointmentWorkspace: req.user.plan === 'ultra'",
  multipleProfiles: "multipleProfiles: req.user.plan === 'ultra'",
  advancedVisitBrief: "advancedVisitBrief: req.user.plan === 'ultra'",
  encryptedSync: "encryptedSync: req.user.plan === 'ultra'"
};
for (const [capability, rule] of Object.entries(expectedServerRules)) {
  check(server.includes(rule), `Server-authoritative entitlement rule drifted for ${capability}.`);
}

/* The capability document is not enough by itself: routes that perform paid work
 * must also contain an authorization boundary. */
check(server.includes("if (!['pro', 'ultra'].includes(req.user.plan)) return res.status(403).json({ error: 'Sharing requires Pamet Pro or Ultra.' });"), 'Sharing creation must reject Free on the server.');
check((server.match(/Appointment workspace requires Pamet Ultra\./g) || []).length >= 3, 'Appointment read/write/delete routes must enforce Ultra.');
check((server.match(/Encrypted multi-device sync requires Pamet Ultra\./g) || []).length >= 2, 'Encrypted sync read/write routes must enforce Ultra.');

/* Browser state is only a cache/display concern. Paid behavior must start Free,
 * verify /api/entitlements, reject contradictory matrices, and make local plan
 * writes non-authoritative. */
check(guard.includes("nativeFetch('/api/entitlements'"), 'Client entitlement guard must verify the authenticated server entitlement endpoint.');
check(guard.includes('configurable:false') && guard.includes('S.setPlan = () => false;'), 'Client plan state must not be writable as an authorization shortcut.');
check(guard.includes("if (mismatch) return apply(null, false);"), 'Contradictory server capability payloads must fail closed.');
check(guard.includes("S.patterns = (...args) => has('correlations')"), 'Legacy correlation output must require Pro/Ultra.');
check(guard.includes("target !== 'primary' && !has('multipleProfiles')"), 'Non-primary profile switching must require Ultra.');
check(guard.includes("target.matches('[data-care-share],[data-enhanced-care-share]')") && guard.includes("feature:'sharing'"), 'Paid caregiver/provider sharing UI must be intercepted before Free can open the workflow.');
check(guard.includes("prep:Object.freeze({ feature:'appointmentWorkspace'") && guard.includes('PHASE2_REQUIREMENTS[target.dataset.phase2]'), 'Appointment Workspace UI must be intercepted before Free/Pro can open it.');
check(guard.includes("profiles:Object.freeze({ feature:'multipleProfiles'") && guard.includes("brief:Object.freeze({ feature:'advancedVisitBrief'"), 'Ultra profile and Advanced Visit Brief controls must stay behind the plan boundary.');
check(guard.includes("longitudinal:Object.freeze({ plans:Object.freeze(['ultra'])") && guard.includes("sharing:Object.freeze({ plans:Object.freeze(['ultra'])"), 'Prepare-with-Ultra advanced controls must not fall through to Pro or Free.');
check(guard.includes("included:'Pro and Ultra'") && guard.includes("included:'Ultra'") && guard.includes('See Pro &amp; Ultra'), 'Locked paid controls must render plan-aware upgrade copy instead of opening the feature.');
check(guard.includes("wrapPublicMethod(window.PametCareUx, 'openAppointmentWorkspace'") && guard.includes("wrapPublicMethod(window.PametPhase2, 'manageProfiles'"), 'Public paid-feature helpers must not bypass the same entitlement boundary.');

const billingIndex = main.indexOf('import "./billing-sharing.js";');
const guardIndex = main.indexOf('import "./entitlement-guard.js";');
const insightsIndex = main.indexOf('import "./insights.js";');
check(billingIndex >= 0 && guardIndex > billingIndex && insightsIndex > guardIndex, 'Entitlement guard must load after legacy billing hooks and before paid Insight rendering.');
check(insights.includes('if (!paidComparisons()) return observations;'), 'Free Insights must stop before recorded-factor comparison generation.');
check(insights.includes("E?.has?.('medicationTiming') === true"), 'Medication observations must require the Pro/Ultra entitlement.');

check(comparison.includes('Compare all plans'), 'Settings must offer a clear full-plan comparison action.');
check(comparison.includes('Upgrade your plan'), 'Free-plan Settings must expose a clear upgrade action.');
check(comparison.includes('Compare all plan features'), 'Upgrade modal must link to the full canonical plan matrix.');
check(comparison.includes('PametPlanCatalog'), 'Plan comparison UI must use the canonical generated catalog.');
check(!JSON.stringify(catalog).includes('Scheduled caregiver updates'), 'Canonical plan contract must not advertise removed live caregiver surveillance.');
check(!JSON.stringify(catalog).includes('FHIR-ready data export'), 'Canonical plan contract must not advertise unshipped FHIR export.');

console.log(`Pamet plan contract gate passed: ${catalog.plans.length} plans, ${catalog.features.length} features, server routes and fail-closed client boundaries aligned.`);