// New macOS prepared-intent boundary only; closed A01-A20 cases stay closed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import pg from 'pg';
import { createControlPlane } from '../../services/control-plane/src/server.mjs';
import { migrate } from '../../services/control-plane/src/migrations.mjs';

test('M13 actual updated CryptoKit client pairs as macos and reconciles its exact original receipt', async () => {
  assert.ok(process.env.WATCH_AGENTS_T2_DATABASE_URL?.endsWith('/watch_agents_t2'));
  const vector = JSON.parse(await readFile(process.env.WATCH_AGENTS_NATIVE_VECTOR, 'utf8'));
  assert.equal(vector.schema, 'watch-agents.native-action-vector'); assert.equal(vector.version, 2);
  const result = { schema: 'watch-agents.macos-http-evidence', version: 1, passed: false, serverClosed: false, poolClosed: false };
  const pool = new pg.Pool({ connectionString: process.env.WATCH_AGENTS_T2_DATABASE_URL, max: 4 });
  const bootstrapSecret = 'authored-mac-bootstrap-'.repeat(3), connectorToken = 'authored-mac-connector-'.repeat(3);
  let server;
  try {
    await migrate(pool);
    ({ server } = await createControlPlane({ pool, bootstrapSecret, connectorToken, now: () => Number(vector.headers['x-watch-timestamp']) * 1000 }));
    await new Promise(ok => server.listen(0, '127.0.0.1', ok)); const base = 'http://127.0.0.1:' + server.address().port;
    async function request(path, { token, body, raw, headers = {} } = {}) {
      const response = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}), ...headers }, body: raw ?? JSON.stringify(body), signal: AbortSignal.timeout(10000) });
      return { status: response.status, body: await response.json() };
    }
    const code = (await request('/v1/admin/pairings', { token: bootstrapSecret, body: {} })).body.code;
    const enrollment = await request('/v1/devices/pair', { body: { code, platform: 'macos', label: 'Authored Mac', publicKeyPem: vector.publicKeyPem } }); assert.equal(enrollment.status, 201);
    assert.equal((await pool.query('SELECT platform FROM devices WHERE id=$1', [enrollment.body.deviceId])).rows[0].platform, 'macos');
    assert.equal((await request('/v1/ingest/events', { token: connectorToken, body: { eventId: randomUUID(), provider: 'hermes', agentId: 'authored-mac', runId: 'authored-run', sequence: 1, occurredAt: new Date().toISOString(), type: 'hitl.requested', payload: { title: 'Authored Mac decision', status: 'awaiting_hitl', hitl: { id: 'native /批准', label: 'Authored Mac review', expiresAt: new Date(Date.now() + 600000).toISOString() } } } })).status, 202);
    const exact = { token: enrollment.body.token, raw: vector.body, headers: vector.headers };
    const first = await request(vector.path, exact), retried = await request(vector.path, exact);
    assert.equal(first.status, 202); assert.deepEqual(retried, first); assert.match(first.body.commandId, /^[0-9a-f-]{36}$/);
    for (const name of ['commands', 'device_actions']) assert.equal(Number((await pool.query('SELECT count(*) FROM ' + name)).rows[0].count), 1);
    assert.equal((await pool.query('SELECT command_id FROM device_actions WHERE device_id=$1', [enrollment.body.deviceId])).rows[0].command_id, first.body.commandId);
    result.acceptedPlatform = 'macos'; result.nativeVectorAccepted = true; result.responses = 2; result.uniqueCommands = 1; result.passed = true;
  } finally {
    if (server) { server.closeAllConnections(); await new Promise((ok, no) => server.close(error => error ? no(error) : ok())); result.serverClosed = true; }
    await pool.end(); result.poolClosed = true;
    await writeFile(process.env.WATCH_AGENTS_HTTP_RECEIPT, JSON.stringify(result, null, 2));
  }
});
