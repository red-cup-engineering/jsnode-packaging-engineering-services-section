import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';

// Module mocks are confined to this explicit child test process. Production
// factories gain no caller-selected port, executor or qualified-binding bypass.
// This enrolls the six actual-caller UNIT cases in the ordinary test/*.test.mjs
// command; it is not full original-native PNPM qualification.
test('six fixed-composer outcome receiving cases with explicit unit suppliers', {timeout:20000}, async t=>{
  const environment={...process.env};
  // A fresh test runner must not inherit the outer runner's worker IPC context.
  delete environment.NODE_TEST_CONTEXT;
  const {stdout,stderr}=await promisify(execFile)(process.execPath,[
    '--experimental-test-module-mocks','--test','--test-reporter=tap','--test-concurrency=1',
    fileURLToPath(new URL('./helpers/source-worker-fixed-composer-fixture.mjs',import.meta.url))
  ],{timeout:15000,maxBuffer:1048576,env:environment});
  for(const [field,expected] of [['tests',6],['pass',6],['fail',0],['cancelled',0],['skipped',0]]){
    assert.match(stdout,new RegExp('^# '+field+' '+expected+'$','m'),`complete inner ${field} receiving required`);
  }
  t.diagnostic(stdout.trim());
  if(stderr)t.diagnostic(stderr.trim());
});
