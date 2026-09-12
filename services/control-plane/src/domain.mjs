export const providers = new Set(['hermes', 'openclaw']);
export const statuses = new Set(['running', 'completed', 'failed', 'cancelled', 'awaiting_hitl']);
export const terminalStatuses = new Set(['completed', 'failed', 'cancelled']);
export const eventTypes = new Set(['run.created', 'run.updated', 'run.finished', 'hitl.requested', 'hitl.resolved']);

export function validateEvent(event) {
  if (!event || typeof event !== 'object') return 'event must be an object';
  for (const key of ['eventId', 'occurredAt', 'provider', 'agentId', 'runId', 'sequence', 'type', 'payload']) {
    if (event[key] === undefined || event[key] === '') return `missing ${key}`;
  }
  if (!providers.has(event.provider)) return 'unknown provider';
  if (!eventTypes.has(event.type)) return 'unknown event type';
  if (!Number.isInteger(event.sequence) || event.sequence < 1) return 'sequence must be a positive integer';
  if (Number.isNaN(Date.parse(event.occurredAt))) return 'occurredAt must be ISO-8601';
  if (!event.payload.title || event.payload.title.length > 240) return 'payload.title is required and limited to 240 characters';
  if (event.payload.status && !statuses.has(event.payload.status)) return 'invalid payload.status';
  return null;
}

export function agentKey(provider, agentId) { return `${provider}:${agentId}`; }
export function runKey(provider, agentId, runId) { return `${provider}:${agentId}:${runId}`; }

export function defaultFollowUp({ title, summary, artifactUrls = [] }) {
  const artifacts = artifactUrls.length ? `\nArtifacts: ${artifactUrls.join(', ')}` : '';
  return `Review the completed run \"${title}\".\nResult: ${summary || 'No summary provided.'}${artifacts}\nContinue with the next appropriate action. Report blockers and the final outcome.`;
}

export function commandMessage({ method, path, nonce }) {
  return `${method.toUpperCase()}:${path}:${nonce}`;
}
