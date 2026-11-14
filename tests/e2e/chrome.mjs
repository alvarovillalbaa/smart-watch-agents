// T2: actual installed extension, two owned PostgreSQL/HTTP hubs, no real agent.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createControlPlane } from '../../services/control-plane/src/server.mjs';
import { migrate } from '../../services/control-plane/src/migrations.mjs';
const require = createRequire(join(process.env.WATCH_AGENTS_BROWSER_TOOLS, 'package.json')), { chromium } = require('playwright');
const output = join(process.env.WATCH_AGENTS_OUTPUT, 'chrome'); await mkdir(output);
const input = new URL(process.env.WATCH_AGENTS_T2_DATABASE_URL); assert.equal(input.pathname, '/watch_agents_t2'); assert.equal(input.hostname, '127.0.0.1');
const bootstrapSecret = 'authored-newtab-bootstrap-fixture-'.repeat(2), connectorToken = 'authored-newtab-connector-fixture-'.repeat(2);
const pools = [], servers = [], urls = [], contexts = [];
const receipt = { cases: [], contexts: [], serversClosed: false, poolsClosed: false, passed: false };
const selection = process.env.WATCH_AGENTS_CASES ? new Set(process.env.WATCH_AGENTS_CASES.split(',')) : null;
const ids = ['C01','C02','C03','C04','C05-390','C05-320']; if (selection) assert.ok(selection.size && [...selection].every(id => ids.includes(id)));
const pause = ms => new Promise(ok => setTimeout(ok, ms));
async function until(callback) { for (let n = 0; n < 100; n++) { if (await callback()) return; await pause(50); } throw Error('Authored asynchronous condition was not reached'); }
async function api(index, path, { token = bootstrapSecret, body = {}, method = 'POST' } = {}) { const response = await fetch(urls[index] + path, { method, headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, ...(method === 'GET' ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10000) }); const data = await response.json(); assert.ok(response.ok); return data; }
async function code(index) { return (await api(index, '/v1/admin/pairings')).code; }
async function seed(index, { title = 'Authored approval', full = false } = {}) {
  const values = [{ id: 'approval', status: 'awaiting_hitl', type: 'hitl.requested', title, hitl: { id: 'fixture/approval', label: 'Review the authored request', description: 'Only the disposable authored task is in scope.', risk: 'high', expiresAt: new Date(Date.now() + 600000).toISOString() } }];
  if (full) values.push({ id: 'running', status: 'running', type: 'run.created', title: 'Authored research in progress' }, { id: 'complete', status: 'completed', type: 'run.finished', title: 'Authored reference notes completed' });
  for (const value of values) await api(index, '/v1/ingest/events', { token: connectorToken, body: { eventId: randomUUID(), occurredAt: new Date().toISOString(), provider: 'hermes', agentId: 'authored', runId: value.id, sequence: 1, type: value.type, payload: { title: value.title, summary: 'Authored test source, not a real agent run.', status: value.status, ...(value.hitl ? { hitl: value.hitl } : {}) } } });
}
async function newTab(context) { const page = await context.newPage(); page.setDefaultTimeout(10000); await page.goto('chrome://newtab/'); await page.waitForSelector('#pair-form', { state: 'attached' }); await page.waitForFunction(() => !document.getElementById('status').textContent.includes('Opening this device')); assert.equal(await page.evaluate(() => location.protocol), 'chrome-extension:'); assert.equal(await page.evaluate(() => chrome.runtime.getManifest().name), 'Watch Agents — your agent hub'); return page; }
async function pairUI(page, index) { if (await page.locator('#setup').isHidden()) await page.locator('#open-setup').click(); await page.locator('#hub').fill(urls[index]); await page.locator('#code').fill(await code(index)); await page.locator('#device-name').fill('Authored new tab'); await page.locator('#pair').click(); await page.waitForFunction(origin => document.getElementById('connection-label').textContent === new URL(origin).host && document.getElementById('status').textContent.startsWith('Read from'), urls[index]); }
async function count(index) { return Number((await pools[index].query('SELECT count(*) FROM commands')).rows[0].count); }
async function safeConnection(page) { return page.evaluate(async () => { const client = await import('./client.mjs'), record = await client.connection(); return { revision: record.revision, origin: record.session?.origin, deviceId: record.session?.deviceId, extractable: record.session?.privateKey.extractable, keyType: record.session?.privateKey.type }; }); }
async function saved(page) { return page.evaluate(async () => (await (await import('./client.mjs')).savedIntents()).map(({ nonce, origin, status, commandId }) => ({ nonce, origin, status, commandId }))); }
async function shot(page, name) { await page.screenshot({ path: join(output, name + '.png'), fullPage: true, animations: 'disabled' }); }
async function reviewApproval(page, touch = false) { const button = page.getByRole('button', { name: 'Review approval', exact: true }); if (touch) await button.tap(); else await button.click(); await page.waitForSelector('#review[open]'); assert.match(await page.locator('#review-text').innerText(), /Only the disposable authored task/); }
async function attempt(id, options, run) {
  if (selection && !selection.has(id)) return;
  for (const pool of pools) await pool.query('TRUNCATE agents,devices,pairing_codes,audit_log CASCADE');
  const profile = join(process.env.WATCH_AGENTS_PROFILE_ROOT, id); const context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, viewport: { width: 1365, height: 900 }, args: ['--disable-extensions-except=' + process.env.WATCH_AGENTS_CHROME_UNPACKED, '--load-extension=' + process.env.WATCH_AGENTS_CHROME_UNPACKED], ...options }); contexts.push(context);
  const record = { id, closed: false }; receipt.contexts.push(record); const row = { id, passed: false }, errors = [], requests = [];
  context.on('page', page => { page.on('pageerror', error => errors.push(error.stack)); page.on('request', request => requests.push({ url: request.url(), method: request.method() })); });
  let page;
  try { page = await newTab(context); row.extensionId = await page.evaluate(() => chrome.runtime.id); await run(page, context, row); assert.deepEqual(errors, []); row.passed = true; }
  catch (error) { row.error = error.stack; if (page) { await shot(page, id + '-failure').catch(() => {}); await writeFile(join(output, id + '-failure.txt'), await page.locator('body').innerText().catch(() => 'No document')); } }
  finally { await context.close(); record.closed = true; row.pageErrors = errors; receipt.cases.push(row); await writeFile(join(output, id + '-requests.json'), JSON.stringify(requests, null, 2)); console.log(JSON.stringify(row)); }
}
try {
  const admin = new pg.Pool({ connectionString: input.href, max: 1 });
  try { await admin.query('CREATE DATABASE watch_agents_t2_b'); } finally { await admin.end(); }
  for (const name of ['watch_agents_t2','watch_agents_t2_b']) {
    const url = new URL(input); url.pathname = '/' + name; const pool = new pg.Pool({ connectionString: url.href, max: 3 }); pools.push(pool); await migrate(pool);
    const { server } = await createControlPlane({ pool, bootstrapSecret, connectorToken }); servers.push(server); await new Promise(ok => server.listen(0, '127.0.0.1', ok)); urls.push('http://127.0.0.1:' + server.address().port);
  }
  await attempt('C01', { colorScheme: 'dark' }, async (page, context, row) => {
    await seed(0, { full: true, title: '<img src=x onerror=window.__watchAgentsInjected=true> Authored approval' }); await pairUI(page, 0); assert.equal(await page.locator('.run-card').count(), 3); assert.equal(await page.evaluate(() => window.__watchAgentsInjected), undefined); assert.equal(await page.locator('#runs img').count(), 0);
    assert.equal((await safeConnection(page)).extractable, false); assert.equal((await pools[0].query('SELECT platform FROM devices')).rows[0].platform, 'chrome');
    await page.locator('#search').fill('reference notes'); assert.equal(await page.locator('.run-card').count(), 1); await page.locator('#search').fill(''); await page.locator('#filter').selectOption('attention'); assert.equal(await page.locator('.run-card').count(), 2); await page.locator('#filter').selectOption('all');
    await reviewApproval(page); assert.equal(await count(0), 0); await page.locator('#review-send').click(); await page.waitForFunction(() => document.getElementById('status').textContent.includes('acknowledged command')); assert.equal(await count(0), 1);
    const first = (await saved(page))[0]; assert.equal(first.status, 'acknowledged'); assert.equal(first.commandId, (await pools[0].query('SELECT id FROM commands')).rows[0].id);
    await page.getByRole('button', { name: 'Review follow-up', exact: true }).click(); await page.waitForSelector('#review[open]'); const prompt = (await pools[0].query('SELECT prompt FROM follow_up_drafts')).rows[0].prompt; assert.equal(await page.locator('#review-text').innerText(), prompt); await page.locator('#review-cancel').click(); assert.equal(await count(0), 1);
    await page.getByRole('button', { name: 'Review follow-up', exact: true }).click(); await page.locator('#review-send').click(); await until(async () => await count(0) === 2); await page.waitForFunction(() => document.querySelectorAll('.intent-status').length === 2 && [...document.querySelectorAll('.intent-status')].every(n => n.textContent === 'Hub acknowledged'));
    await shot(page, 'C01-installed-dark'); const original = await safeConnection(page); await page.reload(); await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('Read from')); assert.deepEqual(await safeConnection(page), original); assert.equal((await saved(page)).length, 2);
    await page.locator('#clear-acknowledged').click(); await until(async () => (await saved(page)).length === 0); assert.equal(await count(0), 2); row.commandCount = 2; row.privateKeyNonextractable = true; row.reloadPairingEqual = true; row.literalMarkupExecuted = false;
  });
  await attempt('C02', {}, async (page, context, row) => {
    await seed(0); await pairUI(page, 0); const path = urls[0] + '/v1/hitl/' + encodeURIComponent('fixture/approval') + '/approve';
    await page.route(path, async route => { const response = await route.fetch(); assert.equal(response.status(), 202); await route.abort('failed'); });
    await reviewApproval(page); await page.locator('#review-send').click(); await page.waitForFunction(() => document.getElementById('status').textContent.includes('saved for this original hub')); await page.unroute(path); assert.equal(await count(0), 1); const original = (await saved(page))[0]; assert.equal(original.status, 'uncertain'); const commandId = (await pools[0].query('SELECT id FROM commands')).rows[0].id;
    await pairUI(page, 1); assert.equal(await page.locator('.run-card').count(), 0); await page.getByRole('button', { name: 'Retry saved request', exact: true }).click(); await page.waitForFunction(() => document.querySelector('.intent-status')?.textContent === 'Hub acknowledged'); const after = (await saved(page))[0]; assert.equal(after.origin, urls[0]); assert.equal(after.commandId, commandId); assert.equal(await count(0), 1); assert.equal(await count(1), 0); assert.equal((await safeConnection(page)).origin, urls[1]); assert.equal(await page.locator('.run-card').count(), 0);
    await shot(page, 'C02-original-hub-retry'); row.responseAbortedAfterActualCommit = true; row.originalHubCommands = 1; row.currentHubCommands = 0; row.originalReceiptReconciled = true;
  });
  await attempt('C03', {}, async (page, context, row) => {
    await seed(0); await pairUI(page, 0); const second = await newTab(context); await second.waitForFunction(() => document.getElementById('status').textContent.startsWith('Read from'));
    let reached = false, release; const held = new Promise(ok => { release = ok; });
    await second.route(new RegExp('^' + urls[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/v1/runs\\?'), async route => { const response = await route.fetch(); reached = true; await held; await route.fulfill({ response }).catch(() => {}); });
    await second.locator('#open-setup').click(); await second.locator('#code').fill('AAAAAAAA'); await second.locator('#refresh').click(); await until(() => reached);
    await pairUI(page, 1); await second.waitForFunction(origin => document.getElementById('connection-label').textContent === new URL(origin).host, urls[1]); release(); await second.unrouteAll({ behavior: 'wait' }); await second.waitForFunction(() => document.getElementById('status').textContent.startsWith('Read from'));
    assert.equal(await second.locator('.run-card').count(), 0); assert.equal(await second.locator('#code').inputValue(), ''); assert.equal((await safeConnection(second)).origin, urls[1]); assert.equal(await count(0), 0); assert.equal(await count(1), 0); row.lateOldReadRejected = true; row.broadcastPairingChanged = true; row.previousCodeCleared = true;
  });
  await attempt('C04', {}, async (page, context, row) => {
    await pairUI(page, 0); const original = await safeConnection(page);
    await page.evaluate(() => { window.__watchAgentsOriginalPut = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function(...args) { if (this.name === 'state') throw new DOMException('Authored quota refusal', 'QuotaExceededError'); return window.__watchAgentsOriginalPut.apply(this, args); }; });
    await page.locator('#open-setup').click(); await page.locator('#hub').fill(urls[1]); await page.locator('#code').fill(await code(1)); await page.locator('#pair').click(); await page.waitForFunction(() => document.getElementById('status').textContent.includes('hub accepted device enrollment'));
    await page.evaluate(() => { IDBObjectStore.prototype.put = window.__watchAgentsOriginalPut; }); assert.deepEqual(await safeConnection(page), original); assert.equal(Number((await pools[1].query('SELECT count(*) FROM devices')).rows[0].count), 1);
    await page.evaluate(async () => { const db = await new Promise(ok => { const request = indexedDB.open('watch-agents-chrome-v1', 1); request.onsuccess = () => ok(request.result); }); try { await new Promise((ok, no) => { const tx = db.transaction('state','readwrite'); tx.objectStore('state').put({ revision: 'authored-corruption', session: null }, 'connection'); tx.oncomplete = ok; tx.onabort = () => no(tx.error); }); } finally { db.close(); } });
    await page.reload(); await page.waitForFunction(() => document.getElementById('status').textContent.includes('Stored pairing is invalid')); page.once('dialog', dialog => dialog.accept()); await page.locator('#forget').click(); await page.waitForFunction(() => document.getElementById('status').textContent.includes('local pairing and requests were forgotten')); assert.equal((await safeConnection(page)).revision, 0); assert.equal((await safeConnection(page)).origin, undefined); assert.equal(await count(0), 0); assert.equal(await count(1), 0); await shot(page, 'C04-explicit-storage-recovery'); row.injectedQuotaPreservedPairing = true; row.acceptedButUnstoredEnrollmentVisible = true; row.explicitCorruptStateRecovery = true;
  });
  for (const width of [390,320]) await attempt('C05-' + width, { viewport: { width, height: 844 }, hasTouch: true }, async (page, context, row) => {
    await seed(0, { title: 'Authored long source title for a narrow new-tab workspace' }); await pairUI(page, 0); await reviewApproval(page, true); await page.locator('#review-cancel').tap(); assert.equal(await count(0), 0); await reviewApproval(page, true); await page.locator('#review-send').tap(); await page.waitForFunction(() => document.getElementById('status').textContent.includes('acknowledged command')); assert.equal(await count(0), 1);
    await page.locator('#search').focus(); await page.keyboard.type('authored'); await page.keyboard.press('Tab'); const focus = await page.evaluate(() => ({ id: document.activeElement.id, outline: getComputedStyle(document.activeElement).outlineStyle })); assert.equal(focus.id, 'filter'); assert.equal(focus.outline, 'solid'); const dimensions = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, touch: navigator.maxTouchPoints })); assert.equal(dimensions.client, width); assert.ok(dimensions.scroll <= width + 1); assert.ok(dimensions.touch > 0); await shot(page, 'C05-' + width + '-touch'); await page.reload(); await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('Read from')); assert.equal((await saved(page))[0].status, 'acknowledged'); row.dimensions = dimensions; row.keyboardFocus = focus; row.actualTouchReviewAndAction = true; row.reloadReceiptPreserved = true;
  });
  receipt.passed = receipt.cases.length === (selection?.size ?? ids.length) && receipt.cases.every(row => row.passed);
} catch (error) { receipt.error = error.stack; }
finally {
  for (const context of contexts) await context.close().catch(() => {});
  for (const server of servers) { server.closeAllConnections(); await new Promise((ok, no) => server.close(error => error ? no(error) : ok())); } receipt.serversClosed = true;
  for (const pool of pools) await pool.end(); receipt.poolsClosed = true;
  receipt.passed = receipt.passed && receipt.serversClosed && receipt.poolsClosed && receipt.contexts.every(row => row.closed); await writeFile(join(output, 'receipt.json'), JSON.stringify(receipt, null, 2)); console.log(JSON.stringify(receipt));
}
if (!receipt.passed) process.exitCode = 1;
