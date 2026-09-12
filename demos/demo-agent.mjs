import { createAgentConnector } from '../packages/agent-connector/src/index.mjs';

const connector = createAgentConnector({
  hubUrl: process.env.HUB_URL || 'http://localhost:8787',
  token: process.env.HUB_CONNECTOR_TOKEN || 'replace-with-a-long-random-secret',
  provider: 'hermes',
  agentId: 'demo-hermes',
  onApproveHitl: async ({ hitlId }) => console.log(`Hermes approved ${hitlId}`),
  onDispatchFollowUp: async ({ prompt }) => console.log(`Hermes follow-up: ${prompt}`)
});

const runId = `demo-${Date.now()}`;
await connector.emit('run.created', runId, { title: 'Prepare release notes', status: 'running', summary: 'Gathering release information.' });
await connector.emit('hitl.requested', runId, { title: 'Prepare release notes', status: 'awaiting_hitl', summary: 'Ready to publish release notes.', hitl: { id: `${runId}-publish`, label: 'Publish release notes', description: 'Publish the reviewed release notes.', risk: 'medium', expiresAt: new Date(Date.now() + 600_000).toISOString() } });
console.log(`Created demo run ${runId}; approve it from a paired watch, then run this demo again or call connector.pollCommands().`);
