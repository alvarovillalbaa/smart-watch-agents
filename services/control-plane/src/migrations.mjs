import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const versions = [
  [1, new URL('./schema.sql', import.meta.url)],
  [2, new URL('./migrations/002-action-receipts.sql', import.meta.url)]
];
async function sources() { return Promise.all(versions.map(async ([version, url]) => { const sql = await readFile(url, 'utf8'); return { version, sql, sha256: createHash('sha256').update(sql).digest('hex') }; })); }
export async function migrate(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(203835510)');
    await client.query('CREATE TABLE IF NOT EXISTS hub_schema_versions (version INTEGER PRIMARY KEY, sha256 TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
    for (const source of await sources()) {
      const prior = await client.query('SELECT sha256 FROM hub_schema_versions WHERE version=$1', [source.version]);
      if (prior.rowCount) { if (prior.rows[0].sha256 !== source.sha256) throw Error('An applied migration source changed: ' + source.version); continue; }
      await client.query(source.sql);
      await client.query('INSERT INTO hub_schema_versions (version,sha256) VALUES ($1,$2)', [source.version, source.sha256]);
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
export async function requireMigrations(pool) {
  let rows;
  try { rows = (await pool.query('SELECT version,sha256 FROM hub_schema_versions ORDER BY version')).rows; }
  catch { throw Error('Watch Agents schema is not ready. Run the explicit migrate command before starting the hub.'); }
  const expected = await sources();
  if (rows.length !== expected.length || expected.some(source => !rows.some(row => row.version === source.version && row.sha256 === source.sha256))) throw Error('Watch Agents migration versions/hashes do not match this server. Run the matching explicit migration command.');
}
