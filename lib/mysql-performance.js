'use strict';

/* Production-only database activity-write governor.
 * server.js intentionally records session/device activity. This wrapper keeps that
 * semantic while avoiding a write/round-trip on every authenticated API request.
 */
function installMysqlActivityThrottle({ ttlMs = 5 * 60 * 1000, maxEntries = 10000 } = {}) {
  const mysql = require('mysql2/promise');
  if (mysql.__pametActivityThrottleInstalled) return;
  mysql.__pametActivityThrottleInstalled = true;
  const originalCreatePool = mysql.createPool.bind(mysql);
  const seen = new Map();

  function shouldWrite(key) {
    const now = Date.now();
    const previous = seen.get(key) || 0;
    if (now - previous < ttlMs) return false;
    seen.set(key, now);
    if (seen.size > maxEntries) {
      const cutoff = now - ttlMs;
      for (const [entry, at] of seen) {
        if (at < cutoff || seen.size > maxEntries) seen.delete(entry);
        if (seen.size <= Math.floor(maxEntries * 0.8)) break;
      }
    }
    return true;
  }

  mysql.createPool = function createThrottledPool(options) {
    const pool = originalCreatePool(options);
    const originalExecute = pool.execute.bind(pool);
    pool.execute = function execute(sql, params, ...rest) {
      const text = String(sql || '').replace(/\s+/g, ' ').trim();
      const id = Array.isArray(params) ? params[0] : null;
      if (/^UPDATE pamet_sessions SET last_used_at=NOW\(\) WHERE id=\?$/i.test(text) && id) {
        if (!shouldWrite(`session:${id}`)) return Promise.resolve([{ affectedRows: 0, changedRows: 0 }, []]);
        return originalExecute('UPDATE pamet_sessions SET last_used_at=NOW() WHERE id=? AND last_used_at < NOW() - INTERVAL 5 MINUTE', params, ...rest);
      }
      if (/^UPDATE pamet_devices SET last_used_at=NOW\(\) WHERE id=\?$/i.test(text) && id) {
        if (!shouldWrite(`device:${id}`)) return Promise.resolve([{ affectedRows: 0, changedRows: 0 }, []]);
        return originalExecute('UPDATE pamet_devices SET last_used_at=NOW() WHERE id=? AND (last_used_at IS NULL OR last_used_at < NOW() - INTERVAL 5 MINUTE)', params, ...rest);
      }
      return originalExecute(sql, params, ...rest);
    };
    return pool;
  };
}

module.exports = { installMysqlActivityThrottle };
