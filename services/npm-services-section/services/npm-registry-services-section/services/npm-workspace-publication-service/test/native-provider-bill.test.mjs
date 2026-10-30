import assert from 'node:assert/strict';
import test from 'node:test';
import{normalizeNativeProviderBill as n,nativeProviderBillIdentity as h,requireNativeProviderBillIdentity as match}from'../src/native-provider-bill.mjs';
test('native operating bill preserves all source/provider identity and rejects unsafe Data',()=>{
const root='/gnu/store/'+ '0'.repeat(32)+'-provider/node_modules/@fixture/provider';
const bill={kind:'npm.native-provider-bill/v1',sourceIdentity:{kind:'git-source-snapshot',repository:'fixture/source',commit:'a'.repeat(40),tree:'b'.repeat(40),contentSHA256:'c'.repeat(64),name:'@fixture/main',version:'1.0.0'},bindings:[{name:'@fixture/provider',version:'1.0.0',directory:root,manifestSHA256:'d'.repeat(64)},{name:'optional',absent:true}]};
let count=0;const reject=f=>{assert.throws(f);count++;};const copy=()=>structuredClone(bill);
const normalized=n(bill),identity=h(bill);assert.equal(identity.length,64);assert.ok(Object.isFrozen(normalized)&&Object.isFrozen(normalized.sourceIdentity)&&Object.isFrozen(normalized.bindings[0]));count+=2;
assert.equal(h({...bill,bindings:[...bill.bindings].reverse()}),identity);count++;
for(const key of ['commit','tree','contentSHA256']){const v=copy();v.sourceIdentity[key]='e'.repeat(key==='contentSHA256'?64:40);assert.notEqual(h(v),identity);count++;}
for(const key of ['version','directory','manifestSHA256']){const v=copy();v.bindings[0][key]=key==='version'?'1.0.1':key==='directory'?root+'/sub':'f'.repeat(64);assert.notEqual(h(v),identity);count++;}
reject(()=>n({...bill,extra:true}));reject(()=>n({...bill,bindings:[...bill.bindings,bill.bindings[0]]}));
reject(()=>n({...bill,bindings:[{...bill.bindings[0],directory:root+'/../other'}]}));
reject(()=>n({...bill,bindings:[{...bill.bindings[0],extra:1}]}));
reject(()=>n({...bill,sourceIdentity:{...bill.sourceIdentity,gitHead:'a'.repeat(40)}}));
reject(()=>n({...bill,bindings:[{name:'../bad',absent:true}]}));
reject(()=>n({...bill,bindings:[{...bill.bindings[0],absent:true}]}));
reject(()=>n({...bill,sourceIdentity:{kind:'registry-archive',name:'@fixture/main',version:'1.0.0',gitHead:'a'.repeat(40),integrity:'sha512-'+Buffer.alloc(64).toString('base64')+'\n'}}));
const sri={...bill,sourceIdentity:{kind:'registry-archive',name:'@fixture/main',version:'1.0.0',gitHead:'a'.repeat(40),integrity:'sha512-'+Buffer.alloc(64).toString('base64')}};assert.equal(n(sri).sourceIdentity.integrity,sri.sourceIdentity.integrity);count++;
let invoked=0;const getter=copy();Object.defineProperty(getter.sourceIdentity,'commit',{enumerable:true,get(){invoked++;return'a'.repeat(40);}});reject(()=>n(getter));assert.equal(invoked,0);count++;
const arr=copy();Object.defineProperty(arr.bindings,'0',{enumerable:true,get(){invoked++;return bill.bindings[0];}});reject(()=>n(arr));assert.equal(invoked,0);count++;
reject(()=>match(bill,'0'.repeat(64)));assert.equal(h(match(bill,identity)),identity);count++;
assert.equal(n({...bill,bindings:[{...bill.bindings[0],directory:root+'/sub folder/a..b'}]}).bindings[0].directory,root+'/sub folder/a..b');count++;
for(const value of [root+'\n',root+'/a\x7f',root+'//sub'])reject(()=>n({...bill,bindings:[{...bill.bindings[0],directory:value}]}));
reject(()=>n({...bill,sourceIdentity:{...bill.sourceIdentity,repository:'../repo'}}));reject(()=>n({...bill,sourceIdentity:{...bill.sourceIdentity,commit:bill.sourceIdentity.commit+'\n'}}));
});

