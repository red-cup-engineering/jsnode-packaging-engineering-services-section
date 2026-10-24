import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createNativeObservationService } from '@red-cup-engineering/pnpm-engineering-services-section/native-observation';
const execute = promisify(execFile);
const target = { name: '@fixture/provider', version: '1.0.0', registry: 'https://registry.example/', tarball: 'https://registry.example/provider.tgz' };
const request = () => ({ receiptDirectory: '/unselected-observation-owner', targets: [{ ...target }] });
const prepare = value => createNativeObservationService().prepare({ program: process.execPath, arguments: ['/unselected-pnpm-entry'], cwd: '/unselected-cwd', request: value });

test('public service is typed; sessions cannot be fabricated or deserialized', async () => {
  const service = createNativeObservationService();
  assert.equal(service.kind, 'pnpm.native-installation-observation.service.v1');
  assert.equal(Object.isFrozen(service), true);
  await assert.rejects(service.receive({ kind: 'pnpm.native-observation.session.v1' }, {}), /not issued/);
  await assert.rejects(service.revalidate({}), /not issued/);
});

test('invalid own-data observation inputs refuse before provider or filesystem effects', async () => {
  for (const bad of [null, [], 'input', { ...request(), unknown: true }, Object.create({ ...request() })])
    await assert.rejects(prepare(bad), TypeError);
  for (const key of ['maximumEvents', 'maximumBytes']) for (const value of [null, undefined, 0, -1, NaN, Infinity, -Infinity, 1.5, '4096', 8388609])
    await assert.rejects(prepare({ ...request(), [key]: value }), TypeError);
  await assert.rejects(prepare({ ...request(), maximumEvents: 16385 }), TypeError);
  await assert.rejects(prepare({ ...request(), maximumBytes: 4095 }), TypeError);
});

test('accessors, symbol keys and sparse target arrays are never evaluated', async () => {
  let called = false;
  const input = request(); Object.defineProperty(input, 'maximumEvents', { get() { called = true; throw Error('getter ran'); } });
  await assert.rejects(prepare(input), /unsupported observation field/);
  const nested = request(); Object.defineProperty(nested.targets[0], 'tarball', { get() { called = true; throw Error('getter ran'); } });
  await assert.rejects(prepare(nested), /unsupported observation field/);
  const array = request(); Object.defineProperty(array.targets, '0', { get() { called = true; throw Error('getter ran'); } });
  await assert.rejects(prepare(array), /own-data array/);
  await assert.rejects(prepare({ ...request(), [Symbol('unknown')]: true }), TypeError);
  await assert.rejects(prepare({ ...request(), targets: new Array(1) }), /own-data array/);
  assert.equal(called, false);
});

test('metadata observation selection does not authorize foreign, credentialed or ambiguous endpoints', async () => {
  for (const tarball of ['http://registry.example/provider.tgz', 'https://other.example/provider.tgz', 'https://user:secret@registry.example/provider.tgz', target.tarball + '?token=secret', target.tarball + '#secret'])
    await assert.rejects(prepare({ ...request(), targets: [{ ...target, tarball }] }), TypeError);
  for (const version of ['01.0.0', '1.0.0-01', '1.0.0-a..b', 'latest', '1.0'])
    await assert.rejects(prepare({ ...request(), targets: [{ ...target, version }] }), TypeError);
  await assert.rejects(prepare({ ...request(), targets: [target, target] }), /duplicate/);
});

