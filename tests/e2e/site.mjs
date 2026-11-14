// Actual anonymous public HTTPS landing/preview; no extension or hub authority.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
const require = createRequire(join(process.env.WATCH_AGENTS_BROWSER_TOOLS, 'package.json')), { chromium } = require('playwright');
const base = new URL(process.env.WATCH_AGENTS_SITE_URL); assert.equal(base.protocol, 'https:'); assert.equal(base.pathname, '/'); assert.equal(base.username + base.password + base.search + base.hash, '');
const output = join(process.env.WATCH_AGENTS_OUTPUT, 'site'); await mkdir(output); await mkdir(join(output, 'http'));
const receipt = { schema: 'watch-agents.public-browser-evidence', version: 1, base: base.origin, cases: [], http: [], browserClosed: false, contextsClosed: false, passed: false };
let browser; const contexts = [];
const selection = process.env.WATCH_AGENTS_CASES ? new Set(process.env.WATCH_AGENTS_CASES.split(',')) : null;
const ids = ['S01','S02-390','S03-320']; if (selection) assert.ok(selection.size && [...selection].every(id => ids.includes(id)));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function fetchBody(path) {
  const url = new URL(path, base), response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15000) });
  const bytes = Buffer.from(await response.arrayBuffer()); assert.ok(bytes.length <= 1024 * 1024);
  const file = String(receipt.http.length).padStart(2, '0') + '.body'; await writeFile(join(output, 'http', file), bytes);
  receipt.http.push({ url: url.href, status: response.status, headers: Object.fromEntries(response.headers), file, bytes: bytes.length, sha256: digest(bytes) });
  assert.equal(response.status, 200); return bytes;
}
try {
  const manifest = JSON.parse(await fetchBody('/build-manifest.json')); assert.equal(manifest.schema, 'watch-agents.public-site'); assert.equal(manifest.version, 2); assert.match(manifest.source, /^[a-f0-9]{40}$/);
  receipt.deploymentSource = manifest.source;
  for (const input of manifest.inputs) { assert.ok(!input.path.startsWith('/') && !input.path.split('/').includes('..')); assert.equal(input.encoding, input.path === 'vercel.json' ? 'canonical-json-v1' : 'raw'); const raw = await readFile(input.path), local = input.encoding === 'raw' ? raw : Buffer.from(JSON.stringify(JSON.parse(raw)) + '\n'); assert.equal(local.length, input.bytes); assert.equal(digest(local), input.sha256); }
  assert.equal(manifest.inputs.length, 10); assert.equal(manifest.files.length, 8);
  for (const file of manifest.files) { const bytes = await fetchBody('/' + (file.target === 'index.html' ? '' : file.target)); assert.equal(bytes.length, file.bytes); assert.equal(digest(bytes), file.sha256); }
  const favicon = await fetchBody('/favicon.ico'); assert.equal(digest(favicon), manifest.files.find(file => file.target === 'mark.svg').sha256);
  receipt.qualifiedInputBridge = manifest.inputs;
  browser = await chromium.launch({ channel: 'chromium', headless: true });
  for (const [id, options] of [['S01', { viewport: { width: 1365, height: 900 }, colorScheme: 'light' }], ['S02-390', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, colorScheme: 'light' }], ['S03-320', { viewport: { width: 320, height: 844 }, hasTouch: true, isMobile: true, colorScheme: 'dark' }]]) {
    if (selection && !selection.has(id)) continue;
    const context = await browser.newContext(options); contexts.push(context); const page = await context.newPage(); page.setDefaultTimeout(10000);
    const row = { id, passed: false, closed: false }, errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.stack)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text() + ' @ ' + message.location().url); });
    page.on('request', request => requests.push({ url: request.url(), method: request.method() }));
    await page.addInitScript(() => { window.__watchAgentsTouches = []; document.addEventListener('pointerdown', event => window.__watchAgentsTouches.push({ pointerType: event.pointerType, trusted: event.isTrusted, target: event.target.closest('a,button')?.textContent }), true); });
    try {
      await page.goto(base.href, { waitUntil: 'networkidle' }); assert.match(await page.locator('h1').innerText(), /Your agents\.[\s\S]*Still within reach/);
      const landingSize = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth })); assert.ok(landingSize.scroll <= landingSize.width + 1); row.landingSize = landingSize;
      await page.screenshot({ path: join(output, id + '-landing.png'), fullPage: true, animations: 'disabled' });
      const preview = page.getByRole('link', { name: /Explore the new-tab preview/ }); if (options.hasTouch) await preview.tap(); else await preview.click();
      await page.getByRole('button', { name: 'Load authored preview' }).waitFor({ state: 'visible' }); assert.equal(new URL(page.url()).pathname, '/preview/newtab.html');
      if (options.hasTouch) { const session = await context.newCDPSession(page); await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 }); row.explicitTouchEmulationAfterNavigation = true; }
      assert.equal(await page.locator('#connection-label').innerText(), 'Authored preview'); assert.equal(await page.locator('.run-card').count(), 0); assert.equal(await page.locator('#setup').isHidden(), true); assert.equal(await page.locator('#refresh').isHidden(), true);
      const load = page.getByRole('button', { name: 'Load authored preview' }); if (options.hasTouch) await load.tap(); else await load.click();
      assert.equal(await page.locator('.run-card').count(), 3); assert.match(await page.locator('#status').innerText(), /Authored preview only/);
      for (const button of await page.locator('[data-run-action]').all()) assert.equal(await button.isDisabled(), true);
      assert.equal(await page.locator('[data-run-action]').count(), 2);
      await page.locator('#search').fill('reference notes'); assert.equal(await page.locator('.run-card').count(), 1);
      await page.locator('#search').fill(''); await page.locator('#filter').selectOption('active'); assert.equal(await page.locator('.run-card').count(), 2);
      await page.locator('#filter').selectOption('all'); await page.locator('#search').focus(); await page.keyboard.press('Tab');
      row.keyboardFocus = await page.evaluate(() => ({ id: document.activeElement.id, outline: getComputedStyle(document.activeElement).outlineStyle })); assert.equal(row.keyboardFocus.id, 'filter'); assert.equal(row.keyboardFocus.outline, 'solid');
      row.previewSize = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, touch: navigator.maxTouchPoints })); assert.ok(row.previewSize.scroll <= row.previewSize.width + 1);
      row.touchEvents = await page.evaluate(() => window.__watchAgentsTouches); if (options.hasTouch) { assert.ok(row.previewSize.touch > 0); assert.ok(row.touchEvents.some(event => event.pointerType === 'touch' && event.trusted)); }
      await page.screenshot({ path: join(output, id + '-preview.png'), fullPage: true, animations: 'disabled' });
      await page.reload({ waitUntil: 'networkidle' }); assert.equal(await page.locator('.run-card').count(), 0); assert.equal(await page.locator('#setup').isHidden(), true); assert.equal(await page.locator('#connection-label').innerText(), 'Authored preview');
      assert.deepEqual(errors, []); assert.ok(requests.every(request => new URL(request.url).origin === base.origin && request.method === 'GET' && !new URL(request.url).pathname.startsWith('/v1/')));
      row.previewActionsDisabled = true; row.reloadDoesNotPersistSampleRuns = true; row.noHubRequest = true; row.passed = true;
    } catch (error) { row.error = error.stack; await page.screenshot({ path: join(output, id + '-failure.png'), fullPage: true, animations: 'disabled' }).catch(() => {}); await writeFile(join(output, id + '-failure.txt'), await page.locator('body').innerText().catch(() => 'No document')); }
    finally { row.pageErrors = errors; await writeFile(join(output, id + '-requests.json'), JSON.stringify(requests, null, 2)); await context.close(); row.closed = true; receipt.cases.push(row); console.log(JSON.stringify(row)); }
  }
  receipt.passed = receipt.cases.length === (selection?.size ?? ids.length) && receipt.cases.every(row => row.passed);
} catch (error) { receipt.error = error.stack; }
finally {
  for (const context of contexts) await context.close().catch(() => {}); receipt.contextsClosed = true;
  if (browser) { await browser.close(); receipt.browserClosed = true; }
  receipt.passed = receipt.passed && receipt.contextsClosed && receipt.browserClosed;
  await writeFile(join(output, 'receipt.json'), JSON.stringify(receipt, null, 2)); console.log(JSON.stringify(receipt));
}
if (!receipt.passed) process.exitCode = 1;
