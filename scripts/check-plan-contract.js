'use strict';

const fs = require('fs');

const catalog = JSON.parse(fs.readFileSync('contracts/plan-features.json', 'utf8'));
const mobile = JSON.parse(fs.readFileSync('contracts/mobile-api.json', 'utf8'));
const server = fs.readFileSync('server.js', 'utf8');
const comparison = fs.readFileSync('js/plan-comparison.js', 'utf8');

function check(condition, message) {
  if (!condition) throw new Error(message);
}

const planKeys = catalog.plans.map((plan) => plan.key);
check(JSON.stringify(planKeys) === JSON.stringify(['free', 'pro', 'ultra']), 'Canonical plan order must be Free, Pro, Ultra.');
check(mobile.plans && planKeys.every((key) => mobile.plans[key]), 'Mobile contract must define all canonical plans.');

for (const feature of catalog.features) {
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

check(comparison.includes('Compare all plans'), 'Settings must offer a clear full-plan comparison action.');
check(comparison.includes('Upgrade your plan'), 'Free-plan Settings must expose a clear upgrade action.');
check(comparison.includes('Compare all plan features'), 'Upgrade modal must link to the full canonical plan matrix.');
check(comparison.includes('PametPlanCatalog'), 'Plan comparison UI must use the canonical generated catalog.');
check(!JSON.stringify(catalog).includes('Scheduled caregiver updates'), 'Canonical plan contract must not advertise removed live caregiver surveillance.');
check(!JSON.stringify(catalog).includes('FHIR-ready data export'), 'Canonical plan contract must not advertise unshipped FHIR export.');

console.log(`Pamet plan contract gate passed: ${catalog.plans.length} plans, ${catalog.features.length} features, server-authoritative entitlements aligned.`);
