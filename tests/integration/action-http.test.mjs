// T2: real owned PostgreSQL + loopback HTTP, never a customer hub or database.
import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import pg from 'pg';
import { createControlPlane } from '../../services/control-plane/src/server.mjs';
import { migrate, requireMigrations } from '../../services/control-plane/src/migrations.mjs';
import { actionMessage, digest } from '../../services/control-plane/src/actions.mjs';

assert.ok(process.env.WATCH_AGENTS_T2_DATABASE_URL?.includes('/watch_agents_t2'), 'Only the controller-owned named disposable database is allowed');
const pool = new pg.Pool({ connectionString: process.env.WATCH_AGENTS_T2_DATABASE_URL, max: 8 });
const bootstrapSecret = 'authored-bootstrap-fixture-'.repeat(2), connectorToken = 'authored-connector-fixture-'.repeat(2);
let server, base, clock = Date.now(), device;
const observations = { schema: 'watch-agents.http-evidence', version: 2, serverClosed: false, poolClosed: false, nativeVectorAccepted: false };
const key = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
async function request(path, { token, method = 'GET', body, headers = {}, raw } = {}) {
  const response = await fetch(base + path, { method, headers: { ...(token ? { authorization: 'Bearer ' + token } : {}), 'content-type': 'application/json', ...headers }, ...(raw !== undefined || body !== undefined ? { body: raw ?? JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000) });
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
}
async function pairing(platform = 'watchos', pem = key.publicKey.export({ type: 'spki', format: 'pem' })) {
  const code = (await request('/v1/admin/pairings', { token: bootstrapSecret, method: 'POST', body: {} })).body.code;
  const response = await request('/v1/devices/pair', { method: 'POST', body: { code, platform, publicKeyPem: pem, label: 'Authored device' } }); assert.equal(response.status, 201); return response.body;
}
async function emit({ run = 'run', sequence = 1, type = 'hitl.requested', status = 'awaiting_hitl', hitl = 'approval', eventId = randomUUID() } = {}) {
  const event = { eventId, provider: 'hermes', agentId: 'authored', runId: run, sequence, occurredAt: new Date().toISOString(), type, payload: { title: 'Authored fixture', status, summary: 'Fixture result', ...(type === 'hitl.requested' ? { hitl: { id: hitl, label: 'Reviewed fixture action', expiresAt: new Date(Date.now() + 600000).toISOString() } } : {}) } };
  const response = await request('/v1/ingest/events', { token: connectorToken, method: 'POST', body: event }); assert.equal(response.status, 202); return 'hermes:authored:' + run;
}
function signed(path, { nonce = randomUUID(), timestamp = String(Math.floor(clock / 1000)), raw = '{}', platform = 'watchos', privateKey = key.privateKey } = {}) {
  const message = actionMessage({ method: 'POST', path, timestamp, nonce, bodySha256: digest(raw) });
  return { token: device.token, method: 'POST', raw, headers: { 'x-watch-protocol': '2', 'x-watch-timestamp': timestamp, 'x-watch-nonce': nonce, 'x-watch-signature': sign('sha256', Buffer.from(message), { key: privateKey, dsaEncoding: platform === 'watchos' ? 'ieee-p1363' : 'der' }).toString('base64') } };
}
async function counts() { const result = {}; for (const name of ['commands','device_actions']) result[name] = Number((await pool.query('SELECT count(*) FROM ' + name)).rows[0].count); result.audits = Number((await pool.query("SELECT count(*) FROM audit_log WHERE action IN ('hitl.approved','follow_up.dispatched')")).rows[0].count); return result; }
before(async () => { await migrate(pool); await migrate(pool); await requireMigrations(pool); ({ server } = await createControlPlane({ pool, bootstrapSecret, connectorToken, now: () => clock })); await new Promise(ok => server.listen(0, '127.0.0.1', ok)); base = 'http://127.0.0.1:' + server.address().port; });
beforeEach(async () => { clock = Date.now(); await pool.query('TRUNCATE agents,devices,pairing_codes,audit_log CASCADE'); device = await pairing(); });
after(async () => { if (server) { server.closeAllConnections(); await new Promise((ok, no) => server.close(error => error ? no(error) : ok())); observations.serverClosed = true; } await pool.end(); observations.poolClosed = true; await writeFile(process.env.WATCH_AGENTS_HTTP_RECEIPT, JSON.stringify(observations, null, 2)); });

test('A01 missing/equal authority secrets cannot start a hub; anonymous admin cannot enroll', async () => {
  await assert.rejects(createControlPlane({ pool }), /Configure separate/);
  await assert.rejects(createControlPlane({ pool, bootstrapSecret, connectorToken: bootstrapSecret }), /different/);
  assert.equal((await request('/v1/admin/pairings', { method: 'POST', body: {} })).status, 401);
});
test('A02 invalid platform/key does not consume a pairing code; valid use is one-time', async () => {
  const code = (await request('/v1/admin/pairings', { token: bootstrapSecret, method: 'POST', body: {} })).body.code;
  const body = { code, platform: 'unknown', publicKeyPem: 'invalid' };
  assert.equal((await request('/v1/devices/pair', { method: 'POST', body })).status, 400);
  body.platform = 'watchos'; assert.equal((await request('/v1/devices/pair', { method: 'POST', body })).status, 400);
  assert.equal((await pool.query('SELECT used_at FROM pairing_codes WHERE code=$1', [code])).rows[0].used_at, null);
  body.publicKeyPem = key.publicKey.export({ type: 'spki', format: 'pem' }); assert.equal((await request('/v1/devices/pair', { method: 'POST', body })).status, 201); assert.equal((await request('/v1/devices/pair', { method: 'POST', body })).status, 401);
});
test('A03 action needs paired device, protocol2 and matching raw request signature', async () => {
  await emit(); const path = '/v1/hitl/approval/approve';
  assert.equal((await request(path, { method: 'POST', body: {} })).status, 401);
  assert.equal((await request(path, { token: device.token, method: 'POST', body: {} })).status, 400);
  const changed = signed(path); changed.raw = ' {} '; assert.equal((await request(path, changed)).status, 403);
  const otherKey = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }); assert.equal((await request(path, signed(path, { privateKey: otherKey.privateKey }))).status, 403);
  assert.deepEqual(await counts(), { commands: 0, device_actions: 0, audits: 0 });
});
test('A04 raw P-256 approval atomically stores one command, audit, nonce and decision', async () => {
  await emit(); const response = await request('/v1/hitl/approval/approve', signed('/v1/hitl/approval/approve')); assert.equal(response.status, 202);
  assert.deepEqual(await counts(), { commands: 1, device_actions: 1, audits: 1 });
  const row = (await pool.query('SELECT status,approved_by FROM hitl_requests WHERE id=$1', ['approval'])).rows[0]; assert.deepEqual(row, { status: 'approved', approved_by: device.deviceId });
  assert.equal((await pool.query('SELECT command_id FROM device_actions')).rows[0].command_id, response.body.commandId);
});
test('A05 two simultaneous exact retries return the original command once', async () => {
  await emit(); const path = '/v1/hitl/approval/approve', intent = signed(path); const responses = await Promise.all([request(path, intent), request(path, intent)]); assert.deepEqual(responses.map(r => r.status), [202, 202]); assert.deepEqual(responses[0].body, responses[1].body); assert.deepEqual(await counts(), { commands: 1, device_actions: 1, audits: 1 });
  observations.concurrentExactRetry = { responses: 2, uniqueCommands: 1 };
});
test('A06 committed exact intent retries after clock window without another write', async () => {
  await emit(); const path = '/v1/hitl/approval/approve', intent = signed(path), first = await request(path, intent); clock += 600000; assert.deepEqual(await request(path, intent), first); assert.deepEqual(await counts(), { commands: 1, device_actions: 1, audits: 1 });
});
test('A07 a nonce cannot be reused for a different target even with a valid new signature', async () => {
  await emit(); await emit({ run: 'second', hitl: 'other' }); const nonce = randomUUID(); assert.equal((await request('/v1/hitl/approval/approve', signed('/v1/hitl/approval/approve', { nonce }))).status, 202); assert.equal((await request('/v1/hitl/other/approve', signed('/v1/hitl/other/approve', { nonce }))).status, 409); assert.equal((await pool.query("SELECT status FROM hitl_requests WHERE id='other'")).rows[0].status, 'pending'); assert.deepEqual(await counts(), { commands: 1, device_actions: 1, audits: 1 });
});
test('A08 expired or future unused intent creates no nonce receipt or decision', async () => {
  await emit(); const path = '/v1/hitl/approval/approve'; for (const delta of [-301, 301]) assert.equal((await request(path, signed(path, { timestamp: String(Math.floor(clock / 1000) + delta) }))).status, 403); assert.deepEqual(await counts(), { commands: 0, device_actions: 0, audits: 0 });
});
test('A09 newer source sequence hides and refuses the earlier HITL request', async () => {
  await emit(); await emit({ sequence: 2, type: 'run.updated', status: 'awaiting_hitl' }); assert.equal((await request('/v1/hitl/approval/approve', signed('/v1/hitl/approval/approve'))).status, 409); const runs = (await request('/v1/runs', { token: device.token })).body.runs; assert.equal(runs[0].hitl_id, null); assert.deepEqual(await counts(), { commands: 0, device_actions: 0, audits: 0 });
});
test('A10 expired target and another nonce after decision cannot enqueue an action', async () => {
  await emit(); await pool.query("UPDATE hitl_requests SET expires_at=now()-interval '1 second'"); const path = '/v1/hitl/approval/approve'; assert.equal((await request(path, signed(path))).status, 409); await pool.query("UPDATE hitl_requests SET expires_at=now()+interval '1 minute'"); assert.equal((await request(path, signed(path))).status, 202); assert.equal((await request(path, signed(path))).status, 409); assert.deepEqual(await counts(), { commands: 1, device_actions: 1, audits: 1 });
});
async function failingTrigger(table, name) { await pool.query(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'authored failure'; END $$; CREATE TRIGGER ${name} BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION ${name}()`); }
async function dropTrigger(table, name) { await pool.query(`DROP TRIGGER ${name} ON ${table}; DROP FUNCTION ${name}()`); }
for (const table of ['audit_log','commands']) test('A11-' + table + ' failed transaction rolls back nonce, command, audit and target', async () => {
  await emit(); const path = '/v1/hitl/approval/approve', intent = signed(path), name = 'authored_failure_' + table; await failingTrigger(table, name);
  try { assert.equal((await request(path, intent)).status, 500); assert.deepEqual(await counts(), { commands: 0, device_actions: 0, audits: 0 }); assert.equal((await pool.query("SELECT status FROM hitl_requests WHERE id='approval'")).rows[0].status, 'pending'); }
  finally { await dropTrigger(table, name); }
  assert.equal((await request(path, intent)).status, 202); assert.deepEqual(await counts(), { commands: 1, device_actions: 1, audits: 1 });
});
test('A12 follow-up dispatch queues the exact stored prompt once and returns its original receipt', async () => {
  const id = await emit({ type: 'run.finished', status: 'completed' }); const stored = (await pool.query('SELECT prompt FROM follow_up_drafts WHERE run_id=$1', [id])).rows[0].prompt, path = '/v1/runs/' + encodeURIComponent(id) + '/follow-up/dispatch', intent = signed(path); const response = await request(path, intent); assert.equal(response.status, 202); assert.deepEqual(await request(path, intent), response); assert.equal((await pool.query('SELECT body FROM commands WHERE id=$1', [response.body.commandId])).rows[0].body.prompt, stored); assert.deepEqual(await counts(), { commands: 1, device_actions: 1, audits: 1 });
});
test('A13 changed run makes a previous follow-up draft unavailable and un-dispatchable', async () => {
  const id = await emit({ type: 'run.finished', status: 'completed' }); await emit({ sequence: 2, type: 'run.updated', status: 'running' }); const path = '/v1/runs/' + encodeURIComponent(id) + '/follow-up/dispatch'; assert.equal((await request(path, signed(path))).status, 409); assert.equal((await request('/v1/runs', { token: device.token })).body.runs[0].follow_up_prompt, null); assert.deepEqual(await counts(), { commands: 0, device_actions: 0, audits: 0 });
});
test('A14 Wear OS DER P-256 signature uses the same actual HTTP protocol', async () => {
  device = await pairing('wearos'); await emit(); const path = '/v1/hitl/approval/approve'; assert.equal((await request(path, signed(path, { platform: 'wearos' }))).status, 202); assert.deepEqual(await counts(), { commands: 1, device_actions: 1, audits: 1 });
});
test('A15 malformed/extra body and action query cannot consume a reviewed subject', async () => {
  await emit(); const path = '/v1/hitl/approval/approve'; for (const raw of ['', '[]','null','{"extra":1}','{"broken"']) assert.equal((await request(path, signed(path, { raw }))).status, 400); assert.equal((await request(path + '?extra=1', signed(path + '?extra=1'))).status, 400); assert.deepEqual(await counts(), { commands: 0, device_actions: 0, audits: 0 });
});
test('A16 pairing audit failure rolls back code consumption and device enrollment', async () => {
  const code = (await request('/v1/admin/pairings', { token: bootstrapSecret, method: 'POST', body: {} })).body.code; const body = { code, platform: 'watchos', publicKeyPem: key.publicKey.export({ type: 'spki', format: 'pem' }) }; await failingTrigger('audit_log', 'pairing_failure');
  try { assert.equal((await request('/v1/devices/pair', { method: 'POST', body })).status, 500); assert.equal((await pool.query('SELECT used_at FROM pairing_codes WHERE code=$1', [code])).rows[0].used_at, null); assert.equal(Number((await pool.query('SELECT count(*) FROM devices')).rows[0].count), 1); }
  finally { await dropTrigger('audit_log', 'pairing_failure'); }
  assert.equal((await request('/v1/devices/pair', { method: 'POST', body })).status, 201);
});
test('A17 outbox failure rolls back an ingested agent/run/event/draft together', async () => {
  await failingTrigger('notification_outbox', 'outbox_failure');
  try { const response = await request('/v1/ingest/events', { token: connectorToken, method: 'POST', body: { eventId: randomUUID(), provider: 'hermes', agentId: 'new-authored', runId: 'new-run', sequence: 1, occurredAt: new Date().toISOString(), type: 'run.finished', payload: { title: 'Authored', status: 'completed' } } }); assert.equal(response.status, 500); for (const name of ['agents','runs','events','follow_up_drafts','notification_outbox']) assert.equal(Number((await pool.query('SELECT count(*) FROM ' + name)).rows[0].count), 0); }
  finally { await dropTrigger('notification_outbox', 'outbox_failure'); }
});
test('A18 actual CryptoKit native-client vector is accepted by Node over HTTP', async () => {
  const vector = JSON.parse(await readFile(process.env.WATCH_AGENTS_NATIVE_VECTOR, 'utf8')); assert.equal(vector.schema, 'watch-agents.native-action-vector'); assert.equal(vector.version, 2); device = await pairing('watchos', vector.publicKeyPem); await emit({ hitl: 'native /批准' }); clock = Number(vector.headers['x-watch-timestamp']) * 1000; const response = await request(vector.path, { token: device.token, method: 'POST', raw: vector.body, headers: vector.headers }); assert.equal(response.status, 202); assert.deepEqual(await counts(), { commands: 1, device_actions: 1, audits: 1 }); observations.nativeVectorAccepted = true;
});
test('A19 changed applied migration hash is refused without applying another schema', async () => {
  const original = (await pool.query('SELECT sha256 FROM hub_schema_versions WHERE version=2')).rows[0].sha256;
  await pool.query('UPDATE hub_schema_versions SET sha256=$1 WHERE version=2', ['0'.repeat(64)]);
  try { await assert.rejects(requireMigrations(pool), /versions\/hashes/); await assert.rejects(migrate(pool), /source changed/); }
  finally { await pool.query('UPDATE hub_schema_versions SET sha256=$1 WHERE version=2', [original]); }
  await requireMigrations(pool);
});
test('A20 concurrent enrollment consumes one code for exactly one new device', async () => {
  const code = (await request('/v1/admin/pairings', { token: bootstrapSecret, method: 'POST', body: {} })).body.code;
  const options = { method: 'POST', body: { code, platform: 'watchos', publicKeyPem: key.publicKey.export({ type: 'spki', format: 'pem' }) } };
  const results = await Promise.all([request('/v1/devices/pair', options), request('/v1/devices/pair', options)]); assert.deepEqual(results.map(r => r.status).sort(), [201,401]); assert.equal(Number((await pool.query('SELECT count(*) FROM devices')).rows[0].count), 2);
});
