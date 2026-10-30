// Resource admission at the original package composer. These observations are
// not quotas, reservations, or proofs of a native physical-write upper bound.
import {statfs,readFile} from 'node:fs/promises';
import {isDeepStrictEqual} from 'node:util';
import {own,clone,identity,bytes,directory,sha} from './native-worker-custody.mjs';
export async function observeNativePackageMemory(requiredBytes) {
 const mem=await readFile('/proc/meminfo','utf8'),hostAvailableBytes=Number(/^MemAvailable:\s+(\d+)/mu.exec(mem)?.[1])*1024;
 let cgroup=null;
 try {const maximum=(await readFile('/sys/fs/cgroup/memory.max','utf8')).trim(),current=Number((await readFile('/sys/fs/cgroup/memory.current','utf8')).trim());
  if(maximum!=='max'){const limit=Number(maximum);if(!Number.isSafeInteger(limit)||!Number.isSafeInteger(current))throw new TypeError('invalid original memory observation');cgroup={limit,current,available:Math.max(0,limit-current)};}}
 catch(error){if(!['ENOENT','ENOTDIR'].includes(error.code))throw error;}
 const availableBytes=Math.min(hostAvailableBytes,cgroup?.available??Infinity);
 if(!Number.isSafeInteger(availableBytes)||availableBytes<requiredBytes)throw new TypeError('fresh bounded memory headroom unreceived');
 return {at:Date.now(),hostAvailableBytes,cgroup,availableBytes,requiredBytes,reservation:false,hardProcessLimit:false};
}
export const observedHeadroomProfile='observed-headroom-v1';
const safe=(n)=>Number.isSafeInteger(n)&&n>=0;
export function deriveNativePackageResourceRequirements(input){
 const rows=clone(input);
 if(!Array.isArray(rows)||!rows.length||rows.length>4096)throw new TypeError('finite native resource rows required');
 let expanded=0,headers=0,receiptBytes=0,maxArchive=0,projection=false;
 for(const r of rows){own(r,['archive','receipt','expandedBytes','headerCount','registryProjectionPolicy'],['archive','receipt','expandedBytes','headerCount']);if(r.registryProjectionPolicy!==undefined){if(r.registryProjectionPolicy!=='registry-projection-consumer-v2')throw new TypeError('unsupported native resource projection policy');projection=true;}own(r.archive,['path','bytes','sha256']);own(r.receipt,['path','bytes','sha256']);if(typeof r.archive.path!=='string'||typeof r.receipt.path!=='string'||!safe(r.archive.bytes)||r.archive.bytes>67108864||!/^[a-f0-9]{64}$/u.test(r.archive.sha256)||!/^[a-f0-9]{64}$/u.test(r.receipt.sha256))throw new TypeError('exact bounded native resource identity required');if(!safe(r.expandedBytes)||r.expandedBytes>268435456||!safe(r.headerCount)||r.headerCount>100000||!safe(r.receipt.bytes)||r.receipt.bytes>16777216)throw new TypeError('bounded native resource row required');expanded+=r.expandedBytes;headers+=r.headerCount;receiptBytes+=r.receipt.bytes;maxArchive=Math.max(maxArchive,r.expandedBytes);}
 const requiredFreeBytes=expanded*4+67108864,requiredFreeInodes=headers*4+rows.length*32+1024;
 if(![expanded,headers,receiptBytes,requiredFreeBytes,requiredFreeInodes].every(safe)||headers>65536||expanded>1073741824||receiptBytes>67108864)throw new TypeError('bounded aggregate native resource metadata required');
 return {algorithm:'native-package-observed-headroom-v1',archives:rows.length,expandedArchiveBytes:expanded,headers,retainedReceiptBytes:receiptBytes,requiredFreeBytes,requiredFreeInodes,requiredMemoryBytes:Math.max(536870912,maxArchive*3+rows.length*1048576+(projection?134217728+3*receiptBytes:0)),estimateOnly:true,quota:false,reservation:false,installedTreeBounds:{paths:65536,bytes:1073741824},completeInstalledFootprintProved:false};
}
export async function observeNativePackageResourceCapacity(context,rows){
 const requirements=deriveNativePackageResourceRequirements(rows);
 await observeNativePackageMemory(requirements.requiredMemoryBytes);
 // Reconstruct every numeric requirement from the retained ORIGINAL reader
 // observation, rather than trusting a supplied compact summary or success DTO.
 for(const row of rows){
  if(!isDeepStrictEqual(row.archive,await identity(row.archive.path,67108864))||!isDeepStrictEqual(row.receipt,await identity(row.receipt.path,16777216)))throw new TypeError('native content resource identity changed');
  const held=JSON.parse(await bytes(row.receipt.path)),o=held.observation;
  const rawCount=row.registryProjectionPolicy===undefined?o?.headers?.length:(Array.isArray(held.sourceArchive?.occurrences)&&Array.isArray(held.sourceArchive?.extensions)?held.sourceArchive.occurrences.length+held.sourceArchive.extensions.length:NaN);
  if(row.registryProjectionPolicy!==undefined&&(o?.kind!=='npm.native-registry-archive-projection'||held.sourceArchive.rawInventorySHA256!==o.rawInventorySHA256||held.projection?.projectionSHA256!==o.projectionSHA256||held.sourceArchive.expandedSHA256!==o.expandedSHA256))throw new TypeError('native projection resource proof differs from original receipt');
  if(!isDeepStrictEqual(held.archiveIdentity,row.archive)||o?.path!==row.archive.path||o?.archiveSHA256!==row.archive.sha256||o?.extracted!==false||o?.installationClaimed!==false||!Array.isArray(o.headers)||rawCount!==row.headerCount||o.expandedBytes!==row.expandedBytes)throw new TypeError('native content resource summary differs from original receipt');
 }
 const locations={source:context.cwd,cache:context.cacheRoot,receipts:context.attemptDirectory,temporary:context.environment.TMPDIR??context.environment.TEMP??context.environment.TMP};
 const filesystems=[];
 for(const[role,path]of Object.entries(locations)){
  if(typeof path!=='string')throw new TypeError('explicit native resource temporary directory required');
  const root=await directory(path,role==='cache'||role==='receipts'),fs=await statfs(path),availableBytes=fs.bavail*fs.bsize,freeInodes=fs.ffree;
  if(!safe(availableBytes)||!safe(freeInodes)||availableBytes<requirements.requiredFreeBytes||freeInodes<requirements.requiredFreeInodes)throw new TypeError('fresh observed native disk or inode headroom unreceived');
  filesystems.push({role,directory:root,availableBytes,freeInodes});
 }
 // Multiple roles on one device are ONE shared observation, never allocations
 // whose free bytes can be summed. The conservative same estimate is checked on
 // each distinct filesystem; no split or hardlink savings are assumed.
 const memory=await observeNativePackageMemory(requirements.requiredMemoryBytes);
 return {profile:observedHeadroomProfile,at:Date.now(),requirements,filesystems,memory,assumptions:{soleWriter:true,concurrentFilesystemConsumersExcluded:false,headroomCanChange:true,sharedDevicesAreNotIndependentAllocations:true,nativeWriteUpperBoundProved:false},inputsSHA256:sha(JSON.stringify(clone(rows)))};
}