test('retained dependency role identity binds every parent and target fact without issuing store authority',()=>{
 const scope='/gnu/store/'+'0'.repeat(32)+'-contexts';
 const edge={parentDirectory:scope+'/node_modules/peer',parentName:'peer',parentVersion:'1.0.0',parentManifestSHA256:'a'.repeat(64),field:'dependencies',name:'@fixture/own',declared:'0.11.1',directory:scope+'/node_modules/@fixture/own',version:'0.11.3',manifestSHA256:'b'.repeat(64)};
 const base={kind:'npm.native-provider-bill/v1',sourceIdentity:{kind:'git-source-snapshot',repository:'fixture/source',commit:'a'.repeat(40),tree:'b'.repeat(40),contentSHA256:'c'.repeat(64),name:'@fixture/own',version:'0.14.1'},bindings:[{name:'peer',version:'1.0.0',directory:edge.parentDirectory,manifestSHA256:edge.parentManifestSHA256}],retainedContextEdges:[edge]};
 const identity=h(base),changes={parentDirectory:scope+'/node_modules/other',parentName:'other',parentVersion:'1.0.1',parentManifestSHA256:'d'.repeat(64),field:'peerDependencies',name:'@fixture/other',declared:'0.11.2',directory:scope+'/node_modules/@fixture/other',version:'0.11.4',manifestSHA256:'e'.repeat(64)};
 for(const [key,value]of Object.entries(changes))assert.notEqual(h({...base,retainedContextEdges:[{...edge,[key]:value}]}),identity,key);
 assert(Object.isFrozen(n(base).retainedContextEdges[0]));
 assert.throws(()=>n({...base,retainedContextEdges:[edge,edge]}));
 assert.throws(()=>n({...base,retainedContextEdges:[{...edge,extra:true}]}));
 assert.throws(()=>n({...base,retainedContextEdges:[{...edge,field:'devDependencies'}]}));
 assert.throws(()=>n({...base,retainedContextEdges:[{...edge,parentDirectory:scope+'/../other'}]}));
 let called=0;const bad={...edge};Object.defineProperty(bad,'parentName',{enumerable:true,get(){called++;return'peer'}});
 assert.throws(()=>n({...base,retainedContextEdges:[bad]}));assert.equal(called,0);
});
test('native context anchors are direct closed Data and bind the pure selection',()=>{
 const root='/gnu/store/'+'0'.repeat(32)+'-context';
 const value={kind:'npm.native-provider-bill/v1',sourceIdentity:{kind:'git-source-snapshot',repository:'fixture/source',commit:'a'.repeat(40),tree:'b'.repeat(40),contentSHA256:'c'.repeat(64),name:'fixture',version:'1.0.0'},bindings:[{name:'provider',version:'1.0.0',directory:root+'/node_modules/provider',manifestSHA256:'d'.repeat(64)}]};
 const plain=n(value);assert.ok(!Object.hasOwn(plain.bindings[0],'contextRoot'));assert.equal(h(plain),h(value));
 const live=structuredClone(value);live.bindings[0].contextRoot=root;assert.equal(n(live).bindings[0].contextRoot,root);assert.notEqual(h(live),h(value));assert.ok(Object.isFrozen(n(live).bindings[0]));
 for(const bad of[root+'/nested',root+'/..',root+'\\n',root+'\\u007f','/gnu/store/'+'e'.repeat(32)+'-x'])assert.throws(()=>n({...live,bindings:[{...live.bindings[0],contextRoot:bad}]}));
 assert.throws(()=>n({...value,bindings:[{name:'optional',absent:true,contextRoot:root}]}));
 let invoked=false;const getter={...value.bindings[0]};Object.defineProperty(getter,'contextRoot',{get(){invoked=true;return root;},enumerable:true});assert.throws(()=>n({...value,bindings:[getter]}));assert.equal(invoked,false);
});
