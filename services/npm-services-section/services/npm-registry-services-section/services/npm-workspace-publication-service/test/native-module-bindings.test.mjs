import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {receiveNativeModuleRevision,nativeModuleRevisionHooks} from "../src/native-module-revision.mjs";
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
function fixture(){
 const root=fs.mkdtempSync(path.join(tmpdir(),"code-native-named-binding-"));
 const write=(p,s)=>{const f=path.join(root,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,s);return f;};
 const original=write("old/answer.mjs","export const answer='original';");
 write("old/package.json",JSON.stringify({name:"supply",version:"1.0.0",type:"module",exports:{"./answer":"./answer.mjs"}}));
 const selected=write("selected/answer.mjs","export const answer='selected';");
 const manifest=write("selected/package.json",JSON.stringify({name:"supply",version:"2.0.0",type:"module",exports:{"./answer":"./answer.mjs"}}));
 const marker=write("marker.mjs","export const tag='original-marker';");
 const replacement=write("marker-replacement.mjs","export const tag='received-marker';");
 const body="import{answer}from'supply/answer';import{tag}from'../marker.mjs';console.log(JSON.stringify({answer,tag}));";
 const importer=write("consumer/entry.mjs",body),other=write("consumer/other.mjs",body);
 fs.mkdirSync(path.join(root,"consumer/node_modules"),{recursive:true});
 fs.symlinkSync(path.join(root,"old"),path.join(root,"consumer/node_modules/supply"),"dir");
 const identity=p=>({path:p,sha256:sha(fs.readFileSync(p))});
 const binding={specifier:"supply/answer",importer:identity(importer),original:identity(original),selected:identity(selected),
  supplier:{manifest,sha256:sha(fs.readFileSync(manifest)),name:"supply",version:"2.0.0"}};
 const record={kind:"code.native-module-source-revision/v5",runtimeRoot:root,source:{repository:"fixture/native-supply",commit:"a".repeat(40)},
  files:[{target:marker,sourcePath:"src/marker.mjs",replacement,before:sha(fs.readFileSync(marker)),after:sha(fs.readFileSync(replacement))}],bindings:[binding]};
 const recordFile=write("revision.json",JSON.stringify(record));
 const operation=new URL("../src/native-module-revision.mjs",import.meta.url).href;
 const bootstrap=write("bootstrap.mjs","import fs from'node:fs';import{registerHooks}from'node:module';import{receiveNativeModuleRevision,nativeModuleRevisionHooks}from"+JSON.stringify(operation)+";registerHooks(nativeModuleRevisionHooks(receiveNativeModuleRevision(JSON.parse(fs.readFileSync("+JSON.stringify(recordFile)+")),{immutable:false})));");
 const run=entry=>JSON.parse(execFileSync(process.execPath,["--import",bootstrap,entry],{encoding:"utf8",stdio:["ignore","pipe","pipe"]}));
 return{root,record,recordFile,binding,importer,other,selected,original,run,dispose:()=>fs.rmSync(root,{recursive:true,force:true})};
}
test("the actual ESM resolver changes one named port and keeps another importer native",()=>{const f=fixture();try{
 assert.deepEqual(f.run(f.importer),{answer:"selected",tag:"received-marker"});
 assert.deepEqual(f.run(f.other),{answer:"original",tag:"received-marker"});
}finally{f.dispose();}});
test("v5 preserves an explicit empty named-binding set",()=>{const f=fixture();try{
 assert.equal(receiveNativeModuleRevision({...f.record,bindings:[]},{immutable:false}).bindings.size,0);
}finally{f.dispose();}});
test("supplier identity, exact public export and unique port are receiving boundaries",()=>{const f=fixture();try{
 const receive=binding=>receiveNativeModuleRevision({...f.record,bindings:[binding]},{immutable:false});
 assert.throws(()=>receive({...f.binding,supplier:{...f.binding.supplier,version:"invented"}}),/supplier identity/);
 assert.throws(()=>receive({...f.binding,specifier:"supply/not-an-export"}),/public export/);
 assert.throws(()=>receive({...f.binding,selected:f.binding.original}),/public export/);
 assert.throws(()=>receiveNativeModuleRevision({...f.record,bindings:[f.binding,f.binding]},{immutable:false}),/competing/);
}finally{f.dispose();}});
test("a false original resolution refuses at the actual Node resolver",()=>{const f=fixture();try{
 f.record.bindings[0].original=f.binding.selected;fs.writeFileSync(f.recordFile,JSON.stringify(f.record));
 assert.throws(()=>f.run(f.importer),error=>error.stderr?.includes("original native export resolution differs"));
}finally{f.dispose();}});
test("post-receiving supplier drift refuses and unmatched imports still delegate",()=>{const f=fixture();try{
 const hooks=nativeModuleRevisionHooks(receiveNativeModuleRevision(f.record,{immutable:false}));
 let delegated=false;
 const ordinary=hooks.resolve("other-package",{parentURL:pathToFileURL(f.importer).href},()=>{delegated=true;return{url:"file:///ordinary.mjs"};});
 assert.equal(delegated,true);assert.equal(ordinary.url,"file:///ordinary.mjs");
 fs.writeFileSync(f.selected,"export const answer='unreceived-drift';");
 assert.throws(()=>hooks.resolve("supply/answer",{parentURL:pathToFileURL(f.importer).href},()=>({url:pathToFileURL(f.original).href})),/changed before resolution/);
}finally{f.dispose();}});
