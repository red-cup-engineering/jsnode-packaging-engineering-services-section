import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,access,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {applySourceRegistryClosure} from '../src/source-registry-closure.mjs';
const digest=x=>createHash('sha256').update(x).digest('hex');
async function selection(t,configurations){
 const root=await mkdtemp(join(tmpdir(),'source-install-policy-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const packages=[];
 for(const[i,config]of configurations.entries()){
  const dir=join(root,String(i));await mkdir(dir);const path=join(dir,'package.json');
  const before=JSON.stringify({name:'@fixture/consumer-'+i,version:'0.1.0'})+'\n';await writeFile(path,before);
  if(config!==null)await writeFile(join(dir,'.npmrc'),config);
  packages.push({name:'@fixture/consumer-'+i,path,sourceDigest:digest(before),manifest:{name:'@fixture/consumer-'+i,version:'0.1.1'},missingTargets:[]});
 }
 return{root,plan:{complete:true,registry:'https://publication.example.invalid/',packages}};
}

test('source closure application leaves an absent npmrc absent and changes only its selected manifest',async t=>{
 const{root,plan}=await selection(t,[null]);const result=await applySourceRegistryClosure(plan);
 assert.equal(result.kind,'npm.source-registry-closure.applied');assert.equal(result.manifests,1);
 assert.deepEqual(result.changed,[plan.packages[0].path]);await assert.rejects(access(join(root,'0','.npmrc')),{code:'ENOENT'});
 assert.deepEqual(JSON.parse(await readFile(plan.packages[0].path,'utf8')),plan.packages[0].manifest);
});

test('scope-only and explicit consumer policies retain exact comments, routing and auth placeholders',async t=>{
 const configs=[
  '# Default is owned by the actual installation environment.\n@fixture:registry=https://supplier.example.invalid/\n',
  '; authored consumer policy\r\nregistry=https://registry.npmjs.org/\r\n@fixture:registry=https://supplier.example.invalid/\r\n//supplier.example.invalid/:_authToken=${NPM_TOKEN}\r\n',
 ];
 const{root,plan}=await selection(t,configs);const result=await applySourceRegistryClosure(plan);
 assert.deepEqual(result.changed,plan.packages.map(x=>x.path));
 for(const[i,config]of configs.entries())assert.equal(await readFile(join(root,String(i),'.npmrc'),'utf8'),config);
 assert.equal(JSON.stringify(result).includes('NPM_TOKEN'),false);
});

test('late preimage mismatch refuses the whole selected transformation before earlier manifest/config effects',async t=>{
 const configs=[null,'@fixture:registry=https://supplier.example.invalid/\n'];
 const{root,plan}=await selection(t,configs);const before=await Promise.all(plan.packages.map(x=>readFile(x.path,'utf8')));plan.packages[1].sourceDigest='0'.repeat(64);
 await assert.rejects(applySourceRegistryClosure(plan),/source bytes advanced/u);
 assert.deepEqual(await Promise.all(plan.packages.map(x=>readFile(x.path,'utf8'))),before);
 await assert.rejects(access(join(root,'0','.npmrc')),{code:'ENOENT'});assert.equal(await readFile(join(root,'1','.npmrc'),'utf8'),configs[1]);
});

test('incomplete selection and a late invalid manifest leave every selected file unchanged',async t=>{
 const{root,plan}=await selection(t,[null,null]);const before=await Promise.all(plan.packages.map(x=>readFile(x.path,'utf8')));
 plan.complete=false;await assert.rejects(applySourceRegistryClosure(plan),/unresolved source selection/u);plan.complete=true;
 plan.packages[1].missingTargets=['missing.mjs'];await assert.rejects(applySourceRegistryClosure(plan),/unfabricated carrier/u);
 plan.packages[1].missingTargets=[];plan.packages[1].manifest.dependencies={'@fixture/provider':'^1.0.0'};await assert.rejects(applySourceRegistryClosure(plan),/unfabricated carrier/u);
 assert.deepEqual(await Promise.all(plan.packages.map(x=>readFile(x.path,'utf8'))),before);
 for(let i=0;i<2;i++)await assert.rejects(access(join(root,String(i),'.npmrc')),{code:'ENOENT'});
});
