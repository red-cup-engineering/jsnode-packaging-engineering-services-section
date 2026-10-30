import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {createRequire} from "node:module";
import {produceNativePackageProgramme} from "../src/produce-native-package-programme.mjs";
const target="@fixture/target",provider="@fixture/provider";
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"native-programme-fixture-"));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const base=path.join(root,"base"),input=path.join(root,"archive-source"),output=path.join(root,"product");
 function put(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,typeof value==="string"?value:JSON.stringify(value));}
 function pkg(dir,name,version,dependencies={},value=version){
  put(path.join(dir,"package.json"),{name,version,type:"module",dependencies,exports:"./index.mjs"});
  put(path.join(dir,"index.mjs"),"export default "+JSON.stringify(value)+";\n");
 }
 pkg(base,"@fixture/runtime","1.0.0",{[target]:"1.0.0",[provider]:"2.0.0"});
 const old=path.join(base,"node_modules",target);
 pkg(old,target,"1.0.0",{[provider]:"1.1.0"});
 const nested=path.join(base,"providers/nested");
 pkg(nested,provider,"1.1.0");
 pkg(path.join(base,"node_modules",provider),provider,"2.0.0");
 fs.mkdirSync(path.join(old,"node_modules/@fixture"),{recursive:true});
 fs.symlinkSync(nested,path.join(old,"node_modules",provider));
 const manifest={name:target,version:"1.0.1",type:"module",gitHead:"a".repeat(40),dependencies:{[provider]:"1.1.0"},exports:"./index.mjs"};
 put(path.join(input,"package/package.json"),manifest);
 put(path.join(input,"package/index.mjs"),'export {default} from "@fixture/provider";\n');
 put(path.join(input,"package/scripts/server.mjs"),'export {default} from "../index.mjs";\n');
 const archive=path.join(root,"target.tgz");
 function repack(){
  const r=spawnSync("tar",["--format=ustar","-czf",archive,"-C",input,"package"],{encoding:"utf8"});
  assert.equal(r.status,0,r.stderr);
  return "sha512-"+createHash("sha512").update(fs.readFileSync(archive)).digest("base64");
 }
 const args={archivePath:archive,integrity:repack(),selection:{name:target,version:"1.0.1",sourceCommit:"a".repeat(40)},incumbent:{runtimeRoot:base,packageRoot:old},destination:output,entry:"scripts/server.mjs"};
 return {root,base,input,output,old,manifest,args,put,repack};
}
test("reuses exact nested provider contexts while carrying only changed package bytes",async t=>{
 const f=fixture(t); const result=await produceNativePackageProgramme(f.args);
 assert.equal(result.kind,"npm.native-package-programme.produced/v1");
 assert.equal(result.dependencyPayloadCopied,false);
 assert.equal(result.portableClosureClaimed,false);
 assert.equal(result.machineReceivingRequired,true);
 assert.equal(result.sourceCommit,"a".repeat(40));
 assert.equal(result.programme,path.join(f.output,"node_modules",target,"scripts/server.mjs"));
 const own=path.join(f.output,"node_modules",target);
 const req=createRequire(path.join(own,"package.json"));
 assert.equal(fs.realpathSync(req.resolve(provider)),path.join(f.base,"providers/nested/index.mjs"));
 const rootReq=createRequire(path.join(f.output,"package.json"));
 assert.equal(fs.realpathSync(rootReq.resolve(provider)),path.join(f.base,"node_modules",provider,"index.mjs"));
 assert.equal((await import("file://"+result.programme)).default,"1.1.0");
 assert.equal(fs.existsSync(path.join(f.output,"node_modules/.pnpm")),false);
 assert.ok(result.providerInputs.includes(f.base));
 assert.equal(JSON.parse(fs.readFileSync(path.join(f.output,"package.json"))).dependencies[target],"1.0.1");
});
test("changed dependency declarations refuse before reserving destination",async t=>{
 const f=fixture(t); f.manifest.dependencies[provider]="3.0.0";
 f.put(path.join(f.input,"package/package.json"),f.manifest);f.args.integrity=f.repack();
 await assert.rejects(produceNativePackageProgramme(f.args),/dependenc|context/i);
 assert.equal(fs.existsSync(f.output),false);
 assert.equal(JSON.parse(fs.readFileSync(path.join(f.old,"package.json"))).version,"1.0.0");
});
test("wrong registry integrity refuses before writes",async t=>{
 const f=fixture(t);f.args.integrity="sha512-"+Buffer.alloc(64).toString("base64");
 await assert.rejects(produceNativePackageProgramme(f.args),/identity|integrity|SHA512/i);
 assert.equal(fs.existsSync(f.output),false);
});
test("source commit and package identity must match qualified selection",async t=>{
 for(const field of ["sourceCommit","name","version"]){
  const f=fixture(t);f.args.selection[field]=field==="sourceCommit"?"b".repeat(40):"different";
  await assert.rejects(produceNativePackageProgramme(f.args));
  assert.equal(fs.existsSync(f.output),false);
 }
});
test("archive links are rejected by the original native archive reader",async t=>{
 const f=fixture(t);fs.symlinkSync("/etc/passwd",path.join(f.input,"package/leak"));
 f.args.integrity=f.repack();
 await assert.rejects(produceNativePackageProgramme(f.args),/link|nonregular|archive/i);
 assert.equal(fs.existsSync(f.output),false);
});
test("missing or mismatched installed providers cannot be inherited",async t=>{
 const f=fixture(t);
 f.put(path.join(f.base,"providers/nested/package.json"),{name:provider,version:"9.0.0"});
 await assert.rejects(produceNativePackageProgramme(f.args),/provider|dependenc|context/i);
 assert.equal(fs.existsSync(f.output),false);
});
test("providers outside the received incumbent root refuse",async t=>{
 const f=fixture(t),external=path.join(f.root,"outside");
 f.put(path.join(external,"package.json"),{name:provider,version:"1.1.0"});
 fs.unlinkSync(path.join(f.old,"node_modules",provider));
 fs.symlinkSync(external,path.join(f.old,"node_modules",provider));
 await assert.rejects(produceNativePackageProgramme(f.args),/provider|outside|escape|context/i);
 assert.equal(fs.existsSync(f.output),false);
});
test("existing destination is untouched",async t=>{
 const f=fixture(t);fs.mkdirSync(f.output);f.put(path.join(f.output,"keep"),"preserve");
 await assert.rejects(produceNativePackageProgramme(f.args));
 assert.equal(fs.readFileSync(path.join(f.output,"keep"),"utf8"),"preserve");
});
test("overlapping output and incumbent cannot be constructed",async t=>{
 const f=fixture(t);f.args.destination=path.join(f.base,"new");
 await assert.rejects(produceNativePackageProgramme(f.args));
 assert.equal(fs.existsSync(f.args.destination),false);
});
test("undeclared and missing programme entry refuses without partial output",async t=>{
 const f=fixture(t);f.args.entry="../escape.mjs";
 await assert.rejects(produceNativePackageProgramme(f.args));
 assert.equal(fs.existsSync(f.output),false);
 f.args.entry="scripts/absent.mjs";
 await assert.rejects(produceNativePackageProgramme(f.args));
 assert.equal(fs.existsSync(f.output),false);
});

