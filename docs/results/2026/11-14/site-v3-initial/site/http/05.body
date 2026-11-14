import * as client from './client.mjs';
import { authoredPreview } from './demo.mjs';
const $ = id => document.getElementById(id), installed = location.protocol === 'chrome-extension:';
let current = null, dashboard = null, intents = [], busy = '', epoch = 0, readEpoch = 0, controller, review = null;
const el = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
function notice(text, error = false) { $('status').textContent = text; $('status').classList.toggle('error', error); }
function date(value) { const parsed = new Date(value); return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Time not supplied'; }
const statuses = { running: 'In progress', awaiting_hitl: 'Awaiting decision', completed: 'Completed', failed: 'Failed', cancelled: 'Cancelled' };
$('today').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
function syncControls() {
  $('pair').disabled = Boolean(busy); $('refresh').disabled = Boolean(busy) || !current?.session; $('review-send').disabled = Boolean(busy); $('forget').disabled = Boolean(busy); $('clear-acknowledged').disabled = Boolean(busy) || !intents.some(row => row.status === 'acknowledged');
  for (const node of document.querySelectorAll('[data-run-action],[data-retry]')) node.disabled = Boolean(busy) || !installed;
}
function renderHeader() {
  const session = current?.session; $('connection-label').textContent = session ? new URL(session.origin).host : installed ? 'Not paired' : 'Authored preview'; $('connection-label').classList.toggle('connected', Boolean(session)); $('hub').value = session?.origin || $('hub').value; $('device-name').value = session?.label || $('device-name').value;
  const data = dashboard, rows = data?.runs;
  for (const [id, value] of [['running-count', rows?.filter(r => r.status === 'running').length], ['approval-count', rows?.filter(r => r.hitl_id).length], ['followup-count', rows?.filter(r => r.follow_up_status === 'ready').length], ['week-count', data?.metrics.series.reduce((n, point) => n + point.count, 0)]]) $(id).textContent = value === undefined ? '—' : String(value);
  $('freshness').textContent = data ? 'Last read ' + date(data.fetchedAt) + ' · latest100 runs' : session ? 'Not read yet' : 'Pair a hub to begin'; $('week-caption').textContent = data ? 'Run starts · ' + String(data.metrics.timezone) : 'Recorded run starts';
}
function showReview(run, kind) {
  if (!installed) { notice('This is an authored preview. Install the extension and pair your own hub to send a real request.'); return; }
  if (busy || !current?.session || !dashboard) return;
  review = { revision: current.revision, origin: current.session.origin, fetchedAt: dashboard.fetchedAt, kind, subject: kind === 'approve_hitl' ? run.hitl_id : run.id, label: kind === 'approve_hitl' ? run.hitl_label || run.title : run.title };
  $('review-title').textContent = kind === 'approve_hitl' ? 'Approve this request?' : 'Dispatch this stored follow-up?'; $('review-origin').textContent = review.origin;
  $('review-text').textContent = kind === 'approve_hitl' ? [run.hitl_label || run.title, run.hitl_description || 'No approval description was supplied.', 'Risk: ' + (run.hitl_risk || 'not supplied'), run.hitl_expires_at ? 'Expires: ' + date(run.hitl_expires_at) : ''].filter(Boolean).join('\n\n') : run.follow_up_prompt;
  $('review-note').textContent = 'The hub checks this original subject before queuing a command. A lost response remains saved for reconciliation; changing this view does not undo a command.'; $('review').showModal();
}
function renderRuns() {
  const root = $('runs'); root.replaceChildren();
  if (!dashboard) { root.append(el('div', current?.session ? 'Refresh to read this hub. A failed refresh keeps the last successful view.' : 'Pair your own hub to see its agents. No sample runs are mixed into this device’s workspace.', 'empty')); return; }
  const term = $('search').value.trim().toLocaleLowerCase(), filter = $('filter').value;
  const rows = dashboard.runs.filter(run => (!term || [run.title, run.summary, run.display_name, run.provider].filter(Boolean).join(' ').toLocaleLowerCase().includes(term)) && (filter === 'all' || (filter === 'active' && ['running','awaiting_hitl'].includes(run.status)) || (filter === 'attention' && (run.hitl_id || run.follow_up_status === 'ready')) || (filter === 'finished' && ['completed','failed','cancelled'].includes(run.status))));
  if (!rows.length) root.append(el('div', dashboard.runs.length ? 'No runs match this view.' : 'No runs have been reported to this hub. Connect your own runtime to begin.', 'empty'));
  for (const run of rows) {
    const card = el('article', undefined, 'run-card panel'); card.dataset.runId = run.id;
    const top = el('div', undefined, 'run-top'); top.append(el('h3', run.title, 'run-title'), el('span', statuses[run.status], 'badge' + (run.hitl_id ? ' attention' : run.status === 'failed' ? ' failed' : ''))); card.append(top, el('p', String(run.provider || '') + ' / ' + String(run.display_name || ''), 'run-agent'));
    if (run.summary) card.append(el('p', run.summary, 'run-summary'));
    const footer = el('div', undefined, 'run-footer'); footer.append(el('span', 'Updated ' + date(run.updated_at)));
    if (run.hitl_id) { const action = el('button', 'Review approval'); action.type = 'button'; action.dataset.runAction = 'approve'; action.disabled = !installed || Boolean(busy); action.addEventListener('click', () => showReview(run, 'approve_hitl')); footer.append(action); }
    if (run.follow_up_status === 'ready' && run.follow_up_prompt) { const action = el('button', 'Review follow-up'); action.type = 'button'; action.dataset.runAction = 'followup'; action.disabled = !installed || Boolean(busy); action.addEventListener('click', () => showReview(run, 'dispatch_follow_up')); footer.append(action); }
    if (!installed && (run.hitl_id || run.follow_up_status === 'ready')) footer.append(el('span', 'Authored preview · actions unavailable'));
    for (const value of Array.isArray(run.artifact_urls) ? run.artifact_urls.slice(0, 5) : []) { try { const url = new URL(value); if (url.protocol === 'https:' && !url.username && !url.password) { const link = el('a', 'Artifact ↗'); link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; footer.append(link); } } catch {} }
    card.append(footer); root.append(card);
  }
}
function renderIntents() {
  const root = $('intents'); root.replaceChildren();
  if (!intents.length) root.append(el('p', 'No requests saved on this device.', 'muted'));
  for (const intent of [...intents].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 30)) {
    const box = el('article', undefined, 'intent'); box.dataset.intent = intent.nonce; box.append(el('h3', intent.label || 'Saved request'), el('p', intent.origin));
    const acknowledged = intent.status === 'acknowledged'; box.append(el('p', acknowledged ? 'Hub acknowledged' : 'Outcome not yet reconciled', 'intent-status' + (acknowledged ? '' : ' uncertain')));
    if (acknowledged) box.append(el('code', intent.commandId));
    else { if (intent.lastError) box.append(el('p', intent.lastError)); const retry = el('button', 'Retry saved request'); retry.type = 'button'; retry.dataset.retry = intent.nonce; retry.disabled = Boolean(busy); retry.addEventListener('click', () => void retryIntent(intent)); box.append(retry); }
    box.append(el('p', date(intent.acknowledgedAt || intent.createdAt))); root.append(box);
  }
}
async function readIntents() { if (!installed) return; try { intents = await client.savedIntents(); renderIntents(); syncControls(); } catch (error) { notice(error.message, true); } }
async function refreshHub({ announce = true } = {}) {
  if (!installed || !current?.session) return; const context = epoch, reading = ++readEpoch, capture = current; controller?.abort(); controller = new AbortController();
  if (announce) notice('Reading ' + capture.session.origin + '…');
  try { const data = await client.refresh(capture, { signal: controller.signal }); if (context !== epoch || reading !== readEpoch) return; dashboard = data; if (review) { review = null; $('review').close(); } renderHeader(); renderRuns(); if (announce) notice('Read from ' + data.origin + '. Counts describe the latest100 runs; source dates and seven-day starts come from your hub.'); }
  catch (error) { if (context === epoch && reading === readEpoch && error.name !== 'AbortError') notice(error.message + (dashboard ? ' The last successful view is preserved.' : ''), true); }
  finally { syncControls(); }
}
async function loadConnection({ announce = true } = {}) {
  const context = ++epoch, previousDevice = current?.session?.deviceId; readEpoch++; controller?.abort(); review = null; $('review').close(); dashboard = null;
  try { const value = await client.connection(); if (context !== epoch) return; current = value; if (current.session?.deviceId !== previousDevice) $('code').value = ''; renderHeader(); renderRuns(); $('setup').hidden = Boolean(current.session); if (current.session) await refreshHub({ announce }); else notice('Pair your own hub. Nothing is sent before you choose Pair device.'); }
  catch (error) { if (context === epoch) { current = null; renderHeader(); renderRuns(); $('setup').hidden = false; notice(error.message, true); } }
  finally { if (context === epoch) { await readIntents(); syncControls(); } }
}
$('pair-form').addEventListener('submit', async event => {
  event.preventDefault(); if (busy) return; const revision = current?.revision; if (revision === undefined) { notice('Recover this device’s local storage before pairing.', true); return; }
  busy = 'pair'; syncControls(); notice('Pairing this device with the specified hub…');
  try { await client.pair({ origin: $('hub').value, code: $('code').value, label: $('device-name').value }, { expectedRevision: revision }); $('code').value = ''; await loadConnection(); }
  catch (error) { notice(error.message, true); }
  finally { busy = ''; syncControls(); }
});
$('review-send').addEventListener('click', async () => {
  if (busy || !review) return; const capture = review, context = epoch;
  if (current?.revision !== capture.revision || current?.session?.origin !== capture.origin || dashboard?.fetchedAt !== capture.fetchedAt) { review = null; $('review').close(); notice('The workspace view changed. Review the current subject before sending.', true); return; }
  busy = 'action'; syncControls();
  try { const intent = await client.prepareAction(current, capture); $('review').close(); review = null; await readIntents(); const result = await client.sendSavedIntent(intent.nonce); notice('Hub ' + capture.origin + ' acknowledged command ' + result.commandId + '.'); if (context === epoch) await refreshHub({ announce: false }); }
  catch (error) { notice(error.message, !error.commandId); }
  finally { busy = ''; await readIntents(); syncControls(); }
});
async function retryIntent(intent) {
  if (busy) return; busy = 'retry'; syncControls();
  try { const response = await client.sendSavedIntent(intent.nonce); notice('Original hub ' + intent.origin + ' acknowledged command ' + response.commandId + '.'); if (current?.session?.origin === intent.origin) await refreshHub({ announce: false }); }
  catch (error) { notice(error.message, !error.commandId); }
  finally { busy = ''; await readIntents(); syncControls(); }
}
$('forget').addEventListener('click', async () => {
  if (busy || !confirm('Forget this extension’s keys, pairing and saved requests on this device? This cannot undo an acknowledged command or revoke the device at its hub. Other tabs will lose this local pairing.')) return;
  busy = 'forget'; syncControls();
  try { await client.forgetDeviceData(current?.revision ?? null); $('code').value = ''; $('hub').value = ''; await loadConnection(); notice('This device’s local pairing and requests were forgotten. Hub records and commands were not changed.'); }
  catch (error) { notice(error.message, true); }
  finally { busy = ''; syncControls(); }
});
$('clear-acknowledged').addEventListener('click', async () => { if (busy) return; try { await client.clearAcknowledged(); await readIntents(); notice('Acknowledged local receipts cleared. Pending requests and hub records are preserved.'); } catch (error) { notice(error.message, true); } });
$('search').addEventListener('input', renderRuns); $('filter').addEventListener('change', renderRuns); $('review-cancel').addEventListener('click', () => $('review').close()); $('review').addEventListener('close', () => { review = null; });
$('refresh').addEventListener('click', () => void refreshHub());
$('open-setup').addEventListener('click', () => { if (installed) { $('setup').hidden = !$('setup').hidden; if (!$('setup').hidden) $('hub').focus(); } else { dashboard = authoredPreview(); renderHeader(); renderRuns(); notice('Authored preview only. These example runs are not connected to an agent or hub, and actions are unavailable.'); } });
if (installed) { client.onConnectionChange(() => void loadConnection()); client.onIntentChange(() => void readIntents()); void loadConnection(); }
else { $('refresh').hidden = true; $('open-setup').textContent = 'Load authored preview'; $('clear-acknowledged').hidden = true; $('setup').hidden = true; notice('Install the Chrome extension to pair your own hub, or load the clearly labelled authored preview. This webpage sends no hub request.'); renderHeader(); renderRuns(); renderIntents(); }
