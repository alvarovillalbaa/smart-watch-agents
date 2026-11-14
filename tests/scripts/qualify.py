"""Remote T2 qualification, complete streams and owned PostgreSQL/process teardown."""
import hashlib
import json
import os
import plistlib
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import tempfile
import time
import uuid
import urllib.request
import zipfile

repo = Path(__file__).resolve().parents[2]
output = Path(os.environ['WATCH_AGENTS_OUTPUT'])
output.mkdir(exist_ok=False)
scratch = Path(tempfile.mkdtemp(prefix='watch-agents-t2-'))
identity = scratch.stat().st_ino
nonce = uuid.uuid4().hex
(scratch / 'owner').write_text(nonce)
work = scratch / 'source'
work.mkdir()
(scratch / 'tmp').mkdir()
env = dict(os.environ, npm_config_cache=str(scratch / 'npm-cache'), TMPDIR=str(scratch / 'tmp'))
deadline = time.monotonic() + 17 * 60
mode = os.environ['WATCH_AGENTS_MODE']
receipt = {'mode': mode, 'commands': [], 'passed': False, 'cleanup': False}
postgres = None
postgres_handles = []
keychain_owned = False
mac_keychain_owned = False

def vector(root):
    names = subprocess.check_output(['git', 'ls-files', '-z'], cwd=repo).split(b'\0')
    return [{'path': os.fsdecode(name), 'bytes': (root / os.fsdecode(name)).stat().st_size,
             'sha256': hashlib.sha256((root / os.fsdecode(name)).read_bytes()).hexdigest()} for name in names if name]

before = vector(repo)
(output / 'source-before.json').write_text(json.dumps(before, indent=2))
head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo).decode().strip()
(output / 'source.json').write_text(json.dumps({'sha': head}))
for row in before:
    target = work / row['path']
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(repo / row['path'], target)

def group_absent(pid):
    try:
        os.killpg(pid, 0)
        return False
    except ProcessLookupError:
        return True

