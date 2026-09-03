'use strict';

function clampBatchSize(value, fallback = 250, max = 1000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(max, Math.max(1, Math.floor(parsed)));
}

async function* iterateById({ connection, table, where = '1=1', params = [], batchSize = 250, columns = '*', idColumn = 'id', initialCursor = 0 }) {
  if (!connection || typeof connection.execute !== 'function') throw new TypeError('A database connection with execute() is required.');
  if (!/^[A-Za-z0-9_]+$/.test(table) || !/^[A-Za-z0-9_]+$/.test(idColumn)) throw new TypeError('Unsafe table or id column.');
  if (!/^[A-Za-z0-9_.*,\s]+$/.test(columns)) throw new TypeError('Unsafe column list.');
  const size = clampBatchSize(batchSize);
  let lastId = initialCursor;
  for (;;) {
    const sql = `SELECT ${columns} FROM \`${table}\` WHERE (${where}) AND \`${idColumn}\`>? ORDER BY \`${idColumn}\` ASC LIMIT ${size}`;
    const [rows] = await connection.execute(sql, [...params, lastId]);
    if (!rows.length) return;
    yield rows;
    lastId = rows[rows.length - 1][idColumn];
    if (rows.length < size) return;
  }
}

module.exports = { clampBatchSize, iterateById };
