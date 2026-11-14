import http from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { agentKey, defaultFollowUp, runKey, terminalStatuses, validateEvent } from './domain.mjs';
import { sendPush } from './notifier.mjs';
import { ActionError, authenticateAction, commitAction, publicDeviceKey } from './actions.mjs';
import { requireMigrations } from './migrations.mjs';

export async function createControlPlane({ pool, bootstrapSecret, connectorToken, defaultTimezone = 'UTC', now = Date.now }) {
  if (![bootstrapSecret, connectorToken].every(value => typeof value === 'string' && value.length >= 32 && value.length <= 4096)) throw Error('Configure separate bootstrap and connector secrets of at least32 characters before serving.');
  if (bootstrapSecret === connectorToken) throw Error('Bootstrap and connector secrets must be different.');
  await requireMigrations(pool);

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}
function text(res, status, body) { res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' }); res.end(body); }
async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64_000) throw new ActionError(413, 'Request body too large');
    chunks.push(chunk);
  }
  req.rawBody = Buffer.concat(chunks);
  try { return chunks.length ? JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(req.rawBody)) : {}; }
  catch { throw new ActionError(400, 'Invalid UTF-8 JSON request'); }
}
function bearer(req) { return req.headers.authorization?.replace(/^Bearer\s+/i, ''); }
function safeError(error) { return error instanceof Error ? error.message : 'unknown error'; }
function requireConnector(req, res) {
  if (bearer(req) !== connectorToken) {
    json(res, 401, { error: 'invalid connector token' }); return false;
  }
  return true;
}
async function requireDevice(req, res) {
  const token = bearer(req);
  const result = await pool.query('SELECT * FROM devices WHERE token = $1', [token]);
  if (!result.rowCount) { json(res, 401, { error: 'invalid device token' }); return null; }
  return result.rows[0];
}
async function audit(actor, action, subject, metadata = {}) {
  await pool.query('INSERT INTO audit_log (id, actor, action, subject, metadata) VALUES ($1, $2, $3, $4, $5)', [randomUUID(), actor, action, subject, metadata]);
}
async function ensureAgent(event, client) {
  const key = agentKey(event.provider, event.agentId);
  const template = 'Review the completed run "{{title}}".\nResult: {{summary}}\nArtifacts: {{artifacts}}\nContinue with the next appropriate action. Report blockers and the final outcome.';
  await client.query(`INSERT INTO agents (key, provider, external_id, display_name, follow_up_template)
    VALUES ($1, $2, $3, $3, $4) ON CONFLICT (key) DO NOTHING`, [key, event.provider, event.agentId, template]);
  return key;
}
async function enqueueNotification(client, kind, runId, hitlId, payload) {
  await client.query('INSERT INTO notification_outbox (id, kind, run_id, hitl_id, payload) VALUES ($1, $2, $3, $4, $5)', [randomUUID(), kind, runId, hitlId, payload]);
}
async function ingest(event) {
  const eventError = validateEvent(event);
  if (eventError) return { status: 400, body: { error: eventError } };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const exists = await client.query('SELECT id FROM events WHERE id = $1', [event.eventId]);
    if (exists.rowCount) { await client.query('COMMIT'); return { status: 202, body: { duplicate: true } }; }
    const key = await ensureAgent(event, client);
    const id = runKey(event.provider, event.agentId, event.runId);
    const payload = event.payload;
    const status = payload.status || (event.type === 'hitl.requested' ? 'awaiting_hitl' : 'running');
    const existing = await client.query('SELECT sequence, status FROM runs WHERE id = $1 FOR UPDATE', [id]);
    if (existing.rowCount && existing.rows[0].sequence >= event.sequence) {
      await client.query('INSERT INTO events (id, run_id, sequence, type, occurred_at, payload) VALUES ($1, $2, $3, $4, $5, $6)', [event.eventId, id, event.sequence, event.type, event.occurredAt, payload]);
      await client.query('COMMIT'); return { status: 202, body: { stale: true } };
    }
    const nowTerminal = terminalStatuses.has(status);
    await client.query(`INSERT INTO runs (id, agent_key, source_run_id, title, summary, status, sequence, started_at, updated_at, finished_at, artifact_urls)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,$10)
      ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, summary=EXCLUDED.summary, status=EXCLUDED.status, sequence=EXCLUDED.sequence, updated_at=EXCLUDED.updated_at, finished_at=EXCLUDED.finished_at, artifact_urls=EXCLUDED.artifact_urls
      WHERE runs.sequence < EXCLUDED.sequence`, [id, key, event.runId, payload.title, payload.summary || null, status, event.sequence, event.occurredAt, nowTerminal ? event.occurredAt : null, JSON.stringify(payload.artifactUrls || [])]);
    await client.query('INSERT INTO events (id, run_id, sequence, type, occurred_at, payload) VALUES ($1, $2, $3, $4, $5, $6)', [event.eventId, id, event.sequence, event.type, event.occurredAt, payload]);
    if (event.type === 'hitl.requested') {
      const hitl = payload.hitl || {};
      const hitlId = hitl.id || `${id}:${event.sequence}`;
      const expiresAt = hitl.expiresAt || new Date(Date.now() + 10 * 60_000).toISOString();
      await client.query(`INSERT INTO hitl_requests (id, run_id, label, description, risk, expires_at, source_sequence)
        VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`, [hitlId, id, hitl.label || payload.title, hitl.description || payload.summary || null, hitl.risk || 'medium', expiresAt, event.sequence]);
      await enqueueNotification(client, 'hitl.requested', id, hitlId, { title: `Approval needed: ${hitl.label || payload.title}`, body: hitl.description || payload.summary || 'An agent requires approval.', redactedBody: 'An agent requires approval.', data: { kind: 'hitl.requested', hitlId, runId: id } });
    }
    if (nowTerminal) {
      const agent = await client.query('SELECT follow_up_template FROM agents WHERE key = $1', [key]);
      const prompt = (agent.rows[0]?.follow_up_template || defaultFollowUp({ ...payload })).replace('{{title}}', payload.title).replace('{{summary}}', payload.summary || 'No summary provided.').replace('{{artifacts}}', (payload.artifactUrls || []).join(', ') || 'None');
      await client.query('INSERT INTO follow_up_drafts (run_id, prompt, source_sequence) VALUES ($1, $2, $3) ON CONFLICT (run_id) DO NOTHING', [id, prompt, event.sequence]);
      await enqueueNotification(client, 'run.finished', id, null, { title: `Finished: ${payload.title}`, body: payload.summary || 'Follow-up prompt is ready.', redactedBody: 'An agent run finished. Follow-up is ready.', data: { kind: 'run.finished', runId: id } });
    }
    await client.query('COMMIT');
    return { status: 202, body: { accepted: true, runId: id } };
  } catch (error) { await client.query('ROLLBACK'); if (error.code === '23505' && error.constraint === 'events_pkey') return { status: 202, body: { duplicate: true } }; throw error; } finally { client.release(); }
}
async function processOutbox() {
  const items = await pool.query(`SELECT * FROM notification_outbox WHERE delivered_at IS NULL AND attempts < 5 ORDER BY id LIMIT 20`);
  const devices = await pool.query('SELECT * FROM devices WHERE push_token IS NOT NULL');
  for (const item of items.rows) {
    try {
      await Promise.all(devices.rows.map((device) => sendPush(device, item.payload)));
      await pool.query('UPDATE notification_outbox SET delivered_at = now(), attempts = attempts + 1 WHERE id = $1', [item.id]);
    } catch (error) {
      await pool.query('UPDATE notification_outbox SET attempts = attempts + 1, last_error = $2 WHERE id = $1', [item.id, safeError(error)]);
    }
  }
}
async function handler(req, res) {
  try {
    if (!req.url.startsWith('/') || req.url.startsWith('//')) throw new ActionError(400, 'Unsupported request target');
    const url = new URL(req.url, 'http://hub.invalid');
    if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { ok: true });
    if (req.method === 'POST' && url.pathname === '/v1/ingest/events') {
      if (!requireConnector(req, res)) return;
      const result = await ingest(await readJson(req)); return json(res, result.status, result.body);
    }
    if (req.method === 'POST' && url.pathname === '/v1/admin/agents') {
      if (bearer(req) !== bootstrapSecret) return json(res, 401, { error: 'invalid bootstrap secret' });
      const body = await readJson(req); const key = agentKey(body.provider, body.agentId);
      await pool.query('INSERT INTO agents (key, provider, external_id, display_name, follow_up_template) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (key) DO UPDATE SET display_name=$4, follow_up_template=$5', [key, body.provider, body.agentId, body.displayName || body.agentId, body.followUpTemplate || defaultFollowUp({ title: '{{title}}', summary: '{{summary}}', artifactUrls: ['{{artifacts}}'] })]);
      await audit('owner', 'agent.registered', key); return json(res, 201, { key });
    }
    if (req.method === 'POST' && url.pathname === '/v1/admin/pairings') {
      if (bearer(req) !== bootstrapSecret) return json(res, 401, { error: 'invalid bootstrap secret' });
      const code = randomBytes(4).toString('hex').toUpperCase(); const expiresAt = new Date(Date.now() + 10 * 60_000);
      await pool.query('INSERT INTO pairing_codes (code, expires_at) VALUES ($1, $2)', [code, expiresAt]);
      return json(res, 201, { code, expiresAt });
    }
    if (req.method === 'POST' && url.pathname === '/v1/devices/pair') {
      const body = await readJson(req);
      if (!body || Array.isArray(body) || Object.keys(body).some(key => !['code','platform','publicKeyPem','label','pushToken','privacyMode'].includes(key)) || !['watchos', 'wearos', 'macos', 'chrome'].includes(body.platform) || typeof body.code !== 'string' || !/^[A-F0-9]{8}$/.test(body.code) || (body.label !== undefined && (typeof body.label !== 'string' || !body.label.trim() || body.label.length > 100)) || (body.pushToken != null && (typeof body.pushToken !== 'string' || body.pushToken.length > 4096)) || (body.privacyMode !== undefined && !['redacted','summary'].includes(body.privacyMode))) throw new ActionError(400, 'Invalid device enrollment');
      const publicKey = publicDeviceKey(body.publicKeyPem).export({ type: 'spki', format: 'pem' });
      const client = await pool.connect(), id = randomUUID(), token = randomBytes(32).toString('base64url');
      try {
        await client.query('BEGIN');
        const code = await client.query('UPDATE pairing_codes SET used_at=now() WHERE code=$1 AND used_at IS NULL AND expires_at > now() RETURNING code', [body.code]);
        if (!code.rowCount) throw new ActionError(401, 'Invalid or expired pairing code');
        await client.query('INSERT INTO devices (id,label,platform,public_key_pem,token,push_token,privacy_mode) VALUES ($1,$2,$3,$4,$5,$6,$7)', [id, body.label || body.platform, body.platform, publicKey, token, body.pushToken || null, body.privacyMode || 'redacted']);
        await client.query('INSERT INTO audit_log (id,actor,action,subject) VALUES ($1,$2,$3,$4)', [randomUUID(), 'device:' + id, 'device.paired', id]);
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
      return json(res, 201, { deviceId: id, token });
    }
    if (req.method === 'PUT' && url.pathname === '/v1/devices/current/push') {
      const device = await requireDevice(req, res); if (!device) return;
      const body = await readJson(req);
      await pool.query('UPDATE devices SET push_token=$2, privacy_mode=$3 WHERE id=$1', [device.id, body.pushToken || null, body.privacyMode === 'summary' ? 'summary' : 'redacted']);
      await audit(`device:${device.id}`, 'device.push_updated', device.id); return json(res, 204, {});
    }
    if (req.method === 'GET' && url.pathname === '/v1/runs') {
      const device = await requireDevice(req, res); if (!device) return;
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 20), 1), 100); const state = url.searchParams.get('state');
      const result = await pool.query(`SELECT r.*, a.provider, a.display_name, h.id AS hitl_id, h.label AS hitl_label, h.description AS hitl_description, h.risk AS hitl_risk, h.expires_at AS hitl_expires_at, f.prompt AS follow_up_prompt, f.status AS follow_up_status
        FROM runs r JOIN agents a ON a.key=r.agent_key LEFT JOIN hitl_requests h ON h.run_id=r.id AND h.status='pending' AND h.source_sequence=r.sequence AND r.status='awaiting_hitl' AND h.expires_at > now() LEFT JOIN follow_up_drafts f ON f.run_id=r.id AND f.source_sequence=r.sequence AND r.status IN ('completed','failed','cancelled')
        WHERE ($1::text IS NULL OR r.status=$1) ORDER BY r.updated_at DESC LIMIT $2`, [state, limit]);
      return json(res, 200, { runs: result.rows });
    }
    if (req.method === 'GET' && url.pathname === '/v1/metrics/runs/daily') {
      const device = await requireDevice(req, res); if (!device) return;
      const days = [7, 14, 30].includes(Number(url.searchParams.get('days'))) ? Number(url.searchParams.get('days')) : 7;
      const timezone = url.searchParams.get('timezone') || defaultTimezone;
      const result = await pool.query(`SELECT to_char(started_at AT TIME ZONE $1, 'YYYY-MM-DD') AS day, count(*)::int AS count FROM runs WHERE started_at >= now() - ($2 || ' days')::interval GROUP BY day ORDER BY day`, [timezone, days]);
      return json(res, 200, { timezone, days, series: result.rows });
    }
    const approvalMatch = url.pathname.match(/^\/v1\/hitl\/([^/]+)\/approve$/);
    if (req.method === 'POST' && approvalMatch) {
      return await action(req, res, url, approvalMatch[1], 'approve_hitl');
    }
    const followMatch = url.pathname.match(/^\/v1\/runs\/([^/]+)\/follow-up\/dispatch$/);
    if (req.method === 'POST' && followMatch) {
      return await action(req, res, url, followMatch[1], 'dispatch_follow_up');
    }
    if (req.method === 'GET' && url.pathname === '/v1/connectors/commands') {
      if (!requireConnector(req, res)) return; const key = url.searchParams.get('agentKey');
      const result = await pool.query('SELECT * FROM commands WHERE agent_key=$1 AND status=$2 ORDER BY created_at LIMIT 20', [key, 'queued']); return json(res, 200, { commands: result.rows });
    }
    const ackMatch = url.pathname.match(/^\/v1\/connectors\/commands\/([^/]+)\/ack$/);
    if (req.method === 'POST' && ackMatch) {
      if (!requireConnector(req, res)) return; const body = await readJson(req);
      await pool.query('UPDATE commands SET status=$2, acknowledged_at=now() WHERE id=$1', [ackMatch[1], body.ok === false ? 'failed' : 'acknowledged']); return json(res, 204, {});
    }
    return json(res, 404, { error: 'not found' });
  } catch (error) { if (error instanceof ActionError) return json(res, error.status, { error: error.message }); console.error('Hub request failed', error.code || error.name); return json(res, 500, { error: 'Hub request failed; refresh state before retrying a write' }); }
}

