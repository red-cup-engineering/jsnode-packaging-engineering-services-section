import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp, mkdir, writeFile, readFile, rm, realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {Worker} from 'node:worker_threads';
import {createNativeInstallationService} from '@red-cup-engineering/pnpm-engineering-services-section/native-installation';
import {receiveArchiveReuseEvents} from '../src/native-installation.mjs';
import {inspectHookFreeYaml, receiveHookFreeProfile} from '../src/native-hook-profile.mjs';
import {createReceivedArchiveFetchers} from '../src/native-archive-fetcher.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const sri = bytes => 'sha512-' + createHash('sha512').update(bytes).digest('base64');

test('closed hook-free profile is an absence proof, not a general YAML loader', () => {
  for (const text of ['', '# comment\n', 'minimumReleaseAge: 1440\nminimumReleaseAgeStrict: true\n',
    'overrides:\n  provider: 1.0.0\npackages:\n  - .\n', 'dependencies: {}\nconfiguration: plain\n']) assert.equal(inspectHookFreeYaml(text), true);
  for (const text of ['pnpmfile: ./hook.mjs\n', 'globalPnpmfile: ./hook\n', 'ignorePnpmfile: true\n',
    'configDependencies:\n  plugin: 1.0.0\n', 'config_dependencies: {}\n', 'CONFIG-DEPENDENCIES: {}\n', 'PNPM_FILE: ./hook\n', '  pnpmfile: ./hook\n',
    '---\nminimumReleaseAge: 1\n', 'foo: 1\n...\n', '%YAML 1.2\nfoo: 1\n', '{pnpmfile: ./hook}\n',
    '"pnpmfile": ./hook\n', 'foo: &anchor {}\n', '<<: *anchor\n', 'foo:\t1\n', '\ufefffoo: 1\n'])
    assert.throws(() => inspectHookFreeYaml(text), /profile|YAML|composable/);
});

