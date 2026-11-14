import { mkdir, copyFile, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--out') throw Error('Use --out with a NEW output directory. Existing output is never overwritten.');
const output = resolve(args[1]), root = resolve(import.meta.dirname, '..');
await mkdir(resolve(output, '..'), { recursive: true }); await mkdir(output);
const names = ['manifest.json','client.mjs','demo.mjs','newtab.mjs','newtab.html','style.css'];
for (const name of names) await copyFile(join(root, 'apps/chrome', name), join(output, name));
execFileSync('python3', [join(root, 'scripts/chrome-assets.py'), output], { stdio: 'inherit' });
const files = [...names, ...(await readdir(join(output, 'icons'))).sort().map(n => 'icons/' + n)];
const manifest = { schema: 'watch-agents.chrome-package', version: '0.2.0', files: [] };
for (const name of files) { const bytes = await readFile(join(output, name)); manifest.files.push({ path: name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }); }
await writeFile(output + '.manifest.json', JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
execFileSync('python3', ['-c', 'from pathlib import Path; import zipfile,sys; root=Path(sys.argv[1]); archive=zipfile.ZipFile(str(root)+".zip","x",compression=zipfile.ZIP_DEFLATED); [archive.write(root/name,name) for name in sys.argv[2:]]; archive.close()', output, ...files], { stdio: 'inherit' });
console.log(JSON.stringify({ files: files.length, output, archive: output + '.zip' }));