def execute(name, argv, timeout, accepted=(0,), cwd=None):
    remaining = int(deadline - time.monotonic() - 30)
    if remaining < 1:
        raise RuntimeError('Qualification deadline reached before ' + name)
    timeout = min(timeout, remaining)
    process = subprocess.Popen(argv, cwd=cwd or work, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
    timed_out = False
    try:
        stdout, stderr = process.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        timed_out = True
        os.killpg(process.pid, signal.SIGTERM)
        try:
            stdout, stderr = process.communicate(timeout=10)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            stdout, stderr = process.communicate(timeout=10)
    for _ in range(30):
        if group_absent(process.pid):
            break
        time.sleep(0.1)
    (output / (name + '.stdout.txt')).write_bytes(stdout)
    (output / (name + '.stderr.txt')).write_bytes(stderr)
    row = {'name': name, 'argv': argv, 'exit': process.returncode, 'timedOut': timed_out, 'timeoutSeconds': timeout,
           'leaderReaped': process.poll() is not None, 'groupAbsent': group_absent(process.pid),
           'stdoutBytes': len(stdout), 'stderrBytes': len(stderr), 'stdoutSha256': hashlib.sha256(stdout).hexdigest(), 'stderrSha256': hashlib.sha256(stderr).hexdigest()}
    receipt['commands'].append(row)
    print(json.dumps(row), flush=True)
    if process.returncode not in accepted or timed_out or not row['groupAbsent']:
        raise RuntimeError(name + ' failed')
    return process.returncode

try:
    if mode in ['native', 'mac']:
        # An existing unknown item must never be deleted, even on a fresh runner.
        prior = execute('keychain-before', ['security', 'find-generic-password', '-s', 'dev.watch-agents.identity'], 10, accepted=(44,))
        keychain_owned = prior == 44
        env['WATCH_AGENTS_VECTOR_OUT'] = str(output / 'native-vector.json')
        execute('swift-version', ['swift', '--version'], 15)
        execute('swift-tests', ['swift', 'test', '--package-path', 'packages/apple-core'], 300)
        vector_data = json.loads((output / 'native-vector.json').read_text())
        if vector_data['schema'] != 'watch-agents.native-action-vector' or vector_data['version'] != 2:
            raise RuntimeError('Native client did not emit its real public request vector')
        if mode == 'mac':
            execute('mac-keychain-before', ['security', 'find-generic-password', '-s', 'dev.watch-agents.mac-device'], 10, accepted=(44,))
            mac_keychain_owned = True
            # The package's owned identity case is complete. The app probe must
            # independently refuse an existing item before touching Keychain.
            execute('package-keychain-cleanup', ['security', 'delete-generic-password', '-s', 'dev.watch-agents.identity'], 10, accepted=(0, 44))
            execute('package-keychain-after', ['security', 'find-generic-password', '-s', 'dev.watch-agents.identity'], 10, accepted=(44,))
            archive = scratch / 'xcodegen.zip'
            with urllib.request.urlopen('https://github.com/yonaskolb/XcodeGen/releases/download/2.46.0/xcodegen.zip', timeout=45) as response:
                with archive.open('xb') as target:
                    shutil.copyfileobj(response, target)
            digest = hashlib.sha256(archive.read_bytes()).hexdigest()
            if archive.stat().st_size != 4278764 or digest != '4d9e34b62172d645eed6457cac13fc222569974098ef4ee9c3368bedf0196806':
                raise RuntimeError('Public pinned XcodeGen archive differs')
            (output / 'xcodegen.json').write_text(json.dumps({'version': '2.46.0', 'bytes': archive.stat().st_size, 'sha256': digest}))
            xcodegen = scratch / 'xcodegen'
            execute('xcodegen-unpack', ['ditto', '-x', '-k', str(archive), str(xcodegen)], 20)
            execute('xcode-version', ['xcodebuild', '-version'], 20)
            execute('mac-generate', [str(xcodegen / 'xcodegen/bin/xcodegen'), 'generate', '--spec', 'apps/macos/project.yml'], 30)
            derived = scratch / 'derived'
            execute('mac-build', ['xcodebuild', '-project', 'apps/macos/WatchAgentsMac.xcodeproj', '-scheme', 'WatchAgentsMac', '-configuration', 'Debug', '-derivedDataPath', str(derived), 'CODE_SIGNING_ALLOWED=NO', 'build'], 480)
            app = derived / 'Build/Products/Debug/WatchAgentsMac.app'
            widget = app / 'Contents/PlugIns/WatchAgentsStatus.appex'
            for name, bundle, entitlements in [('widget', widget, work / 'apps/macos/WatchAgentsStatus.entitlements'), ('app', app, work / 'apps/macos/WatchAgentsMac.entitlements')]:
                execute('sign-' + name, ['codesign', '--force', '--sign', '-', '--entitlements', str(entitlements), str(bundle)], 30)
                execute('verify-' + name, ['codesign', '--verify', '--strict', '--verbose=2', str(bundle)], 20)
                execute('inspect-' + name, ['codesign', '-dvvv', '--entitlements', ':-', str(bundle)], 15)
                with (bundle / 'Contents/Info.plist').open('rb') as handle:
                    info = plistlib.load(handle)
                (output / (name + '-info.json')).write_text(json.dumps(info, indent=2, default=str))
            widget_entitlements = plistlib.loads((work / 'apps/macos/WatchAgentsStatus.entitlements').read_bytes())
            if widget_entitlements.get('com.apple.security.network.client') or 'AgentHubCore' in (work / 'apps/macos/Widget/WatchAgentsWidget.swift').read_text():
                raise RuntimeError('Widget gained network/credential client ownership')
            execute('mac-storage-probe', [str(app / 'Contents/MacOS/WatchAgentsMac'), '--qualify-storage'], 45)
            probe = json.loads((output / 'mac-storage-probe.stdout.txt').read_text().strip().splitlines()[-1])
            (output / 'mac-storage.json').write_text(json.dumps(probe, indent=2))
            if not probe['passed'] or not probe.get('ownedKeychainItemsAbsent'):
                raise RuntimeError('Actual app storage qualification failed')
            receipt['appGroupSnapshot'] = probe.get('appGroupSnapshot', False)
            execute('mac-package', ['ditto', '-c', '-k', '--sequesterRsrc', '--keepParent', str(app), str(output / 'WatchAgentsMac-0.2.0-adhoc-debug.zip')], 60)
            receipt['macBundlePackaged'] = True
    elif mode in ['http', 'chrome', 'mac-http']:
        if mode in ['http', 'mac-http']:
            native = Path(os.environ['WATCH_AGENTS_NATIVE_INPUT'])
            if json.loads((native / 'source.json').read_text())['sha'] != head:
                raise RuntimeError('Native vector belongs to a different source')
            if not json.loads((native / 'receipt.json').read_text())['passed']:
                raise RuntimeError('Native prerequisite did not pass')
            shutil.copyfile(native / 'native-vector.json', output / 'native-vector.json')
            env['WATCH_AGENTS_NATIVE_VECTOR'] = str(output / 'native-vector.json')
        execute('node-version', ['node', '--version'], 10)
        execute('dependencies', ['npm', 'ci', '--ignore-scripts', '--no-audit', '--no-fund'], 180)
        shutil.copyfile(work / 'package-lock.json', output / 'package-lock.json')
        binaries = Path('/usr/lib/postgresql/16/bin')
        if not (binaries / 'postgres').is_file():
            raise RuntimeError('The declared Ubuntu24.04 PostgreSQL16 runtime is unavailable')
        data = scratch / 'pg-data'
        execute('initdb', [str(binaries / 'initdb'), '-D', str(data), '-A', 'trust', '--no-locale', '--encoding=UTF8'], 30)
        with socket.socket() as probe:
            probe.bind(('127.0.0.1', 0))
            port = probe.getsockname()[1]
        postgres_handles = [open(output / 'postgres.stdout.txt', 'wb'), open(output / 'postgres.stderr.txt', 'wb')]
        postgres = subprocess.Popen([str(binaries / 'postgres'), '-D', str(data), '-h', '127.0.0.1', '-p', str(port), '-k', str(scratch / 'tmp'), '-c', 'max_connections=12'], stdout=postgres_handles[0], stderr=postgres_handles[1], start_new_session=True)
        for attempt in range(30):
            code = execute('pg-ready-' + str(attempt), [str(binaries / 'pg_isready'), '-h', '127.0.0.1', '-p', str(port)], 5, accepted=(0, 1, 2))
            if code == 0:
                break
            if postgres.poll() is not None:
                raise RuntimeError('Owned PostgreSQL stopped during startup')
            time.sleep(0.2)
        else:
            raise RuntimeError('Owned PostgreSQL never became ready')
        execute('createdb', [str(binaries / 'createdb'), '-h', '127.0.0.1', '-p', str(port), 'watch_agents_t2'], 15)
        env['WATCH_AGENTS_T2_DATABASE_URL'] = 'postgresql://127.0.0.1:' + str(port) + '/watch_agents_t2'
        if mode in ['http', 'mac-http']:
            env['WATCH_AGENTS_HTTP_RECEIPT'] = str(output / 'http-receipt.json')
            execute('http-tests', ['node', '--test', 'tests/integration/' + ('macos-http.test.mjs' if mode == 'mac-http' else 'action-http.test.mjs')], 180)
            result = json.loads((output / 'http-receipt.json').read_text())
            if not all(result[key] for key in ['serverClosed', 'poolClosed', 'nativeVectorAccepted']):
                raise RuntimeError('Actual native interoperability or HTTP teardown was not established')
        else:
            package = scratch / 'extension-package'
            execute('chrome-package', ['node', 'scripts/package-chrome.mjs', '--out', str(package)], 60)
            shutil.copyfile(str(package) + '.zip', output / 'WatchAgentsChrome-0.2.0.zip')
            shutil.copyfile(str(package) + '.manifest.json', output / 'chrome-package-manifest.json')
            manifest = json.loads(Path(str(package) + '.manifest.json').read_text())
            installed = scratch / 'installed-extension'
            installed.mkdir()
            with zipfile.ZipFile(str(package) + '.zip') as archive:
                if sorted(archive.namelist()) != sorted(row['path'] for row in manifest['files']):
                    raise RuntimeError('Extension archive membership differs')
                for row in manifest['files']:
                    path = Path(row['path'])
                    if path.is_absolute() or '..' in path.parts:
                        raise RuntimeError('Unsafe extension archive path')
                    data = archive.read(row['path'])
                    if len(data) != row['bytes'] or hashlib.sha256(data).hexdigest() != row['sha256'] or data != (package / path).read_bytes():
                        raise RuntimeError('Extension archive bytes differ')
                    target = installed / path
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(data)
            tools = scratch / 'browser-tools'
            tools.mkdir()
            shutil.copyfile(work / 'tests/fixtures/browser-tools/package.json', tools / 'package.json')
            execute('browser-dependencies', ['npm', 'install', '--ignore-scripts', '--no-audit', '--no-fund'], 180, cwd=tools)
            shutil.copyfile(tools / 'package-lock.json', output / 'browser-lock.json')
            env['PLAYWRIGHT_BROWSERS_PATH'] = str(scratch / 'browsers')
            execute('browser-install', ['node', str(tools / 'node_modules/playwright/cli.js'), 'install', '--with-deps', 'chromium'], 240)
            (scratch / 'browser-profiles').mkdir()
            env['WATCH_AGENTS_PROFILE_ROOT'] = str(scratch / 'browser-profiles')
            env['WATCH_AGENTS_BROWSER_TOOLS'] = str(tools)
            env['WATCH_AGENTS_CHROME_UNPACKED'] = str(installed)
            execute('chrome-browser', ['node', 'tests/e2e/chrome.mjs'], 300)
            result = json.loads((output / 'chrome/receipt.json').read_text())
            if not result['passed'] or not result['serversClosed'] or not result['poolsClosed']:
                raise RuntimeError('Actual extension behavior or teardown was not established')
    else:
        raise RuntimeError('Unknown qualification mode')
    receipt['passed'] = True
except Exception as error:
    receipt['error'] = repr(error)
finally:
    if mode in ['native', 'mac'] and keychain_owned:
        try:
            execute('keychain-cleanup', ['security', 'delete-generic-password', '-s', 'dev.watch-agents.identity'], 10, accepted=(0, 44))
            execute('keychain-after', ['security', 'find-generic-password', '-s', 'dev.watch-agents.identity'], 10, accepted=(44,))
            receipt['ownedKeychainItemAbsent'] = True
        except Exception as error:
            receipt['cleanupError'] = repr(error)
    if mode == 'mac' and mac_keychain_owned:
        try:
            execute('mac-keychain-cleanup', ['security', 'delete-generic-password', '-s', 'dev.watch-agents.mac-device'], 10, accepted=(0, 44))
            execute('mac-keychain-after', ['security', 'find-generic-password', '-s', 'dev.watch-agents.mac-device'], 10, accepted=(44,))
            receipt['ownedMacKeychainItemAbsent'] = True
        except Exception as error:
            receipt['cleanupError'] = repr(error)
    if postgres:
        if postgres.poll() is None:
            os.killpg(postgres.pid, signal.SIGINT)
            try:
                postgres.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(postgres.pid, signal.SIGKILL)
                postgres.wait(timeout=10)
        for handle in postgres_handles:
            handle.close()
        receipt['postgres'] = {'exit': postgres.returncode, 'leaderReaped': postgres.poll() is not None, 'groupAbsent': group_absent(postgres.pid)}
    after = vector(repo)
    copied = vector(work)
    (output / 'source-after.json').write_text(json.dumps(after, indent=2))
    (output / 'copied-source-after.json').write_text(json.dumps(copied, indent=2))
    receipt['sourceUnchanged'] = before == after == copied
    receipt['scratchBytes'] = sum(p.stat().st_size for p in scratch.rglob('*') if p.is_file() and not p.is_symlink())
    groups_closed = all(row['groupAbsent'] for row in receipt['commands']) and (not postgres or receipt.get('postgres', {}).get('groupAbsent'))
    if scratch.stat().st_ino == identity and (scratch / 'owner').read_text() == nonce and groups_closed and not receipt.get('cleanupError'):
        shutil.rmtree(scratch)
        receipt['cleanup'] = not scratch.exists()
    receipt['passed'] = receipt['passed'] and receipt['cleanup'] and receipt['sourceUnchanged'] and (mode not in ['native', 'mac'] or receipt.get('ownedKeychainItemAbsent', False)) and (mode != 'mac' or receipt.get('ownedMacKeychainItemAbsent', False))
    (output / 'receipt.json').write_text(json.dumps(receipt, indent=2))
    print(json.dumps(receipt), flush=True)
if not receipt['passed']:
    raise SystemExit(1)