test("exact prerelease versions use the original version policy",async t=>{
 const f=fixture(t);f.manifest.version="1.0.1-dev.0";f.args.selection.version=f.manifest.version;
 f.put(path.join(f.input,"package/package.json"),f.manifest);f.args.integrity=f.repack();
 const result=await produceNativePackageProgramme(f.args);
 assert.equal(result.version,"1.0.1-dev.0");
});
test("dependency payload inside an archive is refused before destination creation",async t=>{
 const f=fixture(t);f.put(path.join(f.input,"package/node_modules/generated/index.mjs"),"export {}");
 f.args.integrity=f.repack();
 await assert.rejects(produceNativePackageProgramme(f.args),/dependency installation/);
 assert.equal(fs.existsSync(f.output),false);
});

test("package scope excludes unrelated root bindings and their metadata",async t=>{
 const f=fixture(t);
 f.put(path.join(f.base,"node_modules",provider,"package.json"),"not a package manifest");
 const oldRoot=JSON.parse(fs.readFileSync(path.join(f.base,"package.json")));
 oldRoot.optionalDependencies={"@fixture/unused":"9.0.0"};oldRoot.peerDependencies={"@fixture/unused-peer":"9.0.0"};
 f.put(path.join(f.base,"package.json"),oldRoot);
 const result=await produceNativePackageProgramme({...f.args,programmeScope:"package"});
 assert.equal((await import("file://"+result.programme)).default,"1.1.0");
 const carrier=JSON.parse(fs.readFileSync(path.join(f.output,"package.json")));
 assert.deepEqual(carrier.dependencies,{[target]:"1.0.1"});
 assert.equal(carrier.optionalDependencies,undefined);assert.equal(carrier.peerDependencies,undefined);
 assert.equal(fs.existsSync(path.join(f.output,"node_modules",provider)),false);
 assert.equal(result.programmeScope,"package");assert.equal(result.dependencyPayloadCopied,false);
 assert.equal(carrier.nativeProgramme.programmeScope,"package");
});
test("received policy binds changed declarations to exact actual native providers",async t=>{
 const f=fixture(t);
 f.manifest.dependencies[provider]="2.0.0";f.put(path.join(f.input,"package/package.json"),f.manifest);f.args.integrity=f.repack();
 fs.unlinkSync(path.join(f.old,"node_modules",provider));fs.symlinkSync(path.join(f.base,"node_modules",provider),path.join(f.old,"node_modules",provider));
 const before=fs.readFileSync(path.join(f.old,"package.json"),"utf8");
 const result=await produceNativePackageProgramme({...f.args,dependencyPolicy:"received",programmeScope:"package"});
 assert.equal((await import("file://"+result.programme)).default,"2.0.0");
 assert.equal(result.dependencyPolicy,"received");
 assert.equal(JSON.parse(fs.readFileSync(path.join(f.output,"package.json"))).nativeProgramme.dependencyPolicy,"received");
 assert.equal(fs.readFileSync(path.join(f.old,"package.json"),"utf8"),before);
 assert.equal(fs.existsSync(path.join(f.output,"node_modules/.pnpm")),false);
});
test("received policy refuses an absent or different exact supplier before writes",async t=>{
 const f=fixture(t);f.manifest.dependencies[provider]="3.0.0";f.put(path.join(f.input,"package/package.json"),f.manifest);f.args.integrity=f.repack();
 await assert.rejects(produceNativePackageProgramme({...f.args,dependencyPolicy:"received",programmeScope:"package"}));
 assert.equal(fs.existsSync(f.output),false);
});
test("received policy does not admit wildcard dependency declarations",async t=>{
 const f=fixture(t);f.manifest.dependencies[provider]="*";f.put(path.join(f.input,"package/package.json"),f.manifest);f.args.integrity=f.repack();
 await assert.rejects(produceNativePackageProgramme({...f.args,dependencyPolicy:"received",programmeScope:"package"}));
 assert.equal(fs.existsSync(f.output),false);
});
test("received package scope still refuses providers outside the immutable input",async t=>{
 const f=fixture(t),outside=path.join(f.root,"external");f.put(path.join(outside,"package.json"),{name:provider,version:"1.1.0"});
 fs.unlinkSync(path.join(f.old,"node_modules",provider));fs.symlinkSync(outside,path.join(f.old,"node_modules",provider));
 await assert.rejects(produceNativePackageProgramme({...f.args,dependencyPolicy:"received",programmeScope:"package"}));
 assert.equal(fs.existsSync(f.output),false);
});
test("unknown reuse policy or programme scope refuses before reserving output",async t=>{
 for(const options of[{dependencyPolicy:"guess"},{dependencyPolicy:null},{programmeScope:"all"},{programmeScope:false}]){
  const f=fixture(t);await assert.rejects(produceNativePackageProgramme({...f.args,...options}));assert.equal(fs.existsSync(f.output),false);
 }
});
