import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..'), out = resolve(root, 'dist');
await mkdir(out, { recursive: true }); await mkdir(resolve(out, 'preview'), { recursive: true });
const mapping = [['site/index.html','index.html'],['site/site.css','site.css'],['site/mark.svg','mark.svg'], ...['newtab.html','newtab.mjs','style.css','client.mjs','demo.mjs'].map(name => ['apps/chrome/' + name,'preview/' + name])];
const files = [];
for (const [source, target] of mapping) { const bytes = await readFile(resolve(root, source)); await copyFile(resolve(root, source), resolve(out, target)); files.push({ source, target, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }); }
const inputs = [];
for (const path of [...mapping.map(row => row[0]), 'scripts/build-site.mjs', 'vercel.json']) { const bytes = await readFile(resolve(root, path)); inputs.push({ path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }); }
let source = process.env.VERCEL_GIT_COMMIT_SHA;
if (!source) source = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
await writeFile(resolve(out, 'build-manifest.json'), JSON.stringify({ schema: 'watch-agents.public-site', version: 1, source, files, inputs }, null, 2) + '\n');
console.log(JSON.stringify({ source, files: files.length, inputs: inputs.length }));
