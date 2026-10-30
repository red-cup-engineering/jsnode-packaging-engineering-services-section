// Explicit native regression against already received immutable inputs.
// First issue a receipt with native-code-input-receipt.scm (same Code caller).
// This test NEVER treats its public observer result as a private Code product.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const input=JSON.parse(process.argv[2]??'null');
if(!input){console.error('UNRECEIVED: explicit native node/caller/parser/policy/source/entry/bill/receipt, swapped inputs and owned mutableCandidate required');process.exit(78);}
for(const key of ['node','caller','parser','policy','source','bill','receipt','swappedReceipt','swappedSource','swappedBill','swappedGraph','mutableCandidate']){
 assert.equal(typeof input[key],'string');assert.equal(fs.realpathSync(input[key]),input[key],'unredirected existing native input '+key);
}
const rootStat=fs.lstatSync(input.mutableCandidate);
assert.equal(rootStat.uid,process.getuid());assert.equal(rootStat.mode&0o777,0o700);
assert.ok(input.mutableCandidate.startsWith('/run/user/'+process.getuid()+'/'),'owned mutable derived candidate in RAM only');
const args=['--no-global-search-paths','--experimental-vm-modules','--experimental-import-meta-resolve',input.caller+'/scripts/native-code-observer.mjs',input.parser,input.policy,input.caller+'/src/native-provider-graph.mjs',input.caller+'/src/native-registry-imports.mjs',input.caller+'/src/installed-contract-owner.mjs',input.caller+'/src/native-provider-bill.mjs',input.source,input.entry,input.bill,'--native-receipt='+input.receipt,'--summary'];
const rows=[];
function run(label,argv,success,reason){
 const before=performance.now(),r=spawnSync(input.node,argv,{encoding:'utf8'});
 assert.ifError(r.error);assert.notEqual(r.status,null,'native terminal receiving required');
 rows.push({case:label,status:r.status,wallMilliseconds:performance.now()-before});
 assert.equal(r.status===0,success,r.stderr);if(reason)assert.ok(r.stderr.includes(reason),r.stderr);
}
run('original-Scheme-issued-receipt-positive',args,true);
let a=[...args];a[13]='--native-receipt='+input.swappedReceipt;run('swapped-public-receipt',a,false,'Code-issued immutable observation receipt differs');
a=[...args];a[10]=input.swappedSource;run('swapped-source',a,false);
a=[...args];a[12]=input.swappedBill;run('swapped-bill',a,false,'operating source selection differs');
a=[...args];a[6]=input.swappedGraph;run('swapped-Code-supplier',a,false,'Code-issued immutable observation receipt differs');
// Change one derived metadata byte through one descriptor; preserve every own
// source byte, immutable product, and original metadata even on assertion FAIL.
const file=input.mutableCandidate+'/package.json',fd=fs.openSync(file,fs.constants.O_RDWR|fs.constants.O_NOFOLLOW);
const before=fs.fstatSync(fd);
const readAll=()=>{const size=fs.fstatSync(fd).size,b=Buffer.alloc(size);let used=0;while(used<size){const n=fs.readSync(fd,b,used,size-used,used);assert.ok(n>0,'complete owned metadata bytes');used+=n;}return b;};
const bytes=readAll();
const hash=b=>createHash('sha256').update(b).digest('hex'),digest=hash(bytes);
const needle=Buffer.from('"providerScope": "/gnu/store/'),at=bytes.indexOf(needle);
assert.ok(at>=0&&bytes.indexOf(needle,at+1)===-1,'exact derived metadata coordinate');
const offset=at+needle.length,original=bytes.subarray(offset,offset+1);
try{
 fs.writeSync(fd,Buffer.from(original[0]===48?'1':'0'),0,1,offset);
 a=[...args];a[10]=input.mutableCandidate;
 run('providerScope-tamper',a,false,'actual native programme identity differs');
}finally{
 fs.writeSync(fd,original,0,1,offset);
 const after=fs.fstatSync(fd);assert.equal(after.dev,before.dev);assert.equal(after.ino,before.ino);
 const restored=readAll();
 fs.closeSync(fd);assert.equal(hash(restored),digest,'original metadata restored');
}
console.log(JSON.stringify({kind:'native-input-receipt-focused-receiving/v1',passed:rows.length,rows,programmeBuilt:false,sourceTreeCreated:false,ownedMetadataRestored:true,storeAuthorityClaimed:false}));
// Receipt/root retention belongs to the original operation that issued it.
// Its plan reports preexisting accurately; retire only owned terminal inputs
// through original Guix delete-specific receiving, preserving borrowed roots.
