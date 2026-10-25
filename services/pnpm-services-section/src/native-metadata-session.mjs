import { boundedClone } from './native-metadata-data.mjs';
import { mkdir, open, readFile, realpath, lstat, readdir } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { isDeepStrictEqual } from 'node:util';
import { projectNativeMetadataQuery, receiveNativeMetadataFile } from './native-metadata-preparation.mjs';
import { provider, regular, hash } from './native-provider.mjs';
import { receiveMetadataConfigurationProfile } from './native-hook-profile.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const own = (value, allowed, required = allowed) => {
  if (!value || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError('own data record required');
  for (const key of Reflect.ownKeys(value)) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !allowed.includes(key) || !d.enumerable || !('value' in d)) throw new TypeError('unsupported data field');
  }
  if (required.some(key => !Object.hasOwn(value, key))) throw new TypeError('required data field absent');
};
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const copy = value => JSON.parse(JSON.stringify(value));
import { receiveNativeTransportEnvironment as receiveEnvironment } from './native-transport-environment.mjs';
export { receiveNativeTransportEnvironment } from './native-transport-environment.mjs';

async function absent(path) {
  try { await lstat(path); throw new TypeError('fresh native mirror must be absent'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
async function directory(path) {
  if (typeof path !== 'string' || !isAbsolute(path) || await realpath(path) !== path || !(await lstat(path)).isDirectory()) throw new TypeError('real existing private directory required');
}
async function sourceIdentity() {
  const files = ['package.json','src/native-metadata-session.mjs','src/native-metadata-data.mjs','src/native-transport-environment.mjs','src/native-metadata-preparation.mjs','src/native-provider.mjs','src/native-hook-profile.mjs'];
  const local = [];
  for (const path of files) local.push({path:join(root,path),sha256:hash(await regular(join(root,path),1048576))});
  const resolved = createRequire(import.meta.url).resolve('semver/package.json'), manifestPath = await realpath(resolved), dependencyRoot = dirname(manifestPath);
  const manifest = JSON.parse(await regular(manifestPath,1048576));
  if (manifest.name !== 'semver' || manifest.version !== '7.7.2' || Object.keys(manifest.dependencies ?? {}).length) throw new TypeError('qualified semver source required');
  const dependency = []; let total = 0, directories = 0;
  async function visit(dir) {
    if (++directories > 128) throw new TypeError('semver directory bound exceeded');
    for (const entry of await readdir(dir,{withFileTypes:true})) {
      const path = join(dir,entry.name);
      if (entry.isSymbolicLink()) throw new TypeError('redirected semver source');
      if (entry.isDirectory()) await visit(path);
      else if (entry.name.endsWith('.js') || entry.name==='package.json') {
        const bytes = await regular(path,1048576); total += bytes.length;
        if (dependency.length >= 256 || total > 1048576) throw new TypeError('semver closure bound exceeded');
        dependency.push({path,sha256:hash(bytes)});
      }
    }
  }
  await visit(dependencyRoot); dependency.sort((a,b)=>a.path.localeCompare(b.path));
  return {local,dependency,binding:{resolved,manifestPath}};
}
async function receipt(s, name, value) {
  await directory(s.receipts);
  const text = JSON.stringify(value,null,2)+'\n';
  if (Buffer.byteLength(text)>16*1024*1024) throw new TypeError('phase receipt bound exceeded');
  const path = join(s.receipts,name+'.json'); const handle = await open(path,'wx',0o600);
  try { await handle.writeFile(text); } finally { await handle.close(); }
  if ((await regular(path,16*1024*1024)).toString('utf8') !== text) throw new TypeError('phase receipt readback differs');
  return {path,bytes:Buffer.byteLength(text),sha256:hash(text)};
}

/** Executor-free source service. Issued requests are not process authenticity or replay prevention. */
export function createNativeMetadataPreparationService() {
  const sessions = new WeakMap();
  const state = ticket => { const s=sessions.get(ticket); if(!s) throw new TypeError('foreign metadata ticket'); return s; };
  async function custody(s) {
    await directory(dirname(s.query.directory));
    await directory(s.query.cacheDirectory);
    await directory(s.receipts);
    await provider(s.program,[s.entry],s.query.directory,s.provider,false);
    if (!isDeepStrictEqual(s.source,await sourceIdentity())) throw new TypeError('metadata supplier changed');
    if (!isDeepStrictEqual(s.profile,await receiveMetadataConfigurationProfile(s.query,s.environment.values))) throw new TypeError('metadata configuration changed');
    for (const file of s.environmentFiles) if(hash(await regular(file.path,1048576))!==file.sha256) throw new TypeError('environment file changed');
    const builtin=await regular(s.builtin.path,1048576); if(hash(builtin)!==s.builtin.sha256) throw new TypeError('builtin config changed');
  }
  return Object.freeze({kind:'pnpm.native-metadata-preparation.service.v1',
    async prepare(input) {
      own(input,['program','entry','query','receiptDirectory','environment','environmentPolicy','limits']);
      own(input.limits,['timeoutMilliseconds','outputLimit']);
      if(input.limits.timeoutMilliseconds!==45000 || input.limits.outputLimit!==1048576) throw new TypeError('qualified metadata limits required');
      own(input.query,['name','selections','policy','canonical','registry','directory','cacheDirectory']);
      const query=projectNativeMetadataQuery(input.query), environment=receiveEnvironment(input.environment,input.environmentPolicy);
      const source=await sourceIdentity();
      await directory(dirname(query.directory)); await directory(input.receiptDirectory); await directory(query.cacheDirectory);
      await absent(query.directory); await absent(query.expectedMirrorPath);
      // Exact provider source identity only, never a version command.
      const native=await provider(input.program,[input.entry],dirname(query.directory),undefined,false);
      const builtinPath=join(dirname(dirname(native.provider.entry)),'dist','pnpmrc'), builtinBytes=await regular(builtinPath,1048576);
      if(builtinBytes.toString('utf8').split('\n').some(line=>line.trim()&&!line.trim().startsWith('#'))) throw new TypeError('unsupported builtin metadata configuration');
      const environmentFiles=[];
      for(const key of ['NODE_EXTRA_CA_CERTS','SSL_CERT_FILE']) if(environment.values[key]) environmentFiles.push({path:environment.values[key],sha256:hash(await regular(environment.values[key],1048576))});
      await mkdir(query.directory,{mode:0o700});
      for(const [name,text]of Object.entries(query.files)) {const handle=await open(join(query.directory,name),'wx',0o600);try{await handle.writeFile(text);}finally{await handle.close();}}
      const profile=await receiveMetadataConfigurationProfile(query,environment.values);
      const s={phase:'prepared-producer',busy:false,query,environment,environmentPolicy:freeze(copy(input.environmentPolicy)),environmentFiles,
        source,provider:native,program:input.program,entry:input.entry,receipts:input.receiptDirectory,limits:freeze(copy(input.limits)),profile,builtin:{path:builtinPath,sha256:hash(builtinBytes)}};
      const saved=await receipt(s,'prepared',{kind:'pnpm.metadata.prepared.v1',query,provider:native,source,profile,environment:environment.identity});
      const ticket=Object.freeze({kind:'pnpm.metadata.ticket.v1'});sessions.set(ticket,s);
      return freeze({ticket,projection:query,prepared:saved,provider:native});
    },
    async revalidate(ticket,input) {
      const s=state(ticket);own(input,['phase','environment']);
      const expected=input.phase==='producer'?'prepared-producer':input.phase==='reader'?'producer-received':null;
      if(!expected||s.phase!==expected||s.busy) throw new TypeError('metadata launch transition refused');
      s.busy=true;
      try {
        const environment=receiveEnvironment(input.environment,s.environmentPolicy); s.environment=environment;
        await custody(s);
        if(input.phase==='producer') await absent(s.query.expectedMirrorPath);
        else {const mirror=await receiveNativeMetadataFile(s.query);if(!mirror.fileObserved||mirror.sha256!==s.mirror.sha256)throw new TypeError('received metadata changed');}
        const request=freeze({type:'JavascriptNodeCommandExecutionRequest',version:1,command:s.program,
          arguments:[s.entry,...s.query.arguments,...(input.phase==='reader'?['--config.offline=true']:[])],directory:s.query.directory,environment:environment.values,input:null});
        await receipt(s,input.phase+'-launch',{kind:'pnpm.metadata.launch-intent.v1',phase:input.phase,projectionSHA256:s.query.projectionSHA256,requestSHA256:hash(JSON.stringify(request)),environment:environment.identity});
        s.request=request;s.phase=input.phase+'-in-flight';return freeze({request,policy:s.limits});
      } catch(error){s.phase='failed';throw error;} finally{s.busy=false;}
    },
    async receive(ticket,input) {
      const s=state(ticket);own(input,['phase','executionReceipt','uncertain'],['phase']);
      if(!['producer','reader'].includes(input.phase)||s.phase!==input.phase+'-in-flight'||s.busy)throw new TypeError('metadata receiving transition refused');
      s.busy=true;
      try {
        if(input.uncertain===true){s.phase='unknown';return freeze({accepted:false,state:'unknown',receipt:await receipt(s,input.phase+'-unknown',{kind:'pnpm.metadata.unknown.v1',phase:input.phase})});}
        const execution=boundedClone(input.executionReceipt,16*1024*1024,1048576);
        own(execution,['type','version','request','result']);
        if(execution.type!=='JavascriptNodeCommandExecutionReceipt'||execution.version!==1||!isDeepStrictEqual(execution.request,s.request)) throw new TypeError('native receipt request mismatch');
        const native=execution.result;
        own(native,['type','version','status','signal','stdout','stderr','error']);
        if(native.type!=='JavascriptNodeCommandExecutionResult'||native.version!==1||typeof native.error!=='string'||!(native.status===null||Number.isInteger(native.status))||!(native.signal===null||typeof native.signal==='string'))throw new TypeError('native result contract mismatch');
        if(typeof native.stdout!=='string'||typeof native.stderr!=='string'||native.stdout.length>s.limits.outputLimit||native.stderr.length>s.limits.outputLimit)throw new TypeError('bounded native output required');
        // Original error/result preserved privately even if later custody fails.
        const raw=await receipt(s,input.phase+'-execution',execution);
        let custodyStatus='unchanged';try{await custody(s);}catch{custodyStatus='changed-or-unread';}
        const complete=native.stdout.length<s.limits.outputLimit&&native.stderr.length<s.limits.outputLimit;
        let parsed=null;try{if(complete)parsed=JSON.parse(native.stdout);}catch{}
        const mirror=await receiveNativeMetadataFile(s.query);
        const accepted=custodyStatus==='unchanged'&&complete&&native.signal===null&&native.error===''&&[0,1].includes(native.status)
          &&parsed&&typeof parsed==='object'&&!Array.isArray(parsed)&&parsed[s.query.name]?.wanted===s.query.representative&&mirror.fileObserved
          &&(input.phase==='producer'||mirror.sha256===s.mirror.sha256);
        s.phase=accepted?(input.phase==='producer'?'producer-received':'complete'):'failed';if(accepted)s.mirror=mirror;
        const evidence={kind:'pnpm.metadata.received.v1',phase:input.phase,state:s.phase,accepted:Boolean(accepted),native:{status:native.status,signal:native.signal,errorPresent:native.error!==''},outputComplete:complete,custody:custodyStatus,raw,mirror,strictPolicyVerified:false,installationReceived:false};
        return freeze({...evidence,receipt:await receipt(s,input.phase+'-received',evidence)});
      }catch(error){s.phase='failed';throw error;}finally{s.busy=false;}
    }
  });
}