async function preload(t, source, budgets = {}) {
  const root = await mkdtemp(join(tmpdir(), 'pnpm-observation-unit-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const eventsPath = join(root, 'events.ndjson'), configPath = join(root, 'config.json');
  const program = join(root, 'fixture.mjs'); await writeFile(program, source);
  await writeFile(eventsPath, '', { flag: 'wx', mode: 0o600 });
  await writeFile(configPath, JSON.stringify({ kind: 'pnpm.native-observation.config.v1', targets: [target], eventsPath, parentPid: process.pid, entry: program,
    maximumEvents: 50, maximumBytes: 16384, ...budgets }), { mode: 0o600 });
  const entry = fileURLToPath(new URL('../src/native-observation-preload.mjs', import.meta.url));
  const result = await execute(process.execPath, ['--import', entry, program], {
    timeout: 5000, killSignal: 'SIGKILL', maxBuffer: 65536,
    env: { ...process.env, PNPM_NATIVE_OBSERVATION_CONFIG: configPath }
  });
  return { result, text: await readFile(eventsPath, 'utf8'), root };
}

test('native diagnostics projection excludes raw URLs, credentials, headers, bodies and messages', async t => {
  const { result, text } = await preload(t, `import {channel} from 'node:diagnostics_channel';
    const request={origin:'https://registry.example',path:'/provider.tgz',headers:'Authorization: secret-canary'};
    channel('undici:request:create').publish({request});
    channel('undici:request:headers').publish({request,response:{statusCode:200,headers:['cookie','secret-canary']}});
    channel('undici:request:error').publish({request,error:{code:'ECONNRESET',message:'secret-canary'}});
    channel('undici:request:trailers').publish({request,trailers:'secret-canary'});
    console.log('native-unchanged');`);
  assert.equal(result.stdout.trim(), 'native-unchanged');
  assert.equal(result.stderr, '');
  assert.doesNotMatch(text, /secret-canary|https:|provider\.tgz|Authorization|cookie/);
  const events = text.trim().split('\n').map(JSON.parse);
  assert.deepEqual(events.map(x => x.event), ['ready', 'request-created', 'response-headers', 'request-error', 'response-complete', 'final']);
  assert.equal(events[3].code, 'ECONNRESET');
});

test('inherited worker preload exits before config validation or session I/O', async t => {
  const { text } = await preload(t, `import {Worker} from 'node:worker_threads';
    const worker=new Worker('process.exit(0)',{eval:true,env:{...process.env,PNPM_NATIVE_OBSERVATION_CONFIG:'/unreadable-worker-config'}});
    await new Promise((resolve,reject)=>{worker.on('exit',code=>code===0?resolve():reject(Error('worker failed')));worker.on('error',reject)});`);
  const events = text.trim().split('\n').map(JSON.parse);
  assert.deepEqual(events.map(x => x.event), ['ready', 'final']);
});

test('finite limits preserve loss rather than invent complete observation', async t => {
  const { text } = await preload(t, `import {channel} from 'node:diagnostics_channel';
    for(let i=0;i<100;i++) channel('undici:request:create').publish({request:{origin:'https://registry.example',path:'/provider.tgz'}});`, { maximumEvents: 2, maximumBytes: 4096 });
  const events = text.trim().split('\n').map(JSON.parse);
  assert.ok(Buffer.byteLength(text) <= 4096);
  assert.equal(events.at(-1).event, 'final');
  assert.equal(events.at(-1).lost, true);
});

test('subscriber failure is contained and does not change native exit', async t => {
  const { result, text } = await preload(t, `import {channel} from 'node:diagnostics_channel';
    const request={get origin(){throw Error('secret-canary')}};
    channel('undici:request:create').publish({request});console.log('continued');`);
  assert.equal(result.stdout.trim(), 'continued');
  assert.doesNotMatch(text, /secret-canary/);
  assert.equal(text.includes('"event":"final"'), false, 'missing final marker is partial, not completion');
});

test('unqualified native distribution is refused before even its version program executes', async t => {
  const root = await mkdtemp(join(tmpdir(), 'pnpm-observer-provider-refusal-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const packageRoot = join(root, 'fake'), entry = join(packageRoot, 'bin', 'pnpm.mjs'), marker = join(root, 'executed');
  await mkdir(join(packageRoot, 'bin'), { recursive: true }); await mkdir(join(packageRoot, 'dist')); await mkdir(join(root, 'receipts'));
  await writeFile(join(packageRoot, 'package.json'), JSON.stringify({ name: 'pnpm', version: '11.28.5', bin: { pnpm: 'bin/pnpm.mjs' } }));
  await writeFile(entry, `import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(marker)},'executed');console.log('11.28.5');`);
  await writeFile(join(packageRoot, 'dist', 'pnpm.mjs'), 'not the qualified original distribution');
  await assert.rejects(createNativeObservationService().prepare({ program: process.execPath, arguments: [entry], cwd: root,
    request: { ...request(), receiptDirectory: join(root, 'receipts') } }), /unqualified PNPM observation distribution/);
  await assert.rejects(readFile(marker), { code: 'ENOENT' });
});

test('inherited fork preload cannot append to its parent observation session', async t => {
  const { text } = await preload(t, `import {fork} from 'node:child_process';
    if (!process.env.OBSERVER_UNIT_FORK) {
      const child=fork(process.argv[1],[],{env:{...process.env,OBSERVER_UNIT_FORK:'1'},stdio:'ignore'});
      await new Promise((resolve,reject)=>{child.on('exit',code=>code===0?resolve():reject(Error('fork failed')));child.on('error',reject)});
    }`);
  assert.deepEqual(text.trim().split('\n').map(JSON.parse).map(x=>x.event), ['ready','final']);
});

test('normalized endpoint collisions refuse before provider observation', async () => {
  const other = { ...target, name: '@fixture/other', tarball: 'https://registry.example/%70rovider.tgz' };
  await assert.rejects(prepare({ ...request(), targets: [target, other] }), /conflicting normalized/);
  await assert.rejects(prepare({ ...request(), targets: [{ ...target, tarball: 'https://registry.example/@fixture/provider' }] }), /conflicting normalized/);
  await assert.rejects(prepare({ ...request(), targets: [{ ...target, tarball: 'https://registry.example/@fixture/provider/1.0.0' }] }), /conflicting normalized/);
  const second = { ...target, version: '2.0.0', tarball: 'https://registry.example/provider2.tgz' };
  await assert.rejects(prepare({ ...request(), targets: [target, second] }), error => error.code === 'ENOENT',
    'compatible shared unversioned metadata passes pure validation and reaches the deliberately absent owner directory');
});


test('selected attestation diagnostics retain identity and status without broadening endpoint coverage', async t => {
  const { text } = await preload(t, `import {channel} from 'node:diagnostics_channel';
    const request={origin:'https://registry.example',path:'/-/npm/v1/attestations/@fixture/provider@1.0.0'};
    channel('undici:request:create').publish({request});
    channel('undici:request:headers').publish({request,response:{statusCode:404,headers:['secret-canary']}});
    channel('undici:request:trailers').publish({request,trailers:'secret-canary'});
    for (const request of [
      {origin:'https://registry.example',path:'/-/npm/v1/attestations/@fixture/provider@2.0.0'},
      {origin:'https://other.example',path:'/-/npm/v1/attestations/@fixture/provider@1.0.0'},
      {origin:'https://registry.example',path:'/-/npm/v1/attestations/@fixture/provider@1.0.0?token=secret-canary'}
    ]) channel('undici:request:create').publish({request});`);
  const events = text.trim().split('\n').map(JSON.parse);
  assert.deepEqual(events.map(event => event.event), ['ready', 'request-created', 'response-headers', 'response-complete', 'final']);
  assert.equal(events[1].endpoint, 'attestation'); assert.equal(events[1].version, target.version);
  assert.equal(events[2].status, 404); assert.equal(events.at(-1).unclassified, 3);
  assert.doesNotMatch(text, /https:|attestations\/|secret-canary|token=/);
});

test('attestation identity collisions refuse before effects', async () => {
  const tarball = 'https://registry.example/-/npm/v1/attestations/@fixture/provider@1.0.0';
  await assert.rejects(prepare({ ...request(), targets: [{ ...target, tarball }] }), /conflicting normalized/);
  await assert.rejects(prepare({ ...request(), targets: [{ ...target, tarball: tarball.replace('attestations', '%61ttestations') }] }), /conflicting normalized/);
});