test('actual configuration selectors and defaults cannot be silently displaced', async t => {
  const root = await mkdtemp(join(tmpdir(), 'native-hook-profile-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const contextNames = Object.keys(process.env).filter(name => /^(?:npm|pnpm)[_.-]config[_.-](?:prefix|global|global[_.-]?dir|dir|workspace[_.-]?dir|workspace[_.-]?root|workspace|ignore[_.-]?workspace|lockfile[_.-]?dir|pnpmfile|global[_.-]?pnpmfile|(?:no[_.-]?)?ignore[_.-]?pnpmfile|config[_.-]?dependencies|recursive|filter(?:[_.-]?prod)?)$/iu.test(name));
  const savedContext = new Map(contextNames.map(name => [name, process.env[name]]));
  for (const name of contextNames) delete process.env[name];
  t.after(() => { for (const [name, value] of savedContext) process.env[name] = value; });
  const previous = process.env.XDG_CONFIG_HOME; process.env.XDG_CONFIG_HOME = join(root, 'config');
  t.after(() => { if (previous === undefined) delete process.env.XDG_CONFIG_HOME; else process.env.XDG_CONFIG_HOME = previous; });
  await mkdir(join(root, 'config', 'pnpm'), {recursive: true});
  await writeFile(join(root, 'pnpm-workspace.yaml'), 'minimumReleaseAge: 1440\nminimumReleaseAgeStrict: true\n');
  const args = ['/native-entry', '--dir', root, 'install', '--frozen-lockfile'];
  const first = await receiveHookFreeProfile(root, args);
  assert.equal(first.files[0].exists, true); assert.equal(first.files[1].exists, false);
  assert.equal(first.absent.length, 2);
  for (const flag of ['--pnpmfile=x', '--config.pnpmfile=x', '--config.global-pnpmfile=x', '--no-ignore-pnpmfile',
    '--config.ignorePnpmfile=true', '--config.configDependencies=x', '--workspace-dir=x', '--lockfile-dir=x', '-g', '-C', '-r', '-F', '--filter=x', '--workspace-root', '--pnpmfil=x', '--global-pnpmfil=x', '--ignore-workspace', '--dir='+root])
    await assert.rejects(receiveHookFreeProfile(root, [...args, flag]), /composable|context grammar|duplicate/);
  for (const key of ['NPM_CONFIG_PNPMFILE', 'pnpm_config_global_pnpmfile', 'PNPM_CONFIG_WORKSPACE_DIR',
    'npm_config_config_dependencies', 'NPM_CONFIG_CONFIG_DEPENDENCIES', 'pnpm_config_configDependencies', 'NPM_CONFIG_PREFIX', 'NPM_CONFIG_NO_IGNORE_PNPMFILE']) {
    const old = process.env[key]; process.env[key] = 'fixture-value';
    try { await assert.rejects(receiveHookFreeProfile(root, args), /ambient native/); }
    finally { if (old === undefined) delete process.env[key]; else process.env[key] = old; }
  }
  await writeFile(join(root, 'package.json'), '{}');
  await writeFile(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n');
  const canary = join(root, 'provider-canary.mjs'), marker = join(root, 'provider-executed');
  await writeFile(canary, `import {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'executed');`);
  const service = createNativeInstallationService({qualificationRoot: root});
  for (const destination of [join(root, 'pnpm-workspace.yaml'), join(root, 'config', 'pnpm', 'config.yaml')]) {
    for (const key of ['configDependencies', 'config_dependencies', 'config-dependencies', 'CONFIG_DEPENDENCIES']) {
      await writeFile(destination, key + ':\n  plugin: 1.0.0\n');
      await assert.rejects(receiveHookFreeProfile(root, args), /composable/);
      await assert.rejects(service.prepare({program: process.execPath, arguments: [canary],
        commandArguments: [canary, '--dir', root, 'install', '--frozen-lockfile'], cwd: root,
        request: {observation: {}}}), /composable/);
      await assert.rejects(readFile(marker), {code: 'ENOENT'});
    }
    await writeFile(destination, '# restored fixture config\n');
  }
  await writeFile(join(root, 'config', 'pnpm', 'config.yaml'), '# empty fixture globals\n');
  const standalone = join(root, 'standalone'); await mkdir(standalone);
  await assert.rejects(receiveHookFreeProfile(standalone, ['/native-entry', '--dir', standalone, 'install']), /ancestor workspace/);
  await writeFile(join(root, '.pnpmfile.mjs'), 'export const hooks = {};');
  await assert.rejects(receiveHookFreeProfile(root, args), /already present/);
});

test('composition input cannot nominate arbitrary execution or accessor suppliers', async () => {
  for (const value of [null, [], {executor() {}}, {qualificationRoot: 'relative'}]) assert.throws(() => createNativeInstallationService(value), /record|field|root/);
  let accessed = false; const options = {};
  Object.defineProperty(options, 'archiveReader', {get() {accessed = true; throw Error('getter');}});
  assert.throws(() => createNativeInstallationService(options), /field/); assert.equal(accessed, false);
  const service = createNativeInstallationService();
  await assert.rejects(service.prepare({program: process.execPath, arguments: ['unused'], commandArguments: ['unused'], cwd: '/unused', request: {}}), /capability/);
  await assert.rejects(service.revalidate({}), /foreign/);
  await assert.rejects(service.receive({}, {}), /foreign/);
});

async function runtimeFixture(t, suffix) {
  const root = await mkdtemp(join(tmpdir(), 'native-reuse-runtime-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const bytes = Buffer.from('runtime byte custody only; native archive parsing is qualified separately');
  const entry = {name: '@fixture/provider', version: '1.0.0', tarball: 'https://registry.example/provider.tgz',
    snapshotPath: join(root, 'snapshot with spaces.tgz'), integrity: sri(bytes), sha256: sha(bytes), bytes: bytes.length};
  await writeFile(entry.snapshotPath, bytes); const eventsPath = join(root, 'events.ndjson'); await writeFile(eventsPath, '');
  const raw = JSON.stringify({kind: 'pnpm.received-archive.config.v1', entry: await realpath(process.argv[1]), entries: [entry], eventsPath});
  const config = join(root, 'config.json'); await writeFile(config, raw);
  const [fetcher] = await createReceivedArchiveFetchers(config, sha(raw));
  return {root, bytes, entry, eventsPath, fetcher, resolution: {integrity: entry.integrity, tarball: entry.tarball}};
}

test('native extension delegates original CAFS/options and raw file path without inventing an index identity', async t => {
  const f = await runtimeFixture(t); const id = f.entry.name + '@' + f.entry.version;
  assert.equal(f.fetcher.canFetch('unselected@1.0.0', {tarball: 'https://other.example/'}), false);
  assert.equal(f.fetcher.canFetch(id, f.resolution), true);
  const cafs = {}, options = {pkgResolutionId: id, filesIndexFile: 'original-native-index', lockfileDir: f.root}, returned = {filesIndex: new Map(), local: true};
  let called = 0;
  assert.equal(await f.fetcher.fetch(cafs, f.resolution, options, {localTarball: async (receivedCafs, resolution, receivedOptions) => {
    called++; assert.equal(receivedCafs, cafs); assert.equal(receivedOptions, options);
    assert.equal(resolution.tarball, 'file:' + f.entry.snapshotPath);
    assert.equal(resolution.integrity, f.entry.integrity); return returned;
  }}), returned);
  assert.equal(called, 1);
  const events = (await readFile(f.eventsPath, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(events.map(x => x.event), ['ready', 'selected', 'delegated', 'native-returned']);
  assert.doesNotMatch(JSON.stringify(events), /https:|snapshot|original-native-index/);
});

test('selected wrong SRI or URL refuses instead of unselected network fallback', async t => {
  for (const changed of [{integrity: sri(Buffer.from('different'))}, {tarball: 'https://registry.example/different.tgz'}]) {
    const f = await runtimeFixture(t);
    assert.throws(() => f.fetcher.canFetch(f.entry.name + '@' + f.entry.version, {...f.resolution, ...changed}), /reuse refused/);
  }
});

test('snapshot tampering refuses before supplied native fetcher', async t => {
  const f = await runtimeFixture(t), id = f.entry.name + '@' + f.entry.version;
  assert.equal(f.fetcher.canFetch(id, f.resolution), true);
  await writeFile(f.entry.snapshotPath, Buffer.from('changed'));
  let called = false;
  await assert.rejects(f.fetcher.fetch({}, f.resolution, {pkgResolutionId: id}, {localTarball: async () => {called = true;}}), /reuse refused/);
  assert.equal(called, false);
});


test('inherited worker context skips before config or provider inspection', {timeout: 5000}, async () => {
  const moduleURL = new URL('../src/native-archive-fetcher.mjs', import.meta.url).href;
  const source = `import {parentPort} from 'node:worker_threads'; import {createReceivedArchiveFetchers} from ${JSON.stringify(moduleURL)}; parentPort.postMessage(await createReceivedArchiveFetchers('/nonexistent-must-not-be-read', 'not-a-config-hash'));`;
  const worker = new Worker(new URL('data:text/javascript,' + encodeURIComponent(source)), {type: 'module'});
  const received = await new Promise((resolve, reject) => { let message; worker.on('message', value => {message = value;}); worker.once('error', reject); worker.once('exit', code => {if (code === 0) resolve(message); else reject(Error('worker exit'));}); });
  assert.deepEqual(received, []);
});


test('selection without delegation is unconsumed evidence, not archive or store success', () => {
  const entries = [{name: '@fixture/provider', version: '1.0.0'}];
  const stream = names => names.map((event, i) => JSON.stringify({v: 1, seq: i + 1, event,
    ...(['selected', 'delegated', 'native-returned'].includes(event) ? entries[0] : {})})).join('\n') + '\n';
  const unconsumed = receiveArchiveReuseEvents(stream(['ready', 'selected', 'final']), entries);
  assert.equal(unconsumed.accepted, true);
  assert.equal(unconsumed.entries[0].state, 'selected-not-delegated');
  assert.equal(unconsumed.persistence, 'not-established-by-hook-return');
  assert.equal(receiveArchiveReuseEvents(stream(['ready', 'selected', 'delegated', 'final']), entries).accepted, false);
  assert.equal(receiveArchiveReuseEvents(stream(['ready', 'selected']), entries).accepted, false);
  assert.equal(receiveArchiveReuseEvents(stream(['ready', 'selected', 'delegated', 'selected', 'final']), entries).accepted, false);
  const repeated = receiveArchiveReuseEvents(stream(['ready', 'selected', 'delegated', 'native-returned', 'selected', 'final']), entries);
  assert.equal(repeated.entries[0].state, 'native-returned'); assert.equal(repeated.entries[0].completedDelegations, 1);
});


test('base version probe cannot escape the admitted canonical command prefix', async t => {
  const root = await mkdtemp(join(tmpdir(), 'native-base-context-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  for (const [name, bytes] of Object.entries({'package.json': '{}', 'pnpm-lock.yaml': 'lockfileVersion: 9', 'pnpm-workspace.yaml': 'packages: []'})) await writeFile(join(root, name), bytes);
  const service = createNativeInstallationService();
  for (const args of [['/entry', '--pnpmfile=uninspected'], ['/entry', '--dir', '/elsewhere'], ['/entry', 'install']]) {
    await assert.rejects(service.prepare({program: process.execPath, arguments: args,
      commandArguments: ['/entry', '--dir', root, 'install'], cwd: root, request: {observation: {}}}), /admitted command prefix/);
  }
});
