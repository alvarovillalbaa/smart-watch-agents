import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultFollowUp, validateEvent } from '../src/domain.mjs';

test('validates normalized events', () => {
  assert.equal(validateEvent({ eventId: 'e', occurredAt: new Date().toISOString(), provider: 'hermes', agentId: 'a', runId: 'r', sequence: 1, type: 'run.created', payload: { title: 'Run', status: 'running' } }), null);
  assert.match(validateEvent({ provider: 'invalid' }), /missing/);
});

test('follow-up is deterministic and includes the result', () => {
  assert.match(defaultFollowUp({ title: 'Deploy', summary: 'Passed' }), /Deploy/);
  assert.match(defaultFollowUp({ title: 'Deploy', summary: 'Passed' }), /Passed/);
});
