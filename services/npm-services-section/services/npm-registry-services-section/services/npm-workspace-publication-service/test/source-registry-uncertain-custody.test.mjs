import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// Each case has a fresh module/queue and a disposable harmless-child fixture.
// The original receiver and supervisor run; registry/artifact/PNPM providers
// are explicit unit doubles. This is not native store or package qualification.
const fixture=fileURLToPath(new URL('./helpers/source-registry-uncertain-custody.mjs',import.meta.url));
for(const name of ['uncertain','queued','supplier-failure','receipt-failure','log-failure','progress-failure','progress-null','progress-undefined','progress-getters','unwind-failure',
 'settled-failure','settled-timeout','never-invoked','success','legacy']){
 test('consumer custody: '+name,()=>{
  const result=spawnSync(process.execPath,['--experimental-vm-modules',fixture,name],{
   encoding:'utf8',timeout:15000,maxBuffer:1048576});
  assert.equal(result.signal,null,result.stderr);
  assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
  const receipt=JSON.parse(result.stdout.trim());
  assert.equal(receipt.case,name);assert.equal(receipt.accepted,true);
  console.log(JSON.stringify(receipt));
 });
}

