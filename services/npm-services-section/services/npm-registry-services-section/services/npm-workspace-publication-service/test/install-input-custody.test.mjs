import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const execute = promisify(execFile);
const publisher = new URL('../scripts/publish-package.mjs', import.meta.url).href;

// A controlled command adversary tests admission of process outcomes, not PNPM
// eligibility or registry receiving. The native PNPM counterexample is separate.
async function attempt(t, { caller, initial = {}, change = {}, status = 0, failFirst = false }) {
  const root = await mkdtemp(join(tmpdir(), 'install-input-custody-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = join(root, 'package'), bin = join(root, 'bin');
  await mkdir(directory); await mkdir(bin);
  const manifest = { name: 'custody-fixture', version: '1.0.0', packageManager: 'pnpm@11.25.0',
    scripts: { test: 'node --test test.mjs' } };
  await writeFile(join(directory, 'package.json'), JSON.stringify(manifest));
  await writeFile(join(directory, 'test.mjs'), "import test from 'node:test'; import {writeFileSync} from 'node:fs'; test('received',()=>writeFileSync('tests-ran','yes'));\n");
  for (const [path, bytes] of Object.entries(initial)) await writeFile(join(directory, path), bytes);
  const executable = join(bin, 'pnpm');
  await writeFile(executable, `#!${process.execPath}
import {readFileSync,writeFileSync,unlinkSync,mkdirSync} from 'node:fs';
let count=0;try{count=Number(readFileSync('attempts','utf8'));}catch{}
writeFileSync('attempts',String(++count));
for(const [path,bytes] of Object.entries(${JSON.stringify(change)})){
 if(bytes===null)unlinkSync(path);else if(bytes==='DIRECTORY'){try{unlinkSync(path)}catch{}mkdirSync(path);}else writeFileSync(path,bytes);
}
process.exit(${failFirst ? '(count===1?1:0)' : status});
`);
  await chmod(executable, 0o755);
  const program = `import {refreshConsumerInstall,qualifyPackageSourceBuild} from ${JSON.stringify(publisher)};
const input=${JSON.stringify({ packageDir: directory, manifest, registry: 'https://registry.example.invalid/', scratchRoot: join(root, 'cache') })};
try {const result=await ${caller === 'refresh' ? 'refreshConsumerInstall' : 'qualifyPackageSourceBuild'}(input);console.log(JSON.stringify({ok:true,result}));}
catch(error){console.log(JSON.stringify({ok:false,code:error.code,evidence:error.evidence,step:error.step,message:error.message}));}`;
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}` };
  delete env.NODE_TEST_CONTEXT; delete env.NODE_TEST_WORKER_ID;
  const result = await execute(process.execPath, ['--input-type=module', '-e', program], { env, timeout: 20000 });
  return { report: JSON.parse(result.stdout), directory, attempts: Number(await readFile(join(directory, 'attempts'), 'utf8')) };
}

for (const caller of ['refresh', 'qualify']) {
  for (const status of [0, 1]) {
    for (const initial of [{}, { 'pnpm-workspace.yaml': 'minimumReleaseAge: 1440\n' }]) {
      test(`${caller}: policy creation or mutation after exit ${status} refuses before retry or tests (${Object.keys(initial).length})`, async t => {
        const result = await attempt(t, { caller, initial, status,
          change: { 'pnpm-workspace.yaml': "minimumReleaseAgeExclude:\n  - 'fresh@1.0.0'\n" } });
        assert.equal(result.report.ok, false);
        assert.equal(result.report.code, 'INSTALL_INPUT_CUSTODY_CHANGED');
        assert.deepEqual(result.report.evidence.paths, ['pnpm-workspace.yaml']);
        assert.equal(result.attempts, 1);
        await assert.rejects(readFile(join(result.directory, 'tests-ran')), { code: 'ENOENT' });
      });
    }
    test(`${caller}: manifest drift after exit ${status} is permanent`, async t => {
      const result = await attempt(t, { caller, status, change: { 'package.json': '{}' } });
      assert.equal(result.report.code, 'INSTALL_INPUT_CUSTODY_CHANGED');
      assert.equal(result.attempts, 1);
    });
  }
}

for (const bytes of ['changed lock\n', null]) {
  test(`verify refuses ${bytes === null ? 'deleted' : 'changed'} selected lock`, async t => {
    const result = await attempt(t, { caller: 'qualify', initial: { 'pnpm-lock.yaml': 'original lock\n' }, change: { 'pnpm-lock.yaml': bytes } });
    assert.equal(result.report.code, 'INSTALL_INPUT_CUSTODY_CHANGED');
    assert.deepEqual(result.report.evidence.paths, ['pnpm-lock.yaml']);
    await assert.rejects(readFile(join(result.directory, 'tests-ran')), { code: 'ENOENT' });
  });
}

test('update-lock permits native lock regeneration but no protected input change', async t => {
  const result = await attempt(t, { caller: 'refresh', initial: { 'pnpm-lock.yaml': 'old lock\n' }, change: { 'pnpm-lock.yaml': 'new lock\n' } });
  assert.equal(result.report.ok, true); assert.equal(result.attempts, 1);
  assert.equal(await readFile(join(result.directory, 'pnpm-lock.yaml'), 'utf8'), 'new lock\n');
});

test('unchanged failed registry attempt retains existing cache fallback', async t => {
  const result = await attempt(t, { caller: 'refresh', failFirst: true });
  assert.equal(result.report.ok, true); assert.equal(result.attempts, 2);
  assert.equal(result.report.result.installMode, 'offline-cache-fallback');
});

test('unchanged verify lock admits the actual declared native test', async t => {
  const result = await attempt(t, { caller: 'qualify', initial: { 'pnpm-lock.yaml': 'held lock\n' } });
  assert.equal(result.report.ok, true, JSON.stringify(result.report));
  assert.equal(result.report.result.freshInstallTestCount.pass, 1);
  assert.equal(await readFile(join(result.directory, 'pnpm-lock.yaml'), 'utf8'), 'held lock\n');
});

for (const caller of ['refresh', 'qualify']) for (const status of [0, 1]) {
  test(`${caller}: unreadable post-command policy after exit ${status} cannot retry`, async t => {
    const result = await attempt(t, { caller, status, change: { 'pnpm-workspace.yaml': 'DIRECTORY' } });
    assert.equal(result.report.code, 'INSTALL_INPUT_CUSTODY_CHANGED');
    assert.deepEqual(result.report.evidence.unread, [{path: 'pnpm-workspace.yaml', code: 'EISDIR'}]);
    assert.equal(result.report.evidence.nativeOutcome.status, status);
    assert.equal(result.attempts, 1);
  });
}
