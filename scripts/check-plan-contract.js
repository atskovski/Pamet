'use strict';

const fs = require('fs');

const catalog = JSON.parse(fs.readFileSync('contracts/plan-features.json', 'utf8'));
const mobile = JSON.parse(fs.readFileSync('contracts/mobile-api.json', 'utf8'));
const server = fs.readFileSync('server.js', 'utf8');
const secureServer = fs.readFileSync('secure-server.js', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');
const comparison = fs.readFileSync('js/plan-comparison.js', 'utf8');
const matrix = fs.readFileSync('js/plan-matrix.js', 'utf8');
const management = fs.readFileSync('js/plan-management.js', 'utf8');
const managementLoader = fs.readFileSync('js/plan-management-loader.js', 'utf8');
const main = fs.readFileSync('js/main.js', 'utf8');
const authenticated = fs.readFileSync('js/authenticated-features.js', 'utf8');
const guard = fs.readFileSync('js/entitlement-guard.js', 'utf8');
const insights = fs.readFileSync('js/insights.js', 'utf8');

function check(condition, message) {
  if (!condition) throw new Error(message);
}

const planKeys = catalog.plans.map((plan) => plan.key);
check(JSON.stringify(planKeys) === JSON.stringify(['free', 'pro', 'ultra']), 'Canonical plan order must be Free, Pro, Ultra.');
check(mobile.plans && planKeys.every((key) => mobile.plans[key]), 'Mobile contract must define all canonical plans.');

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
for (const [capability, rule] of Object.entries(expectedServerRules)) check(server.includes(rule), `Server-authoritative entitlement rule drifted for ${capability}.`);

check(server.includes("if (!['pro', 'ultra'].includes(req.user.plan)) return res.status(403).json({ error: 'Sharing requires Pamet Pro or Ultra.' });"), 'Sharing creation must reject Free on the server.');
check((server.match(/Appointment workspace requires Pamet Ultra\./g) || []).length >= 3, 'Appointment routes must enforce Ultra.');
check((server.match(/Encrypted multi-device sync requires Pamet Ultra\./g) || []).length >= 2, 'Encrypted sync routes must enforce Ultra.');

check(guard.includes("nativeFetch('/api/entitlements'"), 'Client entitlement guard must verify the server entitlement endpoint.');
check(guard.includes('configurable:false') && guard.includes('S.setPlan = () => false;'), 'Client plan state must not be writable as an authorization shortcut.');
check(guard.includes("if (mismatch) return apply(null, false);"), 'Contradictory server capability payloads must fail closed.');
check(guard.includes("S.patterns = (...args) => has('correlations')"), 'Legacy correlation output must require Pro/Ultra.');
check(guard.includes("target !== 'primary' && !has('multipleProfiles')"), 'Non-primary profile switching must require Ultra.');
check(guard.includes("feature:'appointmentWorkspace'") && guard.includes('PHASE2_REQUIREMENTS[target.dataset.phase2]'), 'Appointment Workspace UI must be intercepted before Free/Pro can open it.');
check(guard.includes("feature:'multipleProfiles'") && guard.includes("feature:'advancedVisitBrief'"), 'Ultra profile and Advanced Visit Brief controls must stay behind the plan boundary.');
check(guard.includes("included:'Pro and Ultra'") && guard.includes("included:'Ultra'"), 'Locked paid controls must render plan-aware upgrade copy.');

const guardIndex = main.indexOf('import "./entitlement-guard.js";');
const featureLoaderIndex = main.indexOf('function loadAuthenticatedFeatures()');
const billingIndex = authenticated.indexOf('import "./billing-sharing.js";');
const insightsIndex = authenticated.indexOf('import "./insights.js";');
check(guardIndex >= 0 && featureLoaderIndex > guardIndex, 'Entitlement guard must install before authenticated feature loading can begin.');
check(!main.includes('import "./billing-sharing.js";') && !main.includes('import "./insights.js";'), 'Paid billing and Insights must remain outside the signed-out bootstrap.');
check(billingIndex >= 0 && insightsIndex > billingIndex, 'Deferred billing hooks must initialize before paid Insight rendering.');
check(insights.includes('if (!paidComparisons()) return observations;'), 'Free Insights must stop before recorded-factor comparison generation.');
check(insights.includes("E?.has?.('medicationTiming') === true"), 'Medication observations must require the Pro/Ultra entitlement.');

check(comparison.includes('Compare all plans'), 'Settings must offer a clear full-plan comparison action.');
check(comparison.includes('Upgrade to Pro or Ultra') && comparison.includes('Upgrade to Ultra'), 'Settings must let Free choose Pro or Ultra while Pro advances to Ultra.');
check(comparison.includes('Compare all plan features'), 'Legacy upgrade chooser must still link to the full comparison when invoked elsewhere.');
check(comparison.includes('/dist/pamet.plan-matrix.min.js'), 'Full plan matrix must stay deferred from the authenticated critical bundle.');
check(comparison.includes('pamet-features-js') && comparison.includes('?release='), 'Deferred plan matrix must use the current release token so stale service-worker cache cannot pin old upgrade UI.');
check(matrix.includes('Compare all Pamet features'), 'Deferred matrix must present the complete Pamet comparison heading.');
check(matrix.includes('data-plan-matrix-back') && matrix.includes('Back to Manage your plan'), 'Full comparison must provide a back path to Manage your plan.');
check(matrix.includes('data-plan-matrix-upgrade="pro"') && matrix.includes('data-plan-matrix-upgrade="ultra"'), 'Free comparison must provide direct Pro and Ultra upgrade actions.');
check(!matrix.includes('PAMET PLAN CATALOG') && !matrix.includes('canonical plan catalog'), 'Customer-facing plan comparison must not expose internal catalog implementation language.');
check(matrix.includes('PametPlanCatalog') && comparison.includes('PametPlanCatalog'), 'Plan comparison surfaces must use the canonical generated catalog internally.');
check(managementLoader.includes('/dist/pamet.plan-management.min.js'), 'Paid account management must stay deferred from the critical feature bundle.');
check(managementLoader.includes('pamet-features-js') && managementLoader.includes('?release='), 'Deferred plan management must use the current release token so stale service-worker cache cannot pin old upgrade UI.');
check(management.includes('#upgradeBtn') && management.includes('["pro", "ultra"]') && management.includes('Upgrade to Pro or Ultra') && management.includes('Manage billing'), 'Manage your plan must offer both paid tiers to Free while reserving billing management for paid accounts.');
check(management.includes('body: JSON.stringify({ plan: targetKey, interval, checkoutAttemptId: attempt })'), 'Free checkout must use the selected Pro or Ultra tier instead of hard-coding Pro.');
check(management.includes('featureSection(from, { current: true })') && management.includes('plan-management-upgrade-grid'), 'Upgrade views must show the current plan together with complete target-plan feature sections.');
check(management.includes('data-plan-management-back') && management.includes('data-plan-management-checkout-back'), 'Plan management and secure checkout must retain back navigation.');
check(management.includes('/api/billing/status') && management.includes('/api/billing/portal'), 'Plan management must separate read-only billing status from explicit upgrade/billing actions.');
check(management.includes('if (from === "free") checkoutFreeToPlan') && management.includes('else openBilling'), 'Free purchases must use checkout while an existing Pro subscription upgrades through billing management.');
check(sw.includes('DEFERRED_NETWORK_FIRST') && sw.includes('/dist/pamet.plan-management.min.js') && sw.includes('/dist/pamet.plan-matrix.min.js'), 'Service worker must network-revalidate deferred plan bundles instead of pinning stale upgrade UI.');
check(secureServer.includes('Upgrade to Pro or Ultra</button>'), 'Server-rendered Settings fallback must never advertise only Pro to Free users.');
check(!JSON.stringify(catalog).includes('Scheduled caregiver updates'), 'Canonical plan contract must not advertise removed live caregiver surveillance.');
check(!JSON.stringify(catalog).includes('FHIR-ready data export'), 'Canonical plan contract must not advertise unshipped FHIR export.');

console.log(`Pamet plan contract gate passed: ${catalog.plans.length} plans, ${catalog.features.length} features, server routes and deferred fail-closed client boundaries aligned.`);
