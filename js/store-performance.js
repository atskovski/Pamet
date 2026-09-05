/* Memoize expensive local journal derivations by store revision.
 * This is deliberately layered around the existing store API so data semantics,
 * persistence, encryption gates, and profile isolation remain unchanged.
 */
(function (global) {
  'use strict';
  const S = global.PametStore;
  if (!S || S.__performanceMemoized) return;

  let revision = 0;
  const stats = { hits: 0, misses: 0, revision: 0 };
  const clear = () => { revision += 1; stats.revision = revision; };

  function invalidateAfter(name) {
    if (typeof S[name] !== 'function') return;
    const original = S[name].bind(S);
    S[name] = function (...args) {
      const value = original(...args);
      clear();
      return value;
    };
  }

  /* Every entry mutation funnels through persistEntries. Settings can change
   * pattern detection, and profile persistence/switches can replace the entry set. */
  invalidateAfter('persistEntries');
  invalidateAfter('persistSettings');
  invalidateAfter('persistProfiles');

  function memoize(name) {
    if (typeof S[name] !== 'function') return;
    const original = S[name].bind(S);
    let cachedRevision = -1;
    let cachedValue;
    S[name] = function (...args) {
      if (!args.length && cachedRevision === revision) {
        stats.hits += 1;
        return cachedValue;
      }
      const value = original(...args);
      if (!args.length) {
        cachedRevision = revision;
        cachedValue = value;
      }
      stats.misses += 1;
      return value;
    };
  }

  memoize('patterns');
  memoize('metrics');
  memoize('report');
  memoize('totalDaysLogged');

  if (typeof S.entryForDate === 'function') {
    const originalEntryForDate = S.entryForDate.bind(S);
    let dateRevision = -1;
    const dateCache = new Map();
    S.entryForDate = function (date) {
      if (dateRevision !== revision) {
        dateRevision = revision;
        dateCache.clear();
      }
      const value = new Date(date);
      const key = Number.isNaN(value.getTime()) ? String(date) : `${value.getFullYear()}-${value.getMonth() + 1}-${value.getDate()}`;
      if (dateCache.has(key)) { stats.hits += 1; return dateCache.get(key); }
      const result = originalEntryForDate(date);
      dateCache.set(key, result);
      stats.misses += 1;
      return result;
    };
  }

  S.__performanceMemoized = true;
  global.PametStorePerformance = { invalidate: clear, snapshot: () => ({ ...stats }) };
})(window);
