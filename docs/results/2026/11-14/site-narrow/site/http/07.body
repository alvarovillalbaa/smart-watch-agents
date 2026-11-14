// The extension owns this device's key, token and saved requests. No web-page API.
const database = 'watch-agents-chrome-v1', channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(database) : null;
const requireValue = (value, message) => { if (!value) throw Error(message); };
const clone = value => structuredClone(value);
function validConnection(value) {
  if (!value || !Number.isSafeInteger(value.revision) || value.revision < 0 || value.revision >= Number.MAX_SAFE_INTEGER) return false;
  if (value.session === null) return true;
  const session = value.session;
  try { return Boolean(session && hubOrigin(session.origin) === session.origin && typeof session.token === 'string' && session.token.length >= 32 && typeof session.deviceId === 'string' && session.privateKey instanceof CryptoKey && session.privateKey.type === 'private' && session.privateKey.extractable === false && session.privateKey.algorithm?.namedCurve === 'P-256'); } catch { return false; }
}
function extensionOnly() { requireValue(location.protocol === 'chrome-extension:', 'Pairing is available in the installed new-tab extension.'); }
export function hubOrigin(input) {
  let url; try { url = new URL(input); } catch { throw Error('Enter the HTTPS origin of your own hub.'); }
  requireValue((url.protocol === 'https:' || (url.protocol === 'http:' && ['127.0.0.1','localhost'].includes(url.hostname))) && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/', 'Use a plain HTTPS hub origin, or explicit localhost development origin.');
  return url.origin;
}
async function transaction(mode, operation) {
  extensionOnly();
  const db = await new Promise((ok, no) => { const request = indexedDB.open(database, 1); let finished = false; request.onupgradeneeded = () => { request.result.createObjectStore('state'); request.result.createObjectStore('intents', { keyPath: 'nonce' }); }; request.onerror = () => { finished = true; no(Error('Device storage could not open. Existing data was not reset.')); }; request.onblocked = () => { finished = true; no(Error('Close an older Watch Agents tab before opening storage.')); }; request.onsuccess = () => { if (finished) request.result.close(); else { finished = true; request.result.onversionchange = () => request.result.close(); ok(request.result); } }; });
  try { return await new Promise((ok, no) => { const tx = db.transaction(['state','intents'], mode); let result, failure; const state = tx.objectStore('state'), intents = tx.objectStore('intents'); tx.oncomplete = () => ok(result); tx.onabort = () => no(failure || Error('Device storage refused this operation. Existing data was not reset.')); tx.onerror = () => {}; const complete = value => { result = value; }; const fail = error => { failure = error; tx.abort(); }; const guard = callback => event => { try { callback(event); } catch (error) { fail(error); } }; try { operation({ state, intents, complete, fail, guard }); } catch (error) { fail(error); } }); }
  finally { db.close(); }
}
export async function connection() { return transaction('readonly', ({ state, complete, fail }) => { const request = state.get('connection'); request.onsuccess = () => { const value = request.result ?? { revision: 0, session: null }; if (!validConnection(value)) fail(Error('Stored pairing is invalid. Use the explicit local forget action to recover.')); else complete(value); }; }); }
export async function savedIntents() { return transaction('readonly', ({ intents, complete }) => { const request = intents.getAll(); request.onsuccess = () => complete(request.result); }); }
function changed() { channel?.postMessage({ kind: 'connection-changed' }); }
export function onConnectionChange(callback) { if (!channel) return () => {}; const listener = event => { if (event.data?.kind === 'connection-changed') callback(); }; channel.addEventListener('message', listener); return () => channel.removeEventListener('message', listener); }
export function onIntentChange(callback) { if (!channel) return () => {}; const listener = event => { if (event.data?.kind === 'intents-changed') callback(); }; channel.addEventListener('message', listener); return () => channel.removeEventListener('message', listener); }
const intentsChanged = () => channel?.postMessage({ kind: 'intents-changed' });
const bytesTo64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const hash = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
async function jsonRequest(origin, path, { token, method = 'GET', body, headers = {}, signal } = {}) {
  const controller = new AbortController(), abort = () => controller.abort(); signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) controller.abort(); const timer = setTimeout(abort, 10000);
  try {
    const response = await fetch(new URL(path, hubOrigin(origin)), { method, body, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}), ...headers }, credentials: 'omit', cache: 'no-store', redirect: 'error', signal: controller.signal });
    requireValue(Number(response.headers.get('content-length') || 0) <= 1048576, 'Hub response exceeds the device budget.');
    const reader = response.body?.getReader(), chunks = []; let length = 0; requireValue(reader, 'Hub response has no body.');
    try { while (true) { const { done, value } = await reader.read(); if (done) break; length += value.length; requireValue(length <= 1048576, 'Hub response exceeds the device budget.'); chunks.push(value); } } catch (error) { await reader.cancel().catch(() => {}); throw error; } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(length); let position = 0; for (const part of chunks) { bytes.set(part, position); position += part.length; }
    let data; try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { throw Error('Hub returned invalid JSON.'); }
    if (!response.ok) { const error = Error(response.status === 401 ? 'Pairing is no longer authorized. Pair this device again.' : String(data.error || 'Hub request failed').slice(0, 400)); error.status = response.status; throw error; }
    return data;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
