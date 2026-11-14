"""Derive a versioned proof from frozen complete streams; never rerun Docker."""
from pathlib import Path
import hashlib
import json
import re
import subprocess
import zipfile

repo = Path(__file__).resolve().parents[2]
base = repo / 'docs/results/2026/11-14/container-network-initial'
archive = base / 'original-artifact.zip'
assert archive.stat().st_size == 66167
assert hashlib.sha256(archive.read_bytes()).hexdigest() == '8670c0ab134c967691980557c3d89581ca3e19701ecb53c11409493c0ccde03d'
with zipfile.ZipFile(archive) as z:
    for item in z.infolist():
        if not item.is_dir():
            path = Path(item.filename); assert not path.is_absolute() and '..' not in path.parts
            assert (base / path).read_bytes() == z.read(item)
parent = json.loads((base / 'receipt.json').read_text())
child = json.loads((base / 'container/receipt.json').read_text())
assert parent['passed'] is False and parent['cleanup'] and parent['sourceUnchanged']
assert child['passed'] is False and child['error'] == "RuntimeError('base-digests failed')"
assert all(child[key]['passed'] for key in ['B01', 'B02', 'B03'])
assert child['ownedResourcesRemoved'] and child['internalFixtureRemovedBeforeProductionContext']
assert not any(child['ownedResourcesAfterCleanup'].values())
source = json.loads((base / 'source.json').read_text())['sha']
assert source == 'dfa13ff6753f65a1a7dbb6b88381ee27342a2f11'
before = json.loads((base / 'source-before.json').read_text())
assert before == json.loads((base / 'source-after.json').read_text()) == json.loads((base / 'copied-source-after.json').read_text())
for row in before:
    data = subprocess.check_output(['git', 'show', source + ':' + row['path']], cwd=repo)
    assert len(data) == row['bytes'] and hashlib.sha256(data).hexdigest() == row['sha256']
for root, receipt in [(base, parent), (base / 'container', child)]:
    for row in receipt['commands']:
        assert row['leaderReaped'] and row['groupAbsent'] and not row['timedOut']
        for stream in ['stdout', 'stderr']:
            data = (root / (row['name'] + '.' + stream + '.txt')).read_bytes()
            assert len(data) == row[stream + 'Bytes'] and hashlib.sha256(data).hexdigest() == row[stream + 'Sha256']
        expected = 1 if row['name'] in ['container-qualification', 'image-absent-before', 'base-digests', 'owned-image-absent-after'] else 0
        assert row['exit'] == expected
log = (base / 'container/container-build.stdout.txt').read_text() + (base / 'container/container-build.stderr.txt').read_text()
node_digests = set(re.findall(r'FROM docker\.io/library/node:24-alpine@(sha256:[a-f0-9]{64})', log)); assert len(node_digests) == 1
postgres = json.loads((base / 'container/base-digests.stdout.txt').read_text()); assert len(postgres) == 1
assert (base / 'container/base-digests.stderr.txt').read_text().strip() == 'Error response from daemon: No such image: node:24-alpine'
image = json.loads((base / 'container/actual-image.stdout.txt').read_text()); assert image['Id'] in log
assert image['Config']['User'] == 'node' and child['B01']['uid'] == 1000
assert any(row.get('status') == 200 and row.get('ok') for row in child['hostReadiness'])
proof = {'schema': 'watch-agents.container-proof', 'version': 2, 'source': source,
         'originalRun': 43605608554, 'originalJobRemainsFailed': True,
         'artifactBytes': archive.stat().st_size, 'artifactSha256': hashlib.sha256(archive.read_bytes()).hexdigest(),
         'sourceFiles': len(before), 'commands': len(parent['commands']) + len(child['commands']),
         'sourceUnchanged': True, 'allRecordedStreamsVerified': True,
         'B01': child['B01'], 'B02': child['B02'], 'B03': child['B03'],
         'nodeBaseDigestFromActualBuild': next(iter(node_digests)), 'postgresBaseDigest': postgres[0],
         'actualImageId': image['Id'], 'actualImageBytes': image['Size'],
         'ownedResourcesRemoved': True, 'scratchBytesRemoved': parent['scratchBytes'],
         'missingCacheInspectionCorrectedFromExistingBuildLog': True, 'newDockerExecution': False, 'passed': True}
target = base / 'derived-proof-v2.json'
assert not target.exists(), 'Never overwrite a proof version'
target.write_text(json.dumps(proof, indent=2) + '\n')
print(json.dumps(proof))
