import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';import {tmpdir} from 'node:os';
import https from 'node:https';import {EventEmitter} from 'node:events';
import {pinExactDependencies} from '../src/pin-exact-dependencies.mjs';
import {receiveRegistryTarball} from '../src/registry.mjs';
const bytes=Buffer.from('fixture artifact'),registry='https://registry.561.group/';
const integrity='sha512-'+createHash('sha512').update(bytes).digest('base64');
async function fixture(t,count=1){
 const root=await mkdtemp(join(tmpdir(),'selection-transport-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const dir=join(root,'consumer');await mkdir(dir);const path=join(dir,'package.json');
 const releases=Array.from({length:count},(_,n)=>({name:'@red-cup-engineering/fixture-'+n,version:'1.0.0',registry,tarball:registry+'fixture-'+n+'.tgz',integrity,evidence:['fixture:reviewed']}));
 const manifest={name:'consumer',version:'1.0.0',dependencies:Object.fromEntries(releases.map(r=>[r.name,'workspace:*']))};
 const original=JSON.stringify(manifest)+'\n';await writeFile(path,original);
 const selection={kind:'npm-workspace-publication.reviewed-selection.v1',consumer:{name:manifest.name,version:manifest.version,manifestSha256:createHash('sha256').update(original).digest('hex')},releases};
 return {root,path,original,selection,options:{sites:[{dir,path,manifest}],selection,apply:true,migrateWorkspace:true,artifactDirectory:join(root,'artifacts'),readRegistryPackageVersionImpl:async(_,name)=>{const r=releases.find(x=>x.name===name);return {reachable:true,found:true,manifest:{name,version:r.version,dist:{integrity:r.integrity,tarball:r.tarball}}};}}};
}
async function refused(f,result){assert.equal(result.ok,false);const p=result.packages[0];assert.equal(p.applied,false);assert.equal(p.selectedReceived,false);assert.deepEqual(p.receivedArtifacts,[]);assert.equal(p.retainedArtifactCustody.state,'retained-unqualified');assert.equal(await readFile(f.path,'utf8'),f.original);return p;}
function native(t,close){const previous=https.globalAgent,agent=new https.Agent();https.globalAgent=agent;t.after(()=>{https.globalAgent=previous;agent.destroy();});let calls=0;agent.addRequest=req=>{calls++;const socket=new EventEmitter();socket.setTimeout=()=>socket;socket.connecting=false;queueMicrotask(()=>{req.emit('socket',socket);req.emit('error',new Error('fixture transport failure'));if(close){req.emit('close');socket.emit('close');}});};return ()=>calls;}

test('original live native observation survives refusal serialization without accepting or deleting selection',async t=>{
 const f=await fixture(t),calls=native(t,true);
 const result=await pinExactDependencies({...f.options,receiveRegistryArtifactImpl:input=>receiveRegistryTarball({...input,timeoutMs:100,inactivityTimeoutMs:20})});
 const p=await refused(f,result),receipt=p.refusals[0].transportReceiving;
 assert.equal(receipt.state,'observed-local-resources-closed');assert.equal(receipt.remoteSettlement,false);assert.equal(receipt.replayAuthority,false);assert.equal(receipt.occurrence.tarball,f.selection.releases[0].tarball);assert.equal(calls(),1);
 assert.deepEqual(JSON.parse(JSON.stringify(p.retainedArtifactCustody)).transportReceiving,receipt);
 await writeFile(join(p.retainedArtifactCustody.directory,'custody-marker'),'retained');
});

test('original unresolved native resources remain unknown after bounded receiving',async t=>{
 const f=await fixture(t),calls=native(t,false);const result=await pinExactDependencies({...f.options,receiveRegistryArtifactImpl:input=>receiveRegistryTarball({...input,timeoutMs:100,inactivityTimeoutMs:20})});
 const p=await refused(f,result);assert.equal(p.refusals[0].transportReceiving.state,'unknown');assert.equal(calls(),1);
});

test('opaque rejected port can finish a late write into retained unqualified staging',async t=>{
 const f=await fixture(t);let destination,release;const late=new Promise(resolve=>{release=resolve;});let written;
 const result=await pinExactDependencies({...f.options,receiveRegistryArtifactImpl:async input=>{destination=input.destination;written=late.then(()=>writeFile(destination,bytes));throw new Error('untrusted diagnostic must not be copied');}});
 const p=await refused(f,result);assert.equal(p.refusals[0].transportReceiving.kind,'npm.registry-transfer.receiving-unavailable.v1');assert.equal(JSON.stringify(result).includes('untrusted diagnostic'),false);
 release();await written;assert.deepEqual(await readFile(destination),bytes);assert.equal(p.retainedArtifactCustody.directory,join(destination,'..'));
});

test('earlier received member is not an accepted partial selection after a later failure',async t=>{
 const f=await fixture(t,2);let calls=0;
 const result=await pinExactDependencies({...f.options,receiveRegistryArtifactImpl:async input=>{calls++;if(calls===2)throw 'primitive failure';await writeFile(input.destination,bytes);return {artifactDownloaded:true,integrity};}});
 const p=await refused(f,result);assert.equal(calls,2);assert.equal(p.retainedArtifactCustody.failedArtifact.name,f.selection.releases[1].name);assert.deepEqual(await readFile(join(p.retainedArtifactCustody.directory,'0.tgz')),bytes);assert.equal(p.refusals[0].transportReceiving.kind,'npm.registry-transfer.receiving-unavailable.v1');
});

test('forged settlement fields cannot manufacture original transfer receiving',async t=>{
 const f=await fixture(t);const result=await pinExactDependencies({...f.options,receiveRegistryArtifactImpl:async()=>{throw {transportCleanup:'closed',state:'observed-local-resources-closed',replayAuthority:true};}});
 const p=await refused(f,result);assert.equal(p.refusals[0].transportReceiving.kind,'npm.registry-transfer.receiving-unavailable.v1');assert.equal(p.refusals[0].transportReceiving.replayAuthority,false);
});


test('another original occurrence cannot be relabeled as the selected artifact',async t=>{
 const f=await fixture(t),calls=native(t,true);
 const result=await pinExactDependencies({...f.options,receiveRegistryArtifactImpl:input=>receiveRegistryTarball({...input,tarball:registry+'other.tgz',timeoutMs:100,inactivityTimeoutMs:20})});
 const p=await refused(f,result);assert.equal(p.refusals[0].transportReceiving.kind,'npm.registry-transfer.receiving-unavailable.v1');assert.equal(p.retainedArtifactCustody.failedArtifact.tarball,f.selection.releases[0].tarball);assert.equal(calls(),1);
});


test('selected authority without trailing slash matches original registry canonical occurrence',async t=>{
 const f=await fixture(t),calls=native(t,true),selected=f.selection.releases[0];selected.registry='https://registry.561.group/base';selected.tarball=selected.registry+'/artifact.tgz';
 const result=await pinExactDependencies({...f.options,registryForSite:()=>({'@red-cup-engineering:registry':selected.registry}),receiveRegistryArtifactImpl:input=>receiveRegistryTarball({...input,timeoutMs:100,inactivityTimeoutMs:20})});
 const p=await refused(f,result);assert.equal(p.refusals[0].transportReceiving.state,'observed-local-resources-closed');assert.equal(p.refusals[0].transportReceiving.occurrence.registry,selected.registry+'/');assert.equal(calls(),1);
});
