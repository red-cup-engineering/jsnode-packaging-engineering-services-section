import {readFile,mkdir,mkdtemp,readdir,lstat,realpath,rm,rename,symlink,unlink,writeFile,readlink} from 'node:fs/promises';
import {resolve,dirname,join,relative,isAbsolute,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify,isDeepStrictEqual} from 'node:util';
import {prepareSourceRegistryCarriers,packSourceRegistryClosure,nativeRegistryWorkspacePolicy,reobserveNativeFrozenConsumer,isNativeFrozenConsumerReceiving} from './source-registry-closure.mjs';
import {assertRootInstalledDependencyPins} from './native-registry-imports.mjs';
import {bytes as stableBytes} from './native-worker-custody.mjs';
import {publicationManifest} from './dependency-policy.mjs';

const run=promisify(execFile);
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const inside=(root,file)=>{const p=relative(root,file);return !isAbsolute(p)&&p!=='..'&&!p.startsWith('..'+sep);};

/** Complete bounded byte/topology custody of actual native output. No package
 * layout parsing, dependency resolution or archive-correctness inference. */
export async function observeNativeInstallation(installationRoot){
  const root=join(resolve(installationRoot),'node_modules');
  if(await realpath(root)!==root||!(await lstat(root)).isDirectory())throw new TypeError('real native installation tree required');
  const bounds={paths:65536,bytes:1073741824,fileBytes:67108864,pathBytes:4096,depth:128};
  const hash=createHash('sha256');let entries=0,files=0,links=0,bytes=0;
  const stable=(a,b)=>['dev','ino','size','mtimeMs','ctimeMs','mode'].every(key=>a[key]===b[key]);
  const emit=row=>hash.update(JSON.stringify(row)+'\n');
  async function visit(path,prefix,depth){
    if(++entries>bounds.paths||depth>bounds.depth||Buffer.byteLength(prefix)>bounds.pathBytes)throw new RangeError('native installed tree path bound exceeded');
    const before=await lstat(path),mode=before.mode&0o777;
    if(before.isSymbolicLink()){
      const literal=await readlink(path),target=await realpath(path);
      if(Buffer.byteLength(literal)>bounds.pathBytes||!inside(root,target))throw new Error('native installed link leaves received tree');
      emit(['link',prefix,mode,literal,relative(root,target)]);links++;
    }else if(before.isDirectory()){
      if(await realpath(path)!==path)throw new Error('native installed directory is redirected');
      emit(['directory',prefix,mode]);
      for(const name of (await readdir(path)).sort())await visit(join(path,name),prefix?prefix+'/'+name:name,depth+1);
    }else if(before.isFile()){
      if(before.size>bounds.fileBytes||before.size>bounds.bytes-bytes)throw new RangeError('native installed tree byte bound exceeded');
      const body=await stableBytes(path,bounds.fileBytes);bytes+=body.length;files++;emit(['file',prefix,mode,body.length,digest(body)]);
    }else throw new Error('native installed tree has unsupported entry kind');
    if(!stable(before,await lstat(path)))throw new Error('native installed tree changed during observation');
  }
  await visit(root,'',0);
  return {kind:'npm.native-installed-tree.identity.v1',sha256:hash.digest('hex'),entries,files,links,bytes,bounds,scope:'all actual native output; not independent transitive archive comparison'};
}

/** Produce the portable tree from this owner's received frozen registry consumer.
 * No resolver, source-provider substitution, generation or application execution.
 * LAGOON receives this completed tree and owns its immutable machine realization.
 */
