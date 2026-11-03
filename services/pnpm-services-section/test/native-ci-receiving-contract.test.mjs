import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {receiveCITransport,receiveRequiredTests,receiveProcess,receiveSuite,receiveArchive} from '../scripts/native-ci-receiving-contract.mjs';
const tap='ok 1 - required\nok 2 - private consumer # SKIP\n# tests 2\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 1\n';
test('missing enrolled test refuses before execution',t=>{
 const root=mkdtempSync(join(tmpdir(),'ci-test-contract-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 assert.throws(()=>receiveRequiredTests(root,['test/absent.test.mjs']),/ENOENT/);
 assert.throws(()=>receiveRequiredTests(root,['../escape.test.mjs']));
 mkdirSync(join(root,'test'));writeFileSync(join(root,'test/present.test.mjs'),'');
 assert.deepEqual(receiveRequiredTests(root,['test/present.test.mjs']),['test/present.test.mjs']);
});
test('failed started, signalled and nonzero commands cannot yield receiving',()=>{
 assert.equal(receiveProcess({stdout:'received',status:0,signal:null}),'received');
 for(const row of [{status:1,signal:null},{status:null,signal:'SIGTERM'},{status:0,signal:null,error:new Error('bounded output overflow')}])
  assert.throws(()=>receiveProcess({...row,stdout:tap}));
});
test('unexplained skips, empty and incomplete TAP refuse',()=>{
 assert.equal(receiveSuite(tap,['private consumer']).passed,1);
 for(const text of [tap.replace('private consumer','missing supplier'),tap.replace('# fail 0','# fail 1'),tap.replace('# cancelled 0','# cancelled 1'),tap.replace('# pass 1','# pass 0'),''])
  assert.throws(()=>receiveSuite(text,['private consumer']));
 assert.throws(()=>receiveSuite(tap,[]));
});
test('missing archived tests or exports and bundled test tools refuse',()=>{
 const manifest={receivingTests:['test/required.test.mjs'],exports:{'.':'./src/index.mjs'}};
 const complete=['package/test/required.test.mjs','package/src/index.mjs'];
 assert.deepEqual(receiveArchive(complete,manifest),complete);
 for(const members of [complete.slice(0,1),complete.slice(1),[...complete,'package/node_modules/pnpm/bin/pnpm.mjs']])
  assert.throws(()=>receiveArchive(members,manifest));
});
test('original transport admission preserves noncredential relays and typed control; secrets never echo',async()=>{
 const input={PATH:'/usr/bin',HTTPS_PROXY:'http://relay.example:8080',NO_PROXY:'localhost',NODE_USE_ENV_PROXY:'1'};
 assert.equal((await receiveCITransport(input,'/tmp')).values.HTTPS_PROXY,input.HTTPS_PROXY);
 for(const proxy of ['http://private-user:secret-value@relay.example:8080','not-a-url-secret-value','http://relay.example:8080/?token=secret-value']){
  await assert.rejects(receiveCITransport({...input,HTTPS_PROXY:proxy},'/tmp'),error=>{
   assert.equal(error.message,'unqualified native CI transport; no command issued');assert.ok(!error.stack.includes('secret-value'));return true;
  });
 }
 for(const value of ['true','',2])await assert.rejects(receiveCITransport({...input,NODE_USE_ENV_PROXY:value},'/tmp'));
});
test('CA custody uses original bounded regular-file admission',async t=>{
 const root=mkdtempSync(join(tmpdir(),'ci-ca-contract-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const file=join(root,'ca.pem');writeFileSync(file,'fixture certificate bytes');
 const input={PATH:'/usr/bin',NODE_EXTRA_CA_CERTS:file};
 assert.equal((await receiveCITransport(input,root)).identity.files.NODE_EXTRA_CA_CERTS.length,64);
 await assert.rejects(receiveCITransport({...input,NODE_EXTRA_CA_CERTS:join(root,'absent')},root));
 symlinkSync(file,join(root,'redirected'));await assert.rejects(receiveCITransport({...input,NODE_EXTRA_CA_CERTS:join(root,'redirected')},root));
});
