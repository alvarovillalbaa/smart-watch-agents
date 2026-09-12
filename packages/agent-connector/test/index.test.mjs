import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentConnector } from '../src/index.mjs';

test('connector emits normalized provider events', async () => {
  const calls = [];
  const connector = createAgentConnector({ hubUrl: 'https://hub.test', token: 'x', provider: 'hermes', agentId: 'planner', fetchImpl: async (url, options) => { calls.push({ url, body: JSON.parse(options.body) }); return new Response(JSON.stringify({ accepted: true }), { status: 202 }); } });
  await connector.emit('run.created', 'r1', { title: 'Plan', status: 'running' });
  assert.equal(calls[0].body.provider, 'hermes');
  assert.equal(calls[0].body.sequence, 1);
});
