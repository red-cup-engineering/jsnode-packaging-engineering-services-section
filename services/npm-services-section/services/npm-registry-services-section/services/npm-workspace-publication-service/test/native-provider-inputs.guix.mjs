// Explicit native Guix read/receiver qualification; never part of Node-only QA.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const input=JSON.parse(process.argv[2]??'null');
if(!input) {console.error('UNRECEIVED: supply existing guile/modules/compiled/sourceCaller/bill/incumbent/candidate/node/parser/policy/ownerRoot');process.exit(78);}
for(const key of ['guile','modules','compiled','sourceCaller','bill','incumbent','candidate','node','parser','policy','ownerRoot']){
 assert.equal(typeof input[key],'string','UNRECEIVED '+key);assert.equal(fs.realpathSync(input[key]),input[key],'canonical '+key);
}
assert.ok(input.ownerRoot.startsWith('/run/user/'+process.getuid()+'/'));
const owner=fs.lstatSync(input.ownerRoot);assert.equal(owner.uid,process.getuid());assert.equal(owner.mode&0o777,0o700);
assert.ok(fs.lstatSync(input.sourceCaller+'/src/native-code-programme.scm').isFile());
const bill=JSON.parse(fs.readFileSync(input.bill,'utf8'));
const selected=bill.bindings.find(b=>b.contextRoot);assert.ok(selected,'actual anchored supplier required');
const quote=JSON.stringify;
const argv=['--no-auto-compile','-L',input.modules,'-C',input.compiled,'-L',input.sourceCaller+'/src'];
function run(code){const result=spawnSync(input.guile,[...argv,'-c',code],{encoding:'utf8'});assert.ifError(result.error);assert.notEqual(result.status,null,'native read terminal receiving required');return result;}
const read=file=>'(use-modules (native-code-programme) (json)) (display (scm->json-string (native-code-provider-inputs '+quote(file)+' '+quote(input.incumbent)+')))';
const positive=run(read(input.bill));assert.equal(positive.status,0,positive.stderr);const received=JSON.parse(positive.stdout);
const sourceRoot=selected.directory.split('/').slice(0,4).join('/');assert.ok(received.roots.includes(sourceRoot));assert.ok(received.roots.includes(selected.contextRoot));assert.ok(received.contexts.some(c=>c.anchor===selected.contextRoot&&c.source===sourceRoot&&c.directory===selected.directory));
let root;
try{
 root=fs.mkdtempSync(path.join(input.ownerRoot,'native-context-inputs-'));
 for(const [label,anchor,reason] of [['unrelated',input.node.split('/').slice(0,4).join('/'),'outside its native context anchor closure'],['unregistered','/gnu/store/'+'0'.repeat(32)+'-unreceived-context','not registered']]){
  const bad=structuredClone(bill);bad.bindings.find(b=>b.contextRoot).contextRoot=anchor;const file=root+'/'+label+'.json';fs.writeFileSync(file,JSON.stringify(bad),{flag:'wx',mode:0o600});const result=run(read(file));assert.notEqual(result.status,0);assert.ok(result.stderr.includes(reason),result.stderr);
 }
 const bad=structuredClone(bill);bad.bindings.find(b=>b.contextRoot).manifestSHA256='0'.repeat(64);const file=root+'/tampered-manifest.json';fs.writeFileSync(file,JSON.stringify(bad),{flag:'wx',mode:0o600});
 const entry=JSON.parse(fs.readFileSync(input.candidate+'/package.json')).nativeProgramme.entry;
 const result=run('(use-modules (native-code-programme)) (native-code-construction '+quote(input.candidate)+' '+quote(entry)+' #:node-program '+quote(input.node)+' #:parser-module '+quote(input.parser)+' #:policy-module '+quote(input.policy)+' #:bill-file '+quote(file)+' #:incumbent-package '+quote(input.incumbent)+')');
 assert.notEqual(result.status,0);assert.ok(result.stderr.includes('original Code observer refused'),result.stderr);
 console.log(JSON.stringify({kind:'native-provider-inputs.guix.received/v1',passed:4,roots:received.roots.length,storeMutation:false,dependencyPayloadCopied:false}));
}finally{if(root){fs.rmSync(root,{recursive:true});assert.equal(fs.existsSync(root),false);}}
