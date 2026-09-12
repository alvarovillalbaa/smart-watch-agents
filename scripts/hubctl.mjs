const [group, action, ...args] = process.argv.slice(2);
const hub = (process.env.HUB_URL || 'http://localhost:8787').replace(/\/$/, '');
const secret = process.env.HUB_BOOTSTRAP_SECRET;
if (!secret) throw new Error('Set HUB_BOOTSTRAP_SECRET in the environment.');
const request = async (path, body) => {
  const response = await fetch(`${hub}${path}`, { method: 'POST', headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(await response.text());
  console.log(JSON.stringify(await response.json(), null, 2));
};
if (group === 'agent' && action === 'add') {
  const [provider, agentId, displayName = agentId] = args;
  if (!['hermes', 'openclaw'].includes(provider) || !agentId) throw new Error('Usage: hubctl agent add <hermes|openclaw> <agent-id> [display name]');
  await request('/v1/admin/agents', { provider, agentId, displayName });
} else if (group === 'pair' && action === 'create') {
  await request('/v1/admin/pairings', {});
} else {
  throw new Error('Usage: hubctl agent add <hermes|openclaw> <agent-id> [display name] | hubctl pair create');
}
