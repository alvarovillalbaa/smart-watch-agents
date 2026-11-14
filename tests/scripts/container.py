"""Actual owned Compose packaging check; no existing Docker project or database."""
import hashlib
import http.client
import json
import os
from pathlib import Path
import signal
import subprocess
import time
import uuid

root = Path.cwd()
output = Path(os.environ['WATCH_AGENTS_OUTPUT']) / 'container'
output.mkdir(exist_ok=False)
project = 'watchagents-t2-' + uuid.uuid4().hex[:14]
env = dict(os.environ, COMPOSE_PROJECT_NAME=project)
compose = ['docker', 'compose', '-p', project, '-f', 'compose.yaml', '-f', 'tests/fixtures/container.compose.yaml']
receipt = {'schema': 'watch-agents.container-evidence', 'version': 1, 'project': project, 'commands': [], 'passed': False}
deadline = time.monotonic() + 9 * 60
owned = False

def run(name, argv, timeout=30, accepted=(0,)):
    process = subprocess.Popen(argv, cwd=root, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
    expired = False
    try:
        stdout, stderr = process.communicate(timeout=max(1, min(timeout, deadline - time.monotonic())))
    except subprocess.TimeoutExpired:
        expired = True
        os.killpg(process.pid, signal.SIGTERM)
        try:
            stdout, stderr = process.communicate(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL); stdout, stderr = process.communicate(timeout=5)
    try:
        os.killpg(process.pid, 0); absent = False
    except ProcessLookupError:
        absent = True
    row = {'name': name, 'argv': argv, 'exit': process.returncode, 'timedOut': expired, 'leaderReaped': process.poll() is not None, 'groupAbsent': absent}
    for label, data in [('stdout', stdout), ('stderr', stderr)]:
        (output / (name + '.' + label + '.txt')).write_bytes(data)
        row[label + 'Bytes'] = len(data); row[label + 'Sha256'] = hashlib.sha256(data).hexdigest()
    receipt['commands'].append(row)
    if process.returncode not in accepted or expired or not absent:
        raise RuntimeError(name + ' failed')
    return stdout

def resources(kind):
    listing = {'containers': ['docker', 'ps', '-aq'], 'volumes': ['docker', 'volume', 'ls', '-q'], 'networks': ['docker', 'network', 'ls', '-q']}
    return run('list-' + kind + '-' + str(len(receipt['commands'])), listing[kind] + ['--filter', 'label=com.docker.compose.project=' + project]).decode().split()

def request(path, token=None, body=None):
    connection = http.client.HTTPConnection('127.0.0.1', 8787, timeout=5)
    try:
        headers = {'content-type': 'application/json'}
        if token:
            headers['authorization'] = 'Bearer ' + token
        connection.request('POST' if body is not None else 'GET', path, body=json.dumps(body) if body is not None else None, headers=headers)
        response = connection.getresponse(); data = response.read(65537)
        assert len(data) <= 65536
        return response.status, json.loads(data)
    finally:
        connection.close()

def wait_for_host():
    observations = []
    for _ in range(30):
        try:
            status, value = request('/health'); observations.append({'status': status, 'ok': value.get('ok')})
            if status == 200 and value.get('ok'):
                receipt['hostReadiness'] = observations
                return
        except (OSError, ValueError, http.client.HTTPException) as error:
            observations.append({'error': repr(error)})
        time.sleep(0.25)
    receipt['hostReadiness'] = observations
    raise RuntimeError('Actual production-network composed API did not become healthy on its published loopback port')

try:
    assert not (root / '.env').exists(), 'Never replace an existing environment'
    assert all(not resources(kind) for kind in ['containers', 'volumes', 'networks'])
    owned = True
    fixture = {'HUB_DB_PASSWORD': 'a' * 64, 'HUB_BOOTSTRAP_SECRET': 'authored-compose-bootstrap-' * 3, 'HUB_CONNECTOR_TOKEN': 'authored-compose-connector-' * 3, 'HUB_PUBLIC_URL': 'http://127.0.0.1:8787'}
    (root / '.env').write_text(''.join(key + '=' + value + '\n' for key, value in fixture.items()))
    config = json.loads(run('compose-config', compose + ['config', '--format', 'json']))
    assert config['services']['api']['ports'][0]['host_ip'] == '127.0.0.1'
    assert 'ports' not in config['services']['postgres']
    assert config['networks']['default']['internal'] is True
    run('image-absent-before', ['docker', 'image', 'inspect', project + '-api'], accepted=(1,))
    run('container-build', compose + ['build', '--pull', 'api'], 240)
    package = json.loads(run('runtime-lock-and-user', compose + ['run', '--rm', '--no-deps', 'api', 'node', '-e', 'console.log(JSON.stringify({uid:process.getuid(),node:process.versions.node,pg:require("pg/package.json").version}))']))
    lock = json.loads((root / 'package-lock.json').read_text())
    assert package['uid'] == 1000 and package['node'].startswith('24.') and package['pg'] == lock['packages']['node_modules/pg']['version']
    receipt['B01'] = {'passed': True, **package}
    run('postgres-start', compose + ['up', '-d', '--wait', 'postgres'], 90)
    run('explicit-migration', compose + ['run', '--rm', '--no-deps', 'api', 'npm', '--workspace', '@watch-agents/control-plane', 'run', 'migrate'], 40)
    run('api-start', compose + ['up', '-d', 'api'], 40)
    public = json.loads((root / 'docs/results/2026/11-14/macos-v1/native/native-vector.json').read_text())['publicKeyPem']
    client = '''
import assert from 'node:assert/strict';
const [base, publicKeyPem, bootstrap] = process.argv.slice(1);
async function req(path, token, body) { const response = await fetch(base+path, {method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(5000)});return [response.status,await response.json()]; }
let ready=false; for(let i=0;i<30;i++){try{const [status,value]=await req('/health');if(status===200&&value.ok){ready=true;break;}}catch{}await new Promise(ok=>setTimeout(ok,250));}assert.ok(ready);
assert.equal((await req('/v1/admin/pairings',null,{}))[0],401);
const [created,code]=await req('/v1/admin/pairings',bootstrap,{});assert.equal(created,201);
const [paired,device]=await req('/v1/devices/pair',null,{code:code.code,platform:'chrome',publicKeyPem,label:'Authored internal packaged client'});assert.equal(paired,201);
assert.deepEqual(await req('/v1/runs',device.token),[200,{runs:[]}]);
console.log(JSON.stringify({passed:true,health:true,anonymousAdminRefused:true,pairingAndEmptyRead:true,actualInternalNetworkClient:true}));
'''
    receipt['B02'] = json.loads(run('internal-http-client', compose + ['run', '--rm', '--no-deps', 'api', 'node', '--input-type=module', '-e', client, 'http://api:8787', public, fixture['HUB_BOOTSTRAP_SECRET']], 40))
    # A Docker internal network is a distinct fixture context. Keep that
    # constraint and qualify ordinary deployment port publication separately.
    run('internal-compose-logs', compose + ['logs', '--no-color', '--timestamps'])
    run('internal-compose-down', compose + ['down', '--volumes', '--timeout', '10'], 45)
    assert all(not resources(kind) for kind in ['containers', 'volumes', 'networks'])
    receipt['internalFixtureRemovedBeforeProductionContext'] = True
    compose = ['docker', 'compose', '-p', project, '-f', 'compose.yaml']
    production = json.loads(run('production-compose-config', compose + ['config', '--format', 'json']))
    assert not production['networks']['default'].get('internal', False)
    assert production['services']['api']['ports'][0]['host_ip'] == '127.0.0.1'
    assert 'ports' not in production['services']['postgres']
    run('production-postgres-start', compose + ['up', '-d', '--wait', 'postgres'], 60)
    run('production-explicit-migration', compose + ['run', '--rm', '--no-deps', 'api', 'npm', '--workspace', '@watch-agents/control-plane', 'run', 'migrate'], 40)
    run('production-api-start', compose + ['up', '-d', 'api'], 30)
    wait_for_host()
    assert request('/v1/admin/pairings', body={})[0] == 401
    status, code = request('/v1/admin/pairings', fixture['HUB_BOOTSTRAP_SECRET'], {})
    assert status == 201
    status, enrollment = request('/v1/devices/pair', body={'code': code['code'], 'platform': 'chrome', 'publicKeyPem': public, 'label': 'Authored packaged client'})
    assert status == 201
    assert request('/v1/runs', enrollment['token']) == (200, {'runs': []})
    receipt['B03'] = {'passed': True, 'health': True, 'anonymousAdminRefused': True, 'pairingAndEmptyRead': True, 'actualPublishedLoopbackApi': True, 'postgresNotPublished': True, 'ordinaryComposeNetwork': True, 'noAgentEventOrProviderRequest': True}
    run('actual-image', ['docker', 'image', 'inspect', project + '-api', '--format', '{{json .}}'])
    run('base-digests', ['docker', 'image', 'inspect', 'node:24-alpine', 'postgres:16-alpine', '--format', '{{json .RepoDigests}}'])
    receipt['passed'] = True
except Exception as error:
    receipt['error'] = repr(error)
finally:
    if owned:
        try:
            before = {kind: resources(kind) for kind in ['containers', 'volumes', 'networks']}
            receipt['ownedResourcesBeforeCleanup'] = before
            run('compose-logs', compose + ['logs', '--no-color', '--timestamps'], 20)
            run('compose-down', compose + ['down', '--volumes', '--timeout', '10'], 45)
            after = {kind: resources(kind) for kind in ['containers', 'volumes', 'networks']}
            receipt['ownedResourcesAfterCleanup'] = after
            assert not any(after.values())
            run('owned-image-remove', ['docker', 'image', 'rm', project + '-api'], 20, accepted=(0, 1))
            run('owned-image-absent-after', ['docker', 'image', 'inspect', project + '-api'], 10, accepted=(1,))
            receipt['ownedResourcesRemoved'] = True
        except Exception as error:
            receipt['cleanupError'] = repr(error); receipt['passed'] = False
    else:
        receipt['passed'] = False
    receipt['passed'] = receipt['passed'] and receipt.get('ownedResourcesRemoved', False)
    (output / 'receipt.json').write_text(json.dumps(receipt, indent=2))
    print(json.dumps(receipt), flush=True)
if not receipt['passed']:
    raise SystemExit(1)
