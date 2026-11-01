import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync, writeFileSync, rmSync, symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {receiveNativeModuleRevision, nativeModuleRevisionHooks} from '../src/native-module-revision.mjs';
const hash = text => createHash('sha256').update(text).digest('hex');
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'code-native-revision-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const target = join(root, 'original.mjs'), replacement = join(root, 'replacement.mjs');
  writeFileSync(target, 'export const value = 1;');
  writeFileSync(replacement, 'export const value = 2;');
  return {kind:'code.native-module-source-revision/v5',runtimeRoot:root,
    source:{repository:'example/original',commit:'a'.repeat(40)},files:[{target,replacement,
      sourcePath:'src/original.mjs',before:hash('export const value = 1;'),after:hash('export const value = 2;')}]};
}
test('changes only the exact selected module and delegates other native loads', t => {
  const r = fixture(t), hooks = nativeModuleRevisionHooks(receiveNativeModuleRevision(r,{immutable:false}));
  const context = {format:'module'}, url = pathToFileURL(r.files[0].target).href;
  assert.equal(hooks.load(url,context,()=>assert.fail()).source,'export const value = 2;');
  for (const other of [url+'?query=1',url+'#fragment',pathToFileURL(r.files[0].replacement).href]) {
    assert.equal(hooks.load(other,context,(got,c)=>{assert.equal(got,other);assert.equal(c,context);return 'native';}),'native');
  }
});
test('wrong original, replacement, repeated and escaped source mappings refuse', t => {
  const r = fixture(t), receive = x => receiveNativeModuleRevision(x,{immutable:false});
  assert.throws(()=>receive({...r,files:[{...r.files[0],before:'0'.repeat(64)}]}),/incumbent/);
  assert.throws(()=>receive({...r,files:[{...r.files[0],after:'0'.repeat(64)}]}),/upstream/);
  assert.throws(()=>receive({...r,files:[...r.files,...r.files]}),/competing/);
  assert.throws(()=>receive({...r,runtimeRoot:tmpdir()+'/other'}));
  assert.throws(()=>receive({...r,files:[{...r.files[0],sourcePath:'../outside.mjs'}]}),/upstream/);
  assert.throws(()=>receiveNativeModuleRevision(r),/immutable/);
});
test('redirected inputs and post-receiving drift refuse rather than fall back', t => {
  const r = fixture(t), alias = join(r.runtimeRoot,'alias.mjs');
  symlinkSync(r.files[0].replacement,alias);
  assert.throws(()=>receiveNativeModuleRevision({...r,files:[{...r.files[0],replacement:alias}]},{immutable:false}),/redirected/);
  const hooks = nativeModuleRevisionHooks(receiveNativeModuleRevision(r,{immutable:false}));
  writeFileSync(r.files[0].replacement,'export const value = 3;');
  assert.throws(()=>hooks.load(pathToFileURL(r.files[0].target).href,{},()=>assert.fail()),/changed before/);
});

test('v5 preserves bounded exact small-module cohorts and refuses prior formats', t => {
  const r=fixture(t), original=r.files[0], files=[];
  for(let i=0;i<64;i++){const target=join(r.runtimeRoot,'original-'+i+'.mjs');writeFileSync(target,'export const value = 1;');files.push({...original,target});}
  for(const kind of ['code.native-module-source-revision/v1','code.native-module-source-revision/v2','code.native-module-source-revision/v3','code.native-module-source-revision/v4'])assert.throws(()=>receiveNativeModuleRevision({...r,kind},{immutable:false}),/revision v5/);
  const v4={...r,files};assert.equal(receiveNativeModuleRevision(v4,{immutable:false}).mappings.size,64);
  assert.throws(()=>receiveNativeModuleRevision({...v4,files:[...files,files[0]]},{immutable:false}),/bounded source revision/);
  // One bounded physical fixture exercises aggregate read/decode demand without
  // retaining a separate large file for each physical dependency context.
  const body=' '.repeat(1048576);writeFileSync(original.replacement,body);
  assert.throws(()=>receiveNativeModuleRevision({...v4,files:files.map(file=>({...file,after:hash(body)}))},{immutable:false}),/aggregate native source/);
});
