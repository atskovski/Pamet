'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('js/observation-engine.js', 'utf8');

function makeHarness({ plan = 'free', correlations = true, entries = [] } = {}) {
  const settings = { plan, aiPatterns: true, customSymptoms: [], customMoods: [], customActivities: [], customMeds: [] };
  const canonical = { symptoms: ['Headache', 'Fatigue'], moods: ['Good'], activities: ['Walk'], meds: ['None', 'Ibuprofen'] };
  const store = {
    settings,
    _entries: entries,
    get entries() { return this._entries; },
    FREE_LIMITS: { patterns: 10, customPerCategory: 5 },
    addCustomField(category, name) {
      const key = { symptoms: 'customSymptoms', moods: 'customMoods', activities: 'customActivities', meds: 'customMeds' }[category];
      if (!key || !name || canonical[category].includes(name) || this.settings[key].includes(name)) return false;
      this.settings[key].push(name);
      return true;
    },
    addCustomSymptom(name) { return this.addCustomField('symptoms', name); },
    patterns() { return []; },
    tier() { return null; },
    nextTier() { return null; }
  };
  const window = { PametStore: store, PametEntitlements: { has: (feature) => feature === 'correlations' && correlations } };
  vm.runInNewContext(source, { window, console, Date, Math, Set, Map, Number, String, Object, Array });
  return { store, engine: window.PametObservationEngine };
}

function entry(daysAgo, { symptom = null, sleep = 8, stress = 4, water = 7, energy = 6, severity = 4 } = {}) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return { date: date.toISOString(), symptoms: symptom ? [symptom] : [], severity: symptom ? severity : 0, sleepHours: sleep, stressLevel: stress, waterGlasses: water, energyLevel: energy, mood: 'Good', activity: 'Walk', medications: [] };
}

test('custom fields use Free 3, Pro 10, Ultra unlimited and keep medication names paid', () => {
  const free = makeHarness({ plan: 'free' }).store;
  assert.equal(free.FREE_LIMITS.customPerCategory, 3);
  assert.equal(free.addCustomField('symptoms', 'One'), true);
  assert.equal(free.addCustomField('symptoms', 'Two'), true);
  assert.equal(free.addCustomField('symptoms', 'Three'), true);
  assert.equal(free.addCustomField('symptoms', 'Four'), false);
  assert.equal(free.addCustomField('meds', 'My prescription'), false);

  const pro = makeHarness({ plan: 'pro' }).store;
  for (let index = 1; index <= 10; index += 1) assert.equal(pro.addCustomField('moods', `Mood ${index}`), true);
  assert.equal(pro.addCustomField('moods', 'Mood 11'), false);
  assert.equal(pro.addCustomField('meds', 'My prescription'), true);

  const ultra = makeHarness({ plan: 'ultra' }).store;
  for (let index = 1; index <= 25; index += 1) assert.equal(ultra.addCustomField('activities', `Activity ${index}`), true);
  assert.equal(ultra.customFieldPolicy('activities').unlimited, true);
});

test('logging milestones include Bronze, Silver, Gold, Platinum, Diamond, and Beast', () => {
  const { engine } = makeHarness();
  assert.equal(engine.tierFor(0), null);
  assert.equal(engine.tierFor(1).key, 'bronze');
  assert.equal(engine.tierFor(7).key, 'silver');
  assert.equal(engine.tierFor(30).key, 'gold');
  assert.equal(engine.tierFor(90).key, 'platinum');
  assert.equal(engine.tierFor(180).key, 'diamond');
  assert.equal(engine.tierFor(365).key, 'beast');
  assert.equal(engine.nextTier(179).key, 'diamond');
  assert.equal(engine.nextTier(365), null);
});

test('correlation output requires entitlement and uses observational language with sample safeguards', () => {
  const entries = [];
  for (let index = 0; index < 6; index += 1) entries.push(entry(index, { symptom: index < 5 ? 'Headache' : null, sleep: 5 }));
  for (let index = 6; index < 12; index += 1) entries.push(entry(index, { symptom: index === 6 ? 'Headache' : null, sleep: 8 }));

  const blocked = makeHarness({ plan: 'free', correlations: false, entries });
  assert.deepEqual(Array.from(blocked.store.patterns()), []);
  assert.ok(blocked.engine.analyze(entries).home, 'descriptive Home observation stays available without paid correlations');

  const allowed = makeHarness({ plan: 'pro', correlations: true, entries });
  const patterns = allowed.store.patterns();
  assert.ok(patterns.length > 0);
  const lowSleep = patterns.find((pattern) => pattern.title.includes('Headache') && pattern.title.includes('low-sleep'));
  assert.ok(lowSleep, 'expected a sufficiently sampled low-sleep association');
  assert.match(lowSleep.detail, /observational association, not proof/i);
  assert.ok(lowSleep.evidence.exposed >= 3 && lowSleep.evidence.comparison >= 3);
  assert.ok(lowSleep.confidence <= 0.92);
});

test('multiple entries on the same day are collapsed for day-based analysis', () => {
  const sameDate = new Date();
  sameDate.setHours(9, 0, 0, 0);
  const later = new Date(sameDate);
  later.setHours(18, 0, 0, 0);
  const entries = [
    { ...entry(0, { symptom: 'Headache' }), date: sameDate.toISOString() },
    { ...entry(0, { symptom: 'Fatigue' }), date: later.toISOString() }
  ];
  const { engine } = makeHarness({ entries });
  const records = engine.mergeDaily(entries);
  assert.equal(records.length, 1);
  assert.deepEqual(Array.from(records[0].symptoms).sort(), ['Fatigue', 'Headache']);
  assert.equal(engine.totalDaysLogged(entries), 1);
});