export async function pair({ origin: input, code, label }, { expectedRevision, signal } = {}) {
  extensionOnly(); const origin = hubOrigin(input); requireValue(typeof code === 'string' && /^[A-F0-9]{8}$/i.test(code.trim()), 'Enter the eight-character code created by your hub.'); requireValue(typeof label === 'string' && label.trim().length > 0 && label.trim().length <= 100, 'Give this device a short name.');
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign','verify']);
  const spki = bytesTo64(await crypto.subtle.exportKey('spki', key.publicKey)), pem = '-----BEGIN PUBLIC KEY-----\n' + spki.match(/.{1,64}/g).join('\n') + '\n-----END PUBLIC KEY-----';
  let response;
  try { response = await jsonRequest(origin, '/v1/devices/pair', { method: 'POST', body: JSON.stringify({ platform: 'chrome', code: code.trim().toUpperCase(), label: label.trim(), publicKeyPem: pem, privacyMode: 'redacted' }), signal }); }
  catch (error) { if (!error.status) error.message += ' Pairing may have reached this hub; check it before creating another code. Previous pairing is preserved.'; throw error; }
  requireValue(response && typeof response.token === 'string' && response.token.length >= 32 && typeof response.deviceId === 'string', 'Hub returned an incompatible pairing response.');
  const session = { origin, label: label.trim(), token: response.token, deviceId: response.deviceId, privateKey: key.privateKey, publicKey: key.publicKey };
  try { await transaction('readwrite', ({ state, complete, fail, guard }) => { const request = state.get('connection'); request.onsuccess = guard(() => { const previous = request.result ?? { revision: 0 }; if (previous.revision !== expectedRevision) { fail(Error('Another tab changed the pairing. Your new device may be registered at the original hub; the newer local pairing was kept.')); return; } const next = { revision: previous.revision + 1, session }; state.put(next, 'connection'); complete(next); }); }); }
  catch (error) { throw Error(error.message + ' The hub accepted device enrollment but this browser did not replace its pairing. Previous local data is preserved.'); }
  changed(); return connection();
}
export async function refresh(captured, { signal } = {}) {
  const current = await connection(); requireValue(current.revision === captured.revision && current.session?.deviceId === captured.session?.deviceId, 'Another tab changed the pairing. Reload this view.'); requireValue(current.session, 'Pair this device first.');
  const { origin, token } = current.session;
  const [runs, metrics] = await Promise.all([jsonRequest(origin, '/v1/runs?limit=100', { token, signal }), jsonRequest(origin, '/v1/metrics/runs/daily?days=7&timezone=' + encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'), { token, signal })]);
  requireValue(Array.isArray(runs.runs) && runs.runs.length <= 100 && runs.runs.every(row => typeof row.id === 'string' && typeof row.title === 'string' && ['running','completed','failed','cancelled','awaiting_hitl'].includes(row.status)) && Array.isArray(metrics.series) && metrics.series.length <= 31 && metrics.series.every(point => /^\d{4}-\d{2}-\d{2}$/.test(point.day) && Number.isSafeInteger(point.count) && point.count >= 0), 'Hub returned an incompatible dashboard. Previous view is kept.');
  return { runs: runs.runs, metrics, fetchedAt: new Date().toISOString(), revision: current.revision, origin };
}
async function saveIntent(intent, revision) { await transaction('readwrite', ({ state, intents, complete, fail, guard }) => { const request = state.get('connection'); request.onsuccess = guard(() => { if ((request.result?.revision ?? 0) !== revision) { fail(Error('Another tab changed the pairing; no action was sent.')); return; } const count = intents.count(); count.onsuccess = guard(() => { if (count.result >= 100) { fail(Error('Review acknowledged receipts before saving more requests.')); return; } intents.add(intent); complete(); }); }); }); }
async function annotateIntent(nonce, update) { await transaction('readwrite', ({ intents, complete, guard }) => { const request = intents.get(nonce); request.onsuccess = guard(() => { if (request.result) intents.put({ ...request.result, ...update }); complete(); }); }); }
export async function prepareAction(captured, { kind, subject, label }) {
  requireValue(['approve_hitl','dispatch_follow_up'].includes(kind) && typeof subject === 'string' && subject.length > 0 && subject.length <= 1000 && typeof label === 'string', 'Invalid reviewed action.');
  const session = captured.session; requireValue(session, 'Pair this device first.');
  const path = kind === 'approve_hitl' ? '/v1/hitl/' + encodeURIComponent(subject) + '/approve' : '/v1/runs/' + encodeURIComponent(subject) + '/follow-up/dispatch';
  const nonce = crypto.randomUUID(), timestamp = String(Math.floor(Date.now() / 1000)), body = '{}';
  const message = ['watch-agents.action.v2', 'POST', path, timestamp, nonce, await hash(new TextEncoder().encode(body))].join('\n');
  const signature = bytesTo64(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, session.privateKey, new TextEncoder().encode(message)));
  const intent = { nonce, origin: session.origin, token: session.token, path, body, headers: { 'x-watch-protocol': '2', 'x-watch-timestamp': timestamp, 'x-watch-nonce': nonce, 'x-watch-signature': signature }, kind, subject, label: label.slice(0, 240), deviceId: session.deviceId, createdAt: new Date().toISOString(), status: 'prepared' };
  await saveIntent(intent, captured.revision); intentsChanged(); return clone(intent);
}
export async function sendSavedIntent(nonce) {
  const intent = (await savedIntents()).find(row => row.nonce === nonce); requireValue(intent, 'Saved request no longer exists.');
  if (intent.status === 'acknowledged') return { commandId: intent.commandId };
  requireValue(intent.headers?.['x-watch-nonce'] === nonce && intent.headers?.['x-watch-protocol'] === '2' && intent.body === '{}' && (intent.path === '/v1/hitl/' + encodeURIComponent(intent.subject) + '/approve' || intent.path === '/v1/runs/' + encodeURIComponent(intent.subject) + '/follow-up/dispatch'), 'Stored request is invalid. It was not sent.');
  let response;
  try { response = await jsonRequest(intent.origin, intent.path, { token: intent.token, method: 'POST', body: intent.body, headers: intent.headers }); requireValue(typeof response?.commandId === 'string', 'Hub response has no matching command receipt.'); }
  catch (error) { await annotateIntent(nonce, { status: 'uncertain', lastError: error.message }); intentsChanged(); throw Error(error.message + ' The request is saved for this original hub; retry it to reconcile the outcome.'); }
  try { await annotateIntent(nonce, { status: 'acknowledged', commandId: response.commandId, acknowledgedAt: new Date().toISOString() }); }
  catch { const error = Error('Hub acknowledged command ' + response.commandId + ', but this device could not save the receipt. Retry the original saved request to reconcile it.'); error.commandId = response.commandId; throw error; }
  intentsChanged(); return response;
}
export async function clearAcknowledged() { await transaction('readwrite', ({ intents, complete, guard }) => { let count = 0; const request = intents.openCursor(); request.onsuccess = guard(() => { const cursor = request.result; if (!cursor) { complete(count); return; } if (cursor.value.status === 'acknowledged') { cursor.delete(); count++; } cursor.continue(); }); }); intentsChanged(); }
export async function forgetDeviceData(expectedRevision) {
  await transaction('readwrite', ({ state, intents, complete, fail, guard }) => { const request = state.get('connection'); request.onsuccess = guard(() => { const previous = request.result ?? { revision: 0, session: null }; if (expectedRevision === null ? validConnection(previous) : previous.revision !== expectedRevision) { fail(Error('Another tab changed the pairing; nothing was forgotten.')); return; } state.put({ revision: expectedRevision === null ? 0 : previous.revision + 1, session: null }, 'connection'); intents.clear(); complete(); }); }); changed();
}
