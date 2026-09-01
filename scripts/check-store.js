'use strict';

const fs = require('fs');
const vm = require('vm');

function loadStore(initial = {}) {
  const data = new Map(Object.entries(initial));
  const localStorage = {
    get length() { return data.size; },
    key(index) { return Array.from(data.keys())[index] ?? null; },
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); }
  };
  const context = { window: {}, localStorage, console, Date, Math, Set };
  vm.runInNewContext(fs.readFileSync('js/store.js', 'utf8'), context, { filename: 'js/store.js' });
  return { store: context.window.PametStore, data };
}

function check(condition, message) {
  if (!condition) throw new Error(message);
}

const fresh = loadStore();
check(fresh.store.entries.length === 0, 'A fresh Pamet store must contain no entries.');
check(fresh.store.patterns().length === 0, 'A fresh Pamet store must contain no patterns.');
check(fresh.store.metrics().streakDays === 0, 'A fresh Pamet store must contain no streak.');

const legacy = loadStore({
  pamet_entries_v1: JSON.stringify([
    { id: 'seed-0', date: new Date().toISOString(), symptoms: ['Headache'] },
    { id: 'real-1', date: new Date().toISOString(), symptoms: [], severity: 0 }
  ])
});
check(legacy.store.entries.length === 1, 'Legacy sample entries must be removed without deleting real entries.');
check(legacy.store.entries[0].id === 'real-1', 'The real user entry must survive sample-data migration.');

legacy.store.setPlan('ultra');
const dependent = legacy.store.addProfile('Family profile', 'Parent');
check(dependent && legacy.store.profiles.length === 2, 'Ultra must be able to add a second profile.');
check(legacy.store.switchProfile(dependent.id), 'Ultra must be able to switch profiles.');
check(legacy.store.entries.length === 0, 'A new profile must start with a separate empty history.');
legacy.store.addEntry({ date: new Date().toISOString(), symptoms: ['Fatigue'], severity: 3, medications: [] });
check(legacy.store.entries.length === 1, 'The active profile must accept its own entries.');
legacy.store.switchProfile('primary');
check(legacy.store.entries.length === 1 && legacy.store.entries[0].id === 'real-1', 'Switching profiles must restore the primary profile history.');
const exported = legacy.store.exportAllData();
check(exported.format === 'pamet-export-v2' && exported.profiles.length === 2, 'Data export must include every profile.');
check(exported.profiles.every((profile) => profile.entries.length === 1), 'Data export must include every profile history.');

legacy.data.set('pamet_weekly_digest_consent_v102', 'yes');
legacy.store.wipeAll();
check(!legacy.data.has('pamet_weekly_digest_consent_v102'), 'Account wipe must remove auxiliary Pamet preferences.');
check(legacy.store.profiles.length === 1 && legacy.store.entries.length === 0, 'Account wipe must reinitialize one empty primary profile.');

console.log('Pamet store checks passed.');
