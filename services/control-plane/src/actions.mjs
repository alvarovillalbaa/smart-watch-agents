import { createHash, createPublicKey, randomUUID, verify } from 'node:crypto';
import { terminalStatuses } from './domain.mjs';
export class ActionError extends Error { constructor(status, message) { super(message); this.status = status; } }
const requireValue = (condition, status, message) => { if (!condition) throw new ActionError(status, message); };
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export function actionMessage({ method, path, timestamp, nonce, bodySha256 }) { return ['watch-agents.action.v2', method.toUpperCase(), path, timestamp, nonce, bodySha256].join('\n'); }
export function publicDeviceKey(pem) {
  requireValue(typeof pem === 'string' && pem.length <= 1000, 400, 'A P-256 public key is required');
  try { const key = createPublicKey(pem); requireValue(key.asymmetricKeyType === 'ec' && key.asymmetricKeyDetails?.namedCurve === 'prime256v1', 400, 'Device key must use P-256'); return key; }
  catch (error) { if (error instanceof ActionError) throw error; throw new ActionError(400, 'Invalid public key'); }
}
export function authenticateAction(req, device, rawBody) {
  const protocol = req.headers['x-watch-protocol'], timestamp = req.headers['x-watch-timestamp'], nonce = req.headers['x-watch-nonce'], signature = req.headers['x-watch-signature'];
  requireValue(protocol === '2', 400, 'Upgrade the device client to action protocol2');
  requireValue(typeof timestamp === 'string' && /^[1-9]\d{9,11}$/.test(timestamp), 400, 'Invalid action timestamp');
  requireValue(typeof nonce === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(nonce), 400, 'Invalid action nonce');
  requireValue(typeof signature === 'string' && signature.length <= 160 && /^[A-Za-z0-9+/]+={0,2}$/.test(signature), 400, 'Invalid device signature encoding');
  const bytes = Buffer.from(signature, 'base64'); requireValue(bytes.toString('base64') === signature, 400, 'Invalid device signature encoding');
  const message = actionMessage({ method: req.method, path: req.url, timestamp, nonce, bodySha256: digest(rawBody) });
  const key = publicDeviceKey(device.public_key_pem), raw = device.platform === 'watchos';
  requireValue(!raw || bytes.length === 64, 400, 'Invalid raw P-256 signature');
  let valid = false; try { valid = verify('sha256', Buffer.from(message), { key, dsaEncoding: raw ? 'ieee-p1363' : 'der' }, bytes); } catch {}
  requireValue(valid, 403, 'Invalid device signature'); return { nonce, timestamp: Number(timestamp), requestHash: digest(message) };
}
export async function commitAction(pool, { device, intent, kind, subject, now = Date.now() }) {
  requireValue(['approve_hitl', 'dispatch_follow_up'].includes(kind), 400, 'Unsupported action');
  const client = await pool.connect(), proposed = randomUUID();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL statement_timeout = '5s'");
    await client.query("SET LOCAL lock_timeout = '3s'");
    const claimed = await client.query('INSERT INTO device_actions (device_id,nonce,request_hash,command_id) VALUES ($1,$2,$3,$4) ON CONFLICT (device_id,nonce) DO NOTHING RETURNING nonce', [device.id, intent.nonce, intent.requestHash, proposed]);
    if (!claimed.rowCount) {
      const existing = (await client.query('SELECT request_hash,command_id FROM device_actions WHERE device_id=$1 AND nonce=$2', [device.id, intent.nonce])).rows[0];
      requireValue(existing?.request_hash === intent.requestHash, 409, 'This nonce belongs to another action');
      await client.query('COMMIT'); return { commandId: existing.command_id };
    }
    requireValue(Math.abs(Math.floor(now / 1000) - intent.timestamp) <= 300, 403, 'Action timestamp expired; refresh the subject before creating a new intent');
    let row, runId, body, action;
    if (kind === 'approve_hitl') {
      row = (await client.query('SELECT h.*, r.agent_key, r.sequence, r.status AS run_status, h.expires_at > clock_timestamp() AS unexpired FROM hitl_requests h JOIN runs r ON r.id=h.run_id WHERE h.id=$1 FOR UPDATE OF h,r', [subject])).rows[0];
      requireValue(row && row.status === 'pending' && row.unexpired && row.run_status === 'awaiting_hitl' && row.source_sequence === row.sequence, 409, 'HITL request expired, changed or was already decided; refresh the run');
      runId = row.run_id; body = { hitlId: subject }; action = 'hitl.approved';
    } else {
      row = (await client.query('SELECT f.*, r.agent_key, r.sequence, r.status AS run_status FROM follow_up_drafts f JOIN runs r ON r.id=f.run_id WHERE f.run_id=$1 FOR UPDATE OF f,r', [subject])).rows[0];
      requireValue(row && row.status === 'ready' && terminalStatuses.has(row.run_status) && row.source_sequence === row.sequence, 409, 'Follow-up changed or was already dispatched; refresh the run');
      runId = subject; body = { prompt: row.prompt }; action = 'follow_up.dispatched';
    }
    await client.query('INSERT INTO audit_log (id,actor,action,subject,metadata) VALUES ($1,$2,$3,$4,$5)', [randomUUID(), 'device:' + device.id, action, subject, { command: proposed, protocol: 2, requestHash: intent.requestHash, sourceSequence: row.source_sequence }]);
    await client.query('INSERT INTO commands (id,agent_key,run_id,type,body) VALUES ($1,$2,$3,$4,$5)', [proposed, row.agent_key, runId, kind, body]);
    if (kind === 'approve_hitl') await client.query("UPDATE hitl_requests SET status='approved',approved_at=now(),approved_by=$2 WHERE id=$1", [subject, device.id]);
    else await client.query("UPDATE follow_up_drafts SET status='dispatched',dispatched_at=now() WHERE run_id=$1", [subject]);
    await client.query('COMMIT'); return { commandId: proposed };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
