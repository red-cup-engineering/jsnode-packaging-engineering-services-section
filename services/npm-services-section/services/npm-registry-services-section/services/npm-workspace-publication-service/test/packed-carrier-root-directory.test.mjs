import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectPackedCarrierArchive as inspect} from '../src/packed-carrier-archive.mjs';
const limits={members:100,bytes:10000,tarBytes:100000,metadataBytes:10000};
function record(name,type='0',body='',extra={}) {
 const h=Buffer.alloc(512), b=Buffer.from(body); h.write(name);h.write('0000755\0',100);h.write(b.length.toString(8).padStart(11,'0')+'\0',124);h[156]=type.charCodeAt(0);h.write('ustar\0'+'00',257);
 if(extra.link)h.write(extra.link,157);if(extra.mode)h.write(extra.mode,100);if(extra.rawSize!==undefined)h.write(extra.rawSize.toString(8).padStart(11,'0')+'\0',124);
 h.fill(32,148,156);h.write([...h].reduce((a,b)=>a+b,0).toString(8).padStart(6,'0')+'\0 ',148);
 return Buffer.concat([h,b,Buffer.alloc((512-b.length%512)%512)]);
}
const manifest=record('package/package.json','0','{}'), end=Buffer.alloc(1024);
const archive=(...records)=>Buffer.concat([...records,manifest,end]);
const refuses=(data,reason)=>assert.throws(()=>inspect(data,limits),e=>e.reason===reason);
test('exact unsuffixed type5 envelope preserves original spelling and maps no file',()=>{const r=inspect(archive(record('package','5')),limits);assert.equal(r.headers[0].path,'package');assert.equal(r.headers[0].type,'Directory');assert.deepEqual(r.members.map(x=>x.path),['package.json']);assert.equal(r.parserEndOffset,r.accountedEndOffset);});
test('both root spellings remain aliases, in either order',()=>{for(const a of [['package','package/'],['package/','package']])refuses(archive(...a.map(x=>record(x,'5'))),'conflict');});
test('root regular file, foreign root, traversal and dot aliases still refuse',()=>{for(const [name,type] of [['package','0'],['other','5'],['/package','5'],['package/..','5'],['package/.','5'],['package//','5'],['package\\','5']])refuses(archive(record(name,type)),'path');});
test('raw/effective nonzero directory size refuses before envelope admission',()=>refuses(archive(record('package','5','x')),'number'));
test('links, unsafe permissions, checksum and tail still refuse',()=>{refuses(archive(record('package','5','',{link:'x'})),'type');refuses(archive(record('package','5','',{mode:'0004755\0'})),'mode');const bad=archive(record('package','5'));bad[0]^=1;refuses(bad,'checksum');const tail=archive(record('package','5'));tail[tail.length-1]=1;refuses(tail,'eof');});
test('nested package is content, not a second stripped envelope',()=>{const r=inspect(archive(record('package','5'),record('package/package','5'),record('package/package/file','0','x')),limits);assert.ok(r.members.some(x=>x.path==='package/file'));});
test('root still consumes member budget',()=>assert.throws(()=>inspect(archive(record('package','5')),{...limits,members:1}),e=>e.reason==='limit'));
function paxLine(key,value){let n=key.length+value.length+4;for(;;){const s=n+' '+key+'='+value+'\n';if(Buffer.byteLength(s)===n)return s;n=Buffer.byteLength(s);}}
test('PAX nonzero effective root directory size refuses',()=>refuses(archive(record('PaxHeader','x',paxLine('path','package')+paxLine('size','1')),record('package','5')),'number'));
test('same root twice, regular empty/nonempty root and link types refuse',()=>{refuses(archive(record('package','5'),record('package','5')),'conflict');for(const body of ['','x'])refuses(archive(record('package','0',body)),'path');for(const type of ['1','2'])refuses(archive(record('package',type)),'type');});
