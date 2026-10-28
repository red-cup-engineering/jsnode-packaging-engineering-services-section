// Construct a distinct native Code supplier from the exact original package.
import {constants} from 'node:fs';
import {lstat,readFile,readdir,realpath,mkdir,writeFile,chmod} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,isAbsolute,join,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {UPSTREAM_DISTRIBUTION_SHA256,UPSTREAM_INVENTORY_SHA256,
  PATCHED_DISTRIBUTION_SHA256,PATCHED_INVENTORY_SHA256,patchNativeDistribution} from './native-provider-patch.mjs';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const RECEIPT='.native-provider-construction.json';
const MANIFEST='2dd7bab34254562873ed6a748748f7259b727b143c2f8cca9966069cfdcae800';
const ENTRY='ff3224d46b47fbb24a7e9fe15fededef7e00892d07d4e376b6762d4899906bfd';
const between=(parent,child)=>{const r=relative(parent,child);return r===''||r!=='..'&&!r.startsWith('../')&&!isAbsolute(r);};
async function originalFile(path,limit) {
  const stat=await lstat(path);
  if(!stat.isFile()||stat.size>limit||await realpath(path)!==path)throw new TypeError('native provider member is redirected or exceeds its bound');
  const bytes=await readFile(path);
  if(bytes.length!==stat.size)throw new Error('native provider member changed');
  return bytes;
}
async function payload(directory,{constructed=false}={}) {
  if(typeof directory!=='string'||!isAbsolute(directory)||await realpath(directory)!==directory
    ||!(await lstat(directory)).isDirectory())throw new TypeError('explicit original provider directory required');
  const manifest=await originalFile(join(directory,'package.json'),1048576);
  const entry=await originalFile(join(directory,'bin/pnpm.mjs'),1048576);
  const distribution=await originalFile(join(directory,'dist/pnpm.mjs'),67108864);
  if(digest(manifest)!==MANIFEST||digest(entry)!==ENTRY
    ||digest(distribution)!==(constructed?PATCHED_DISTRIBUTION_SHA256:UPSTREAM_DISTRIBUTION_SHA256))
    throw new TypeError('native provider input identity is not selected');
  const members=[];let bytes=0;
  const walk=async(dir,scope='')=>{
    const entries=(await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
    for(const entry of entries){
      const path=scope?scope+'/'+entry.name:entry.name;
      if(constructed&&path===RECEIPT)continue;
      if(members.length>=10000)throw new TypeError('native provider member bound exceeded');
      const address=join(dir,entry.name),stat=await lstat(address);
      if(stat.isDirectory()){members.push({path,kind:'directory'});await walk(address,path);}
      else if(stat.isFile()){
        bytes+=stat.size;if(bytes>67108864)throw new TypeError('native provider payload byte bound exceeded');
        const body=await originalFile(address,67108864);
        members.push({path,kind:'file',bytes:body.length,executable:(stat.mode&0o111)!==0,sha256:digest(body)});
      }else throw new TypeError('linked or special provider members cannot form this product');
    }
  };
  await walk(directory);
  const inventorySHA256=digest(JSON.stringify(members));
  if(members.length!==559||inventorySHA256!==(constructed?PATCHED_INVENTORY_SHA256:UPSTREAM_INVENTORY_SHA256))
    throw new TypeError('complete native provider payload differs from its selected source');
  return {members,bytes,inventorySHA256,distribution};
}
export async function receiveConstructedNativeProvider(directory) {
  const received=await payload(directory,{constructed:true});
  const receipt=JSON.parse(await originalFile(join(directory,RECEIPT),1048576));
  if(receipt.kind!=='pnpm.native-provider-construction/v1'
    ||receipt.input.manifestSHA256!==MANIFEST||receipt.input.entry!=='bin/pnpm.mjs'||receipt.input.entrySHA256!==ENTRY
    ||receipt.input.inventorySHA256!==UPSTREAM_INVENTORY_SHA256
    ||receipt.input.distributionSHA256!==UPSTREAM_DISTRIBUTION_SHA256
    ||receipt.product.inventorySHA256!==PATCHED_INVENTORY_SHA256
    ||receipt.product.distributionSHA256!==PATCHED_DISTRIBUTION_SHA256
    ||receipt.product.members!==559||receipt.installationClaimed!==false||receipt.publicationClaimed!==false)
    throw new TypeError('original provider construction receipt is not bound to the actual payload');
  return {inventorySHA256:received.inventorySHA256,members:received.members.length,bytes:received.bytes,
    receiptSHA256:digest(await originalFile(join(directory,RECEIPT),1048576))};
}
export async function constructNativeProvider(input) {
  if(!input||Object.getPrototypeOf(input)!==Object.prototype
    ||Object.keys(input).sort().join(',')!=='outputDirectory,sourceDirectory')
    throw new TypeError('construction requires only original source and exclusive output directories');
  if(!/^[0-9a-f]{64}$/u.test(PATCHED_DISTRIBUTION_SHA256)||!/^[0-9a-f]{64}$/u.test(PATCHED_INVENTORY_SHA256))
    throw new TypeError('the constructed provider source digest remains unreceived');
  const {sourceDirectory,outputDirectory}=input;
  if(typeof outputDirectory!=='string'||!isAbsolute(outputDirectory)||resolve(outputDirectory)!==outputDirectory)
    throw new TypeError('absolute canonical output directory required');
  const source=await payload(sourceDirectory),parent=dirname(outputDirectory),parentStat=await lstat(parent);
  if(await realpath(parent)!==parent||!parentStat.isDirectory()||parentStat.uid!==process.getuid()||(parentStat.mode&0o022)!==0
    ||between(sourceDirectory,outputDirectory)||between(outputDirectory,sourceDirectory))
    throw new TypeError('construction needs a separate original owned output parent');
  const patched=patchNativeDistribution(source.distribution);
  if(digest(patched)!==PATCHED_DISTRIBUTION_SHA256)throw new TypeError('native distribution recipe differs from received output');
  await mkdir(outputDirectory,{mode:0o700});
  try{
    for(const member of source.members){
      const destination=join(outputDirectory,member.path);
      if(member.kind==='directory'){await mkdir(destination,{mode:0o700});continue;}
      let bytes=await originalFile(join(sourceDirectory,member.path),67108864);
      if(digest(bytes)!==member.sha256||bytes.length!==member.bytes)throw new Error('original provider changed during construction');
      if(member.path==='dist/pnpm.mjs')bytes=patched;
      await writeFile(destination,bytes,{flag:'wx',mode:member.executable?0o755:0o644});
    }
    await payload(sourceDirectory);
    const receipt={kind:'pnpm.native-provider-construction/v1',input:{directory:sourceDirectory,
      manifestSHA256:MANIFEST,entry:'bin/pnpm.mjs',entrySHA256:ENTRY,
      inventorySHA256:UPSTREAM_INVENTORY_SHA256,distributionSHA256:UPSTREAM_DISTRIBUTION_SHA256,
      members:source.members.length,bytes:source.bytes},recipe:{moduleSHA256:digest(await readFile(fileURLToPath(import.meta.url))),
      patchModuleSHA256:digest(await readFile(new URL('./native-provider-patch.mjs',import.meta.url))),
      sharedMetadataBytes:8388608,verifierMetadataBytes:8388608,sharedTTLms:120000,verificationConcurrency:'selected networkConcurrency'},
      product:{directory:outputDirectory,inventorySHA256:PATCHED_INVENTORY_SHA256,distributionSHA256:PATCHED_DISTRIBUTION_SHA256,members:559},
      installationClaimed:false,publicationClaimed:false};
    await writeFile(join(outputDirectory,RECEIPT),JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o444});
    const received=await receiveConstructedNativeProvider(outputDirectory);
    for(const member of source.members.filter(x=>x.kind==='file'))
      await chmod(join(outputDirectory,member.path),member.executable?0o555:0o444);
    for(const member of [...source.members].reverse().filter(x=>x.kind==='directory'))
      await chmod(join(outputDirectory,member.path),0o555);
    await chmod(outputDirectory,0o555);
    return {kind:'pnpm.native-provider-product/v1',directory:outputDirectory,entry:join(outputDirectory,'bin/pnpm.mjs'),
      ...received,distributionSHA256:PATCHED_DISTRIBUTION_SHA256,installationClaimed:false,publicationClaimed:false};
  }catch(error){error.retainedPartialProduct={directory:outputDirectory,received:false};throw error;}
}
