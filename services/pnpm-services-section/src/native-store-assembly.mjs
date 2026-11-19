import {lstat,readFile,realpath,mkdtemp,writeFile} from 'node:fs/promises';
import {join,resolve,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {isDeepStrictEqual,promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {hash,regular,storeAssemblyProvider} from './native-provider.mjs';
import {receiveOwnedHookProfile} from './native-hook-profile.mjs';
import {withFrozenPnpmStore} from './native-store-lease.mjs';
import {receiveExistingNativeStoreOwnerPermissions} from './native-store-custody.mjs';
const run=promisify(execFile);
const names=['native-store-assembly.mjs','native-store-lease.mjs','native-strict-store-importer.mjs','native-provider.mjs','native-hook-profile.mjs','native-store-custody.mjs'];
const closed=(value,keys)=>{
 if(!value||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).some(key=>typeof key!=='string'||!keys.includes(key)||!('value'in Object.getOwnPropertyDescriptor(value,key))))throw new TypeError('closed native store assembly record required');
};
const directory=async path=>{
 if(typeof path!=='string'||!isAbsolute(path)||resolve(path)!==path)throw new TypeError('canonical assembly directory required');
 const s=await lstat(path);if(!s.isDirectory()||await realpath(path)!==path||s.uid!==process.getuid()||(s.mode&0o022))throw new TypeError('owned unredirected assembly directory required');
};
async function source(){
 const manifestPath=fileURLToPath(new URL('../package.json',import.meta.url)),bytes=await regular(manifestPath,1048576),manifest=JSON.parse(bytes);
 if(manifest.name!=='@red-cup-engineering/pnpm-engineering-services-section'||manifest.exports?.['./native-store-assembly']!=='./src/native-store-assembly.mjs')throw new TypeError('original assembly supplier export required');
 const closure=[];for(const name of names){const path=fileURLToPath(new URL(name,import.meta.url));closure.push({path,sha256:hash(await regular(path,1048576))});}
 return{name:manifest.name,version:manifest.version,publicExport:'./native-store-assembly',manifestPath,manifestSHA256:hash(bytes),closure};
}
async function inputs(cwd){
 const files=[];for(const name of['package.json','pnpm-lock.yaml']){const path=join(cwd,name),bytes=await regular(path,16777216);files.push({path,sha256:hash(bytes),bytes:bytes.length});}return files;
}
/** Original PNPM capability. The original Code caller owns the finite native process. */
export function createNativeStoreAssemblyService(){
 const sessions=new WeakMap(),state=ticket=>{const s=sessions.get(ticket);if(!s)throw new TypeError('foreign native store assembly session');return s;};
 async function custody(s,probe){
  if(!isDeepStrictEqual(s.source,await source())||!isDeepStrictEqual(s.inputs,await inputs(s.cwd))||!isDeepStrictEqual(s.profile,await receiveOwnedHookProfile(s.cwd)))throw new TypeError('native assembly source, inputs or configuration changed');
  await storeAssemblyProvider(process.execPath,[s.entry],s.cwd,s.provider,probe);
  if(hash(await regular(s.hook,1048576))!==s.hookSHA256)throw new TypeError('native assembly importer changed');
 }
 return Object.freeze({
  kind:'pnpm.native-store-assembly.service.v1',
  async receiveStoreOwnerPermissions(input){
   closed(input,['entry','cwd','storeBase']);
   await directory(input.cwd);
   if(typeof input.storeBase!=='string'||!isAbsolute(input.storeBase)||resolve(input.storeBase)!==input.storeBase)throw new TypeError('canonical existing store base required');
   for(const path of[input.storeBase,join(input.storeBase,'v11'),join(input.storeBase,'v11','index.db')])await lstat(path);
   const provider=await storeAssemblyProvider(process.execPath,[input.entry],input.cwd);
   const storeDirectory=(await run(process.execPath,[input.entry,'--store-dir',input.storeBase,'store','path'],{cwd:input.cwd,timeout:10000,maxBuffer:65536})).stdout.trim();
   if(storeDirectory!==join(input.storeBase,'v11'))throw new TypeError('original PNPM native store selection differs');
   return {...await receiveExistingNativeStoreOwnerPermissions({storeBase:input.storeBase,storeDirectory}),provider,supplier:await source(),coverage:'explicit per-user directory permission migration only; frozen custody and graph receiving remain separate'};
  },
  async prepare(input){
   closed(input,['entry','cwd','storeBase','receiptDirectory','policyArguments']);
   for(const key of['cwd','storeBase','receiptDirectory'])await directory(input[key]);
   if(typeof input.entry!=='string'||!isAbsolute(input.entry))throw new TypeError('explicit original native entry required');
   if(!Array.isArray(input.policyArguments)||input.policyArguments.length>128||input.policyArguments.some(arg=>typeof arg!=='string'||
    !/^(?:--config\.minimumReleaseAgeStrict=true|--config\.minimumReleaseAge=(?:0|[1-9][0-9]*)|--config\.minimumReleaseAgeExclude=(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+@[0-9A-Za-z.+-]+)$/u.test(arg)))throw new TypeError('only exact original release policy arguments may compose');
   const selectedSource=await source(),selectedInputs=await inputs(input.cwd),profile=await receiveOwnedHookProfile(input.cwd);
   const provider=await storeAssemblyProvider(process.execPath,[input.entry],input.cwd);
   const storeDirectory=(await run(process.execPath,[input.entry,'--store-dir',input.storeBase,'store','path'],{cwd:input.cwd,timeout:10000,maxBuffer:65536})).stdout.trim();
   if(storeDirectory!==join(input.storeBase,'v11'))throw new TypeError('original PNPM native store selection differs');
   await directory(storeDirectory);
   const receiptDirectory=await mkdtemp(join(input.receiptDirectory,'.pnpm-store-assembly-'));
   const hook=join(receiptDirectory,'importer.mjs'),events=join(receiptDirectory,'imports.json');
   const importerURL=pathToFileURL(fileURLToPath(new URL('./native-strict-store-importer.mjs',import.meta.url))).href;
   const hookText='import{writeFileSync}from"node:fs";\nimport{createStrictStoreImporter}from '+JSON.stringify(importerURL)+';\n'+
    'const importer=await createStrictStoreImporter('+JSON.stringify({storeDirectory,installationDirectory:input.cwd})+');\n'+
    'export const hooks={importPackage:async(...args)=>{const method=await importer.importPackage(...args);writeFileSync('+JSON.stringify(events)+',JSON.stringify(importer.read())+"\\n",{mode:0o600});return method;}};\n';
   await writeFile(hook,hookText,{flag:'wx',mode:0o600});
   await writeFile(events,'null\n',{flag:'wx',mode:0o600});
   const command=Object.freeze({program:process.execPath,arguments:Object.freeze([input.entry,'--dir',input.cwd,...input.policyArguments,'install','--ignore-scripts','--frozen-lockfile','--offline','--frozen-store','--store-dir',input.storeBase,'--global-pnpmfile',hook,'--config.enable-global-virtual-store=false','--reporter=append-only'])});
   const s={entry:input.entry,cwd:input.cwd,source:selectedSource,inputs:selectedInputs,profile,provider,storeDirectory,hook,hookSHA256:hash(hookText),events,command,lease:null,running:false,finished:false};
   const ticket=Object.freeze({kind:'pnpm.native-store-assembly.session.v1'});sessions.set(ticket,s);
   return Object.freeze({session:ticket,command,supplier:selectedSource,provider,receiptDirectory});
  },
  async revalidate(ticket){await custody(state(ticket),true);return true;},
  async withStoreRead(ticket,work){
   const s=state(ticket);if(s.running||s.finished)throw new TypeError('native store assembly session is single use');
   if(typeof work!=='function')throw new TypeError('original caller native execution scope required');
   await custody(s,true);s.running=true;
   try{const received=await withFrozenPnpmStore({storeDirectory:s.storeDirectory,installationDirectory:s.cwd},async()=>{
    await custody(s,false);const value=await work(s.command);await custody(s,false);return value;});
    s.lease=received.receipt;return received.result;
   }finally{s.running=false;s.finished=true;}
  },
  async receive(ticket,outcome){
   const s=state(ticket);closed(outcome,['invoked','code','signal']);let custodyStatus='unchanged';
   try{await custody(s,false);}catch{custodyStatus='changed-or-unread';}
   let imports=null;try{imports=JSON.parse(await regular(s.events,65536));}catch{}
   const validImports=imports?.kind==='pnpm.strict-native-store-import'&&Number.isSafeInteger(imports.imports)&&imports.imports>0&&Number.isSafeInteger(imports.links)&&imports.links>0&&imports.copiedPayloadBytes===0;
   const accepted=Boolean(custodyStatus==='unchanged'&&s.finished&&s.lease&&validImports&&outcome.invoked===true&&outcome.code===0&&!outcome.signal);
   return{accepted,evidence:{kind:'pnpm.native-store-assembly.receipt.v1',supplier:s.source,provider:s.provider,inputs:s.inputs,profile:s.profile,custody:custodyStatus,lease:s.lease,imports,native:{...outcome},accepted,
    coverage:'original native strict cached assembly; graph and installed members require original caller receiving'}};
  }
 });
}