export async function produceRegistryRuntime({consumerPath,receiving,destination,transferInstallation,receivingProfile}){
  if(transferInstallation!==true)throw new TypeError("runtime production requires explicit disposable installation custody transfer; dependency-tree copying is forbidden");
  if(receivingProfile!==undefined&&receivingProfile!=='native-initial-frozen')throw new TypeError('unsupported portable receiving profile');
  const initialFrozen=receivingProfile==='native-initial-frozen'||isNativeFrozenConsumerReceiving(receiving)||receiving?.receivingProfile==='native-initial-frozen';
  const started=performance.now();
  const source=resolve(consumerPath),output=resolve(destination),manifestPath=join(source,'package.json');
  if(inside(source,output)||inside(output,source))throw new TypeError('source and runtime must be independent directories');
  if(receiving?.kind!=='npm.source-registry-closure.consumers'||receiving.refusals?.length)
    throw new TypeError('successful native frozen consumer receiving required');
  const matches=receiving.packages.filter(row=>row.path===manifestPath&&row.frozenInstall===true);
  if(matches.length!==1)throw new TypeError('one exact received consumer required');
  const [manifestBytes,lockBytes]=await Promise.all([readFile(manifestPath),readFile(join(source,'pnpm-lock.yaml'))]);
  const [held]=matches,manifest=JSON.parse(manifestBytes);
  const workspacePolicy=await nativeRegistryWorkspacePolicy(source);
  const workspacePolicyDigest=workspacePolicy===null?null:digest(workspacePolicy);
  if(digest(manifestBytes)!==held.manifestDigest||digest(lockBytes)!==held.lockDigest
    ||manifest.name!==held.name||manifest.version!==held.version)
    throw new Error('received consumer declarations changed');
  if(held.workspacePolicyDigest!==undefined&&held.workspacePolicyDigest!==workspacePolicyDigest)
    throw new Error('received consumer workspace policy changed');
  // A portable runtime is itself a distributable frozen carrier. Reuse the
  // original publisher's exact-dependency law before receiving installed
  // versions; a workspace/range spec is NOT an exact pin and cannot be
  // silently skipped by an observer that only compares exact declarations.
  // No source mutation, installation, destination reservation or publication.
  publicationManifest(manifest);
  const modules=join(source,'node_modules');
  if(!(await lstat(modules)).isDirectory()||await realpath(modules)!==modules)
    throw new Error('received native installation is absent or redirected');
  // Mandatory exact manifest-to-native-install receiving precedes the
  // destination reservation, packing and any installation transfer. Unlike
  // the optional ESM graph assay, this covers ordinary consumers with no
  // registryConsumption.nodeEntrances (including the Group's live package).
  const installedDependencyPins=await assertRootInstalledDependencyPins({root:source,manifest});
  if(initialFrozen){
    if(manifest.registryConsumption?.frozenLockfile!=='./release/pnpm-lock.yaml'||manifest.exports?.['./frozen-lockfile']!=='./release/pnpm-lock.yaml')throw new TypeError('native initial-frozen portable consumer requires its original declared lock product');
    await reobserveNativeFrozenConsumer(receiving,{source,installationRoot:source});
  }
  const scratch=await mkdtemp(join(tmpdir(),'registry-runtime-'));
  let outputCreated=false,transferred=false,staticImports;
  try{
    // Reserve the caller's exact destination exclusively. A failed reservation
    // must neither damage a preexisting runtime nor leak the temporary pack.
    await mkdir(dirname(output),{recursive:true});
    await mkdir(output,{mode:0o700});
    outputCreated=true;
    // Reuse Code's bounded carrier staging. npm/Arborist scans the installed
    // dependency tree when invoked on the consumer itself, even when none of
    // those files belong in its package. Packing must not rediscover that tree.
    const plan={complete:true,registry:manifest.publishConfig?.registry??'https://registry.561.group/',packages:[{
      name:manifest.name,path:manifestPath,from:manifest.version,manifest,
      publish:true,rewrites:[],missingTargets:[],violations:[]}]};
    await prepareSourceRegistryCarriers(plan);
    const packing=await packSourceRegistryClosure(plan,{destination:scratch});
    if(packing.refusals.length||packing.packages.length!==1)throw new Error('consumer carrier packing refused');
    const [packed]=packing.packages,artifact=packed.artifact;
    if(!packed||packed.name!==manifest.name||packed.version!==manifest.version
      ||'sha512-'+createHash('sha512').update(await readFile(artifact)).digest('base64')!==packed.integrity)
      throw new Error('native consumer pack does not match its declarations');
    await run('tar',['-xzf',artifact,'-C',output,'--strip-components=1'],{timeout:60_000,maxBuffer:1024*1024});
    if(held.workspacePolicyDigest!==undefined&&await nativeRegistryWorkspacePolicy(output)!==workspacePolicy)
      throw new Error('packed consumer omits or changes its received workspace policy');
    const entrances=manifest.registryConsumption?.nodeEntrances;
    if(entrances!==undefined){
      const link=join(output,'node_modules');
      await symlink(modules,link,'dir');
      try{
        const {stdout}=await run(process.execPath,['--experimental-vm-modules','--experimental-import-meta-resolve',fileURLToPath(new URL('../scripts/read-native-registry-imports.mjs',import.meta.url)),output,JSON.stringify(entrances)],{timeout:60000,maxBuffer:16*1024*1024});
        staticImports=JSON.parse(stdout);
        if(staticImports.findings.length){
          throw new Error('declared Node composition has unresolved static imports: '+JSON.stringify(staticImports.findings));
        }
      }finally{await unlink(link);}
    }
    // The native receiver owns a disposable installation. Move that exact tree
    // once; never duplicate its dependency payload or fall back on EXDEV.
    await rename(modules,join(output,'node_modules'));transferred=true;
    // Audit real link topology once; never copy a link to an authoring checkout
    // or shared install outside this completed portable runtime.
    const pending=[output];let files=0;
    while(pending.length){
      const dir=pending.pop();
      for(const entry of await readdir(dir,{withFileTypes:true})){
        const file=join(dir,entry.name);files++;
        if(entry.isSymbolicLink()){
          if(!inside(output,await realpath(file)))throw new Error('portable runtime link leaves its received closure');
        }else if(entry.isDirectory())pending.push(file);
        else if(!entry.isFile())throw new Error('portable runtime contains a nonregular carrier');
      }
    }
    if(digest(await readFile(manifestPath))!==held.manifestDigest||digest(await readFile(join(source,'pnpm-lock.yaml')))!==held.lockDigest)
      throw new Error('consumer changed during portable construction');
    if(await nativeRegistryWorkspacePolicy(source)!==workspacePolicy)
      throw new Error('consumer workspace policy changed during portable construction');
    let installedArtifactReceiving;
    if(initialFrozen){
      if(!isDeepStrictEqual(JSON.parse(await readFile(join(output,'package.json'),'utf8')),manifest)
        ||digest(await readFile(join(output,'release/pnpm-lock.yaml')))!==held.lockDigest)
        throw new Error('portable consumer differs from its original manifest or declared lock product');
      await assertRootInstalledDependencyPins({root:output,manifest});
      installedArtifactReceiving=await reobserveNativeFrozenConsumer(receiving,{source,installationRoot:output});
    }
    return {kind:'npm.registry-runtime.produced',source,output,name:held.name,version:held.version,
      manifestDigest:held.manifestDigest,lockDigest:held.lockDigest,workspacePolicyDigest,rootIntegrity:packed.integrity,files,installedDependencyPins,...(installedArtifactReceiving?{receivingProfile:'native-initial-frozen',installedArtifactReceiving}:{}),...(staticImports?{staticImports}:{}),durationMs:Math.ceil(performance.now()-started),...(transferred?{installationTransferred:true}:{})};
  }catch(error){
    if(transferred){
      try{
        try{await lstat(modules);throw new Error('source installation reappeared during transfer');}
        catch(cause){if(cause.code!=='ENOENT')throw cause;}
        await rename(join(output,'node_modules'),modules);
      }catch(rollback){throw new AggregateError([error,rollback],'runtime transfer failed; installation rollback requires attention');}
    }
    // Only remove a destination this invocation successfully created. After
    // an installation transfer rollback failure, execution exits above and
    // retains the received bytes for the real operator to recover.
    if(outputCreated){
      try{await rm(output,{recursive:true,force:true});}
      catch(cleanupError){throw new AggregateError([error,cleanupError],'portable runtime output cleanup failed');}
    }
    throw error;
  }finally{await rm(scratch,{recursive:true,force:true});}
}
