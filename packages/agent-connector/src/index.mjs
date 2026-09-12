import { randomUUID } from 'node:crypto';

/**
 * Provider-neutral adapter used by Hermes and OpenClaw wrappers. The host emits
 * lifecycle events and receives only the two bound commands supported by v1.
 */
export function createAgentConnector({ hubUrl, token, provider, agentId, onApproveHitl, onDispatchFollowUp, fetchImpl = fetch }) {
  if (!['hermes', 'openclaw'].includes(provider)) throw new Error('provider must be hermes or openclaw');
  const base = hubUrl.replace(/\/$/, '');
  let sequence = 0;
  async function request(path, options = {}) {
    const response = await fetchImpl(`${base}${path}`, { ...options, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...options.headers } });
    if (!response.ok && response.status !== 204) throw new Error(`Hub request failed: ${response.status} ${await response.text()}`);
    return response.status === 204 ? null : response.json();
  }
  async function emit(type, runId, payload) {
    sequence += 1;
    return request('/v1/ingest/events', { method: 'POST', body: JSON.stringify({ eventId: randomUUID(), occurredAt: new Date().toISOString(), provider, agentId, runId, sequence, type, payload }) });
  }
  async function pollCommands() {
    const result = await request(`/v1/connectors/commands?agentKey=${encodeURIComponent(`${provider}:${agentId}`)}`);
    for (const command of result.commands) {
      try {
        if (command.type === 'approve_hitl') await onApproveHitl?.(command.body);
        if (command.type === 'dispatch_follow_up') await onDispatchFollowUp?.(command.body);
        await request(`/v1/connectors/commands/${command.id}/ack`, { method: 'POST', body: JSON.stringify({ ok: true }) });
      } catch (error) {
        await request(`/v1/connectors/commands/${command.id}/ack`, { method: 'POST', body: JSON.stringify({ ok: false, error: String(error) }) });
      }
    }
    return result.commands.length;
  }
  return { emit, pollCommands };
}
