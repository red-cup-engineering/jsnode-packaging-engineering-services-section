import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createNativeMetadataPreparationService } from '../src/native-metadata-preparation.mjs';
export const sha = text => createHash('sha256').update(text).digest('hex');
export async function fixture(t, registry = 'https://registry.example/') {
  const root=await mkdtemp(join(process.env.NATIVE_METADATA_SESSION_FIXTURE_ROOT ?? tmpdir(),'metadata-session-'));
  if(!process.env.NATIVE_METADATA_SESSION_FIXTURE_ROOT)t.after(()=>rm(root,{recursive:true,force:true}));
  for(const name of ['home','config','cache','receipts'])await mkdir(join(root,name));
  const environment={PATH:process.env.PATH,HOME:join(root,'home'),XDG_CONFIG_HOME:join(root,'config')};
  const input={program:process.execPath,entry:process.env.QUALIFIED_PNPM_ENTRY,receiptDirectory:join(root,'receipts'),environment,
    environmentPolicy:{stable:Object.fromEntries(Object.entries(environment).map(([k,v])=>[k,sha(v)])),relays:{}},limits:{timeoutMilliseconds:45000,outputLimit:1048576},
    query:{name:'ticket-fixture',selections:[{name:'ticket-fixture',version:'1.0.0',registry,integrity:'sha512-'+Buffer.alloc(64,1).toString('base64')}],
      policy:{minimumReleaseAge:1440,minimumReleaseAgeStrict:true},canonical:{sourceHead:'a'.repeat(40),manifestSHA256:'b'.repeat(64),lockSHA256:'c'.repeat(64),workspaceSHA256:'d'.repeat(64),registryConfigurationSHA256:'e'.repeat(64),selectionSHA256:'f'.repeat(64)},
      registry,directory:join(root,'query'),cacheDirectory:join(root,'cache')}};
  return {root,input,service:createNativeMetadataPreparationService()};
}
// Explicitly synthetic receipt/file for state-machine tests, never native provenance.
export function execution(request, overrides={}) {
  return {type:'JavascriptNodeCommandExecutionReceipt',version:1,request,result:{type:'JavascriptNodeCommandExecutionResult',version:1,status:1,signal:null,stdout:JSON.stringify({'ticket-fixture':{wanted:'1.0.0'}}),stderr:'',error:'',...overrides}};
}
export async function syntheticMirror(query) {
  await mkdir(join(query.cacheDirectory,'v12','metadata-full',new URL(query.registry).protocol.slice(0,-1)+'%3A+'+new URL(query.registry).hostname),{recursive:true});
  await writeFile(query.expectedMirrorPath,'synthetic opaque bytes: raw coverage intentionally incomplete');
}
