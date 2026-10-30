import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync, writeFileSync, rmSync, symlinkSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {receiveNativeModuleRevision, nativeModuleRevisionHooks} from '../src/native-module-revision.mjs';
const hash = text => createHash('sha256').update(text).digest('hex');

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'code-native-addition-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const write = (name, bytes) => { const path = join(root, name); writeFileSync(path, bytes); return path; };
  const source = {repository: 'fixture/native-module', commit: 'a'.repeat(40)};
  const before = "export const result='old';";
  const after = "import {answer} from './helper.mjs';import {native} from './native.mjs';export const result=answer+native;";
  const helper = 'export const answer=40;';
  const target = write('entry.mjs', before);
  const addition = {target: join(root, 'helper.mjs'), sourcePath: 'src/helper.mjs', source,
    before: {kind: 'absent'}, replacement: write('helper-source.mjs', helper), after: hash(helper)};
  write('native.mjs', 'export const native=2;');
  const revision = {kind: 'code.native-module-source-revision/v5', runtimeRoot: root, source,
    files: [{target, replacement: write('entry-source.mjs', after), sourcePath: 'src/entry.mjs',
      before: hash(before), after: hash(after)}, addition], bindings: []};
  const receive = input => receiveNativeModuleRevision(input ?? revision, {immutable: false});
  const record = write('revision.json', JSON.stringify(revision));
  const operation = new URL('../src/native-module-revision.mjs', import.meta.url).href;
  const bootstrap = write('bootstrap.mjs', `import fs from 'node:fs';import {registerHooks} from 'node:module';
import {receiveNativeModuleRevision,nativeModuleRevisionHooks} from ${JSON.stringify(operation)};
registerHooks(nativeModuleRevisionHooks(receiveNativeModuleRevision(JSON.parse(fs.readFileSync(${JSON.stringify(record)})),{immutable:false})));`);
  const run = () => execFileSync(process.execPath, ['--import', bootstrap, '--input-type=module', '-e',
    `import {result} from ${JSON.stringify(pathToFileURL(target).href)};console.log(result);`],
  {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
  return {root, write, revision, addition, receive, run};
}

test('actual native ESM resolves an absent relative helper only through explicit source closure', t => {
  const f = fixture(t);
  assert.equal(f.run().trim(), '42');
  assert.throws(() => readFileSync(f.addition.target), {code: 'ENOENT'});
  const hooks = nativeModuleRevisionHooks(f.receive());
  let delegated = false;
  hooks.resolve('./helper.mjs', {parentURL: pathToFileURL(join(f.root, 'unselected.mjs')).href}, () => {
    delegated = true; return {url: 'file:///original-resolution'};
  });
  assert.equal(delegated, true, 'unselected importers retain original resolution');
});

test('false absence, duplicate mappings, missing Git evidence and redirected parent refuse', t => {
  const f = fixture(t), change = replacement => ({...f.revision, files: [f.revision.files[0], {...f.addition, ...replacement}]});
  assert.throws(() => f.receive(change({source: undefined})), /exact upstream Git source/);
  assert.throws(() => f.receive(change({source: {...f.addition.source, commit: 'branch-name'}})), /exact upstream Git source/);
  assert.throws(() => f.receive(change({before: {kind: 'absent', ignored: true}})), /module identities/);
  assert.throws(() => f.receive({...f.revision, files: [...f.revision.files, f.addition]}), /competing/);
  assert.throws(() => f.receive(change({target: join(f.root, '../escape.mjs')})), /confined/);
  const parent = join(f.root, 'redirected'); symlinkSync(f.root, parent, 'dir');
  assert.throws(() => f.receive(change({target: join(parent, 'helper.mjs')})), /canonical directory/);
  symlinkSync(join(f.root, 'missing.mjs'), f.addition.target);
  assert.throws(() => f.receive(), /already exists/);
  rmSync(f.addition.target); f.write('helper.mjs', 'existing source');
  assert.throws(() => f.receive(), /already exists/);
});

test('new helper source hash and post-receiving drift refuse', t => {
  const f = fixture(t);
  assert.throws(() => f.receive({...f.revision, files: [f.revision.files[0], {...f.addition, after: '0'.repeat(64)}]}), /upstream source differs/);
  const hooks = nativeModuleRevisionHooks(f.receive());
  const url = pathToFileURL(f.addition.target).href;
  f.write('helper-source.mjs', 'export const answer=99;');
  assert.throws(() => hooks.load(url, {}, () => assert.fail()), /upstream source changed/);
  f.write('helper.mjs', 'export const answer=0;');
  assert.throws(() => hooks.load(url, {}, () => assert.fail()), /already exists/);
  assert.throws(() => hooks.resolve('./helper.mjs', {parentURL: pathToFileURL(f.revision.files[0].target).href}, () => assert.fail()), /already exists/);
});

test('unmapped missing and runtime-escaping relative imports refuse at the native resolver', t => {
  const f = fixture(t);
  f.write('entry-source.mjs', "import './unmapped.mjs';export const result=0;");
  f.revision.files[0].after = hash(readFileSync(f.revision.files[0].replacement));
  f.write('revision.json', JSON.stringify(f.revision));
  assert.throws(f.run, error => error.stderr?.includes('ERR_MODULE_NOT_FOUND'));
  f.write('entry-source.mjs', "import '../escape.mjs';export const result=0;");
  f.revision.files[0].after = hash(readFileSync(f.revision.files[0].replacement));
  f.write('revision.json', JSON.stringify(f.revision));
  assert.throws(f.run, error => error.stderr?.includes('escapes original runtime'));
});