async function action(req, res, url, encodedSubject, kind) {
  const device = await requireDevice(req, res); if (!device) return;
  if (url.search) throw new ActionError(400, 'Action query strings are not supported');
  const body = await readJson(req);
  if (!req.rawBody.length || !body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length) throw new ActionError(400, 'Action body must be an empty JSON object');
  let subject; try { subject = decodeURIComponent(encodedSubject); } catch { throw new ActionError(400, 'Invalid subject encoding'); }
  const intent = authenticateAction(req, device, req.rawBody);
  return json(res, 202, await commitAction(pool, { device, intent, kind, subject, now: now() }));
}
const server = http.createServer(handler); server.requestTimeout = 30000; server.headersTimeout = 10000;
return { server, flushNotifications: processOutbox };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.DATABASE_URL) throw Error('Configure DATABASE_URL for the explicitly migrated hub.');
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  let hub;
  try { hub = await createControlPlane({ pool, bootstrapSecret: process.env.HUB_BOOTSTRAP_SECRET, connectorToken: process.env.HUB_CONNECTOR_TOKEN, defaultTimezone: process.env.HUB_DEFAULT_TIMEZONE || 'UTC' }); }
  catch (error) { await pool.end(); throw error; }
  const worker = setInterval(() => hub.flushNotifications().catch(error => console.error('Notification worker failed', error.code || error.name)), 5000); worker.unref();
  hub.server.listen(Number(process.env.PORT || 8787), () => console.log('Watch Agents API listening'));
  for (const name of ['SIGINT','SIGTERM']) process.once(name, () => { clearInterval(worker); hub.server.close(() => { void pool.end(); }); });
}
