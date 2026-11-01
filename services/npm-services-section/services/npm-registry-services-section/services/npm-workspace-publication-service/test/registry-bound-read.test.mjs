import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { receiveRegistryTarball } from '../src/registry.mjs';
const registry='https://registry.example/',tarball=registry+'fixture/-/fixture.tgz';
const bytes=Buffer.from('fixture artifact');
const integrity='sha512-'+createHash('sha512').update(bytes).digest('base64');
async function location(t){const root=await mkdtemp(join(tmpdir(),'registry-bound-read-'));t.after(()=>rm(root,{recursive:true,force:true}));return join(root,'received.tgz');}
test('bound receiving requests exact advertised URL and independently checks streamed bytes',async t=>{
  const destination=await location(t);let reads=0;
  const result=await receiveRegistryTarball({registry,tarball,integrity,destination,fetchImpl:async(url,options)=>{
    reads++;assert.equal(url,tarball);assert.equal(options.method,'GET');assert.equal(options.redirect,'error');return new Response(bytes);
  }});
  assert.equal(reads,1);assert.equal(result.artifactDownloaded,true);assert.deepEqual(await readFile(destination),bytes);
});
for(const wrong of ['http://registry.example/fixture.tgz','https://other.example/fixture.tgz','file:///tmp/fixture.tgz','https://user:pass@registry.example/f.tgz',tarball+'?secret=x',tarball+'#fragment']){
  test('foreign or modified transfer coordinate refuses before provider '+wrong,async t=>{
    let reads=0;await assert.rejects(receiveRegistryTarball({registry,tarball:wrong,integrity,destination:await location(t),fetchImpl:async()=>{reads++;return new Response(bytes);}}));assert.equal(reads,0);
  });
}
test('missing, redirected, malformed and corrupted transfers never produce a receiving file',async t=>{
  for(const response of [new Response(null,{status:404}),new Response(null,{status:302}),new Response('wrong bytes'),Object.assign(new Response(bytes),{})]){
    const destination=await location(t);
    if(response.status===200 && await response.clone().text()==='fixture artifact')Object.defineProperty(response,'url',{value:'https://other.example/redirected'});
    await assert.rejects(receiveRegistryTarball({registry,tarball,integrity,destination,fetchImpl:async()=>response}));
    await assert.rejects(readFile(destination),{code:'ENOENT'});
  }
});
test('bounded stream cancels on excess before destination creation',async t=>{
  let canceled=false,count=0;const block=new Uint8Array(1024*1024);
  const response=new Response(new ReadableStream({pull(controller){if(count++<1000)controller.enqueue(block);else controller.close();},cancel(){canceled=true;}}));
  const destination=await location(t);await assert.rejects(receiveRegistryTarball({registry,tarball,integrity,destination,fetchImpl:async()=>response}),/64 MiB/);
  assert.equal(canceled,true);await assert.rejects(readFile(destination),{code:'ENOENT'});
});
