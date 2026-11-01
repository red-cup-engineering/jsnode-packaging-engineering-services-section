import { lstat, mkdir, readFile, realpath, rename, rmdir, symlink, unlink, link, open, mkdtemp, readlink } from "node:fs/promises";
import { constants } from "node:fs";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { dependencySpecificationViolations, isExactSemver } from "./dependency-policy.mjs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

const INSTALL_COMMAND = /\bnpm\s+(?:ci|install|i)\b/u;
const JOURNAL = 'source-bindings.intent.json';
const INTENT = 'code.source-bindings.intent.v1';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const identity = stat => ({dev:stat.dev,ino:stat.ino,uid:stat.uid});
const sameIdentity = (a,b) => a.dev===b.dev && a.ino===b.ino && a.uid===b.uid;
async function statOrNull(path) {
  try { return await lstat(path); } catch(error) { if(error.code==='ENOENT')return null; throw error; }
}
function within(root, path) {
  const relation = relative(root, path);
  return relation === '' || (!relation.startsWith('..'+sep) && relation !== '..' && !isAbsolute(relation));
}
function packageTarget(directory, name) {
  if (name.startsWith('@')) { const [scope,leaf]=name.split('/'); return join(directory,'node_modules',scope,leaf); }
  return join(directory,'node_modules',name);
}
async function canonicalDirectory(path) {
  if(typeof path!=='string'||!isAbsolute(path)||resolve(path)!==path||path.split(sep).includes('.local'))
    throw new TypeError('explicit canonical source binding directory required');
  const stat=await lstat(path);
  if(!stat.isDirectory()||stat.isSymbolicLink()||await realpath(path)!==path)
    throw new TypeError('source binding directory is redirected: '+path);
  return stat;
}
function parentPaths(root,target) {
  if(!within(root,target)||root===target)throw new TypeError('source binding target escapes its consumer');
  const result=[root];
  let at=root;
  for(const part of relative(root,dirname(target)).split(sep).filter(Boolean)){at=join(at,part);result.push(at);}
  return result;
}
async function mutableDirectory(path) {
  const stat=await canonicalDirectory(path);
  if(typeof process.getuid!=='function'||stat.uid!==process.getuid()||(stat.mode&0o022)!==0)
    throw new TypeError('source binding mutable parent must be owned and not group/other writable: '+path);
  return stat;
}
async function receiveParents(root,target,{create=false}={}) {
  const rows=[];
  for(const path of parentPaths(root,target)){
    const present=await statOrNull(path);
    if(!present){
      if(!create)continue;
      await mkdir(path,{mode:0o700});
      // Persist both the new directory and its parent entry before journaling.
      await syncDirectory(path);await syncDirectory(dirname(path));
    }
    const stat=await mutableDirectory(path);rows.push({path,...identity(stat)});
  }
  return rows;
}
async function manifestAt(directory) {
  const manifest=JSON.parse(await readFile(join(directory,'package.json'),'utf8'));
  if(typeof manifest.name!=='string'||typeof manifest.version!=='string')throw new TypeError('source binding package has no name/version');
  return manifest;
}
async function receiveBindingPlan(plan) {
  const providers=new Map(), targets=[];
  for(const pkg of plan.packages){
    await canonicalDirectory(pkg.dir);
    const manifest=await manifestAt(pkg.dir);
    if(manifest.name!==pkg.name||manifest.version!==pkg.version)throw new TypeError('planned source identity differs');
    for(const script of pkg.lifecycle)if(INSTALL_COMMAND.test(manifest.scripts?.[script]??''))
      throw new TypeError('source-bound verification refuses '+pkg.name+' lifecycle '+script+': npm installation is not permitted while bindings are active');
    providers.set(pkg.name,pkg);
  }
  for(const consumer of plan.packages)for(const name of plan.dependencies[consumer.name]??[]){
    const provider=providers.get(name);if(!provider)continue;
    const target=packageTarget(consumer.dir,name);
    if(target===join(consumer.dir,'node_modules')||!within(join(consumer.dir,'node_modules'),target))throw new TypeError('source binding target escapes node_modules');
    if(targets.some(x=>x.target===target))throw new TypeError('duplicate source binding target');
    // Receive every existing ancestor of every target before any mkdir/link.
    await receiveParents(consumer.dir,target);
    targets.push({target,provider:provider.dir,consumer:consumer.dir});
  }
  const planDigest=digest(JSON.stringify({packages:plan.packages.map(p=>({name:p.name,version:p.version,dir:p.dir,lifecycle:p.lifecycle})),
    dependencies:Object.entries(plan.dependencies).sort(([a],[b])=>a.localeCompare(b)),targets}));
  return {targets,planDigest};
}
async function ownedStateDirectory(directory) {
  const stat=await canonicalDirectory(directory);
  if(typeof process.getuid!=='function'||stat.uid!==process.getuid()||(stat.mode&0o077)!==0
    ||directory.split(sep).includes('.local'))throw new TypeError('explicit private owned source-binding state directory required');
  return stat;
}
async function syncDirectory(path) {
  const handle=await open(path,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
  try{await handle.sync();}finally{await handle.close();}
}
async function receiveLink(path,expected,provider) {
  const stat=await statOrNull(path);
  if(stat&&(!stat.isSymbolicLink()||!sameIdentity(stat,expected)||await readLink(path)!==provider))
    throw new Error('source binding ownership diverged; preserved: '+path);
  return stat;
}
async function readLink(path) { return readlink(path); }
async function receiveJournal(plan,directory) {
  await ownedStateDirectory(directory);
  const path=join(directory,JOURNAL),stat=await statOrNull(path);
  if(!stat)return null;
  if(!stat.isFile()||stat.isSymbolicLink()||stat.uid!==process.getuid()||(stat.mode&0o077)!==0||stat.nlink>2)
    throw new TypeError('source binding journal identity is foreign');
  const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  let bytes;
  try{if(!sameIdentity(await handle.stat(),stat))throw new Error('source binding journal changed');bytes=await handle.readFile();}
  finally{await handle.close();}
  const value=JSON.parse(bytes),received=await receiveBindingPlan(plan);
  if(value.schema!==INTENT||value.planDigest!==received.planDigest||value.directory!==directory
    ||value.uid!==process.getuid()||!Array.isArray(value.entries)||value.entries.length!==received.targets.length
    ||typeof value.generation?.path!=='string'||dirname(value.generation.path)!==directory
    ||!value.generation.path.startsWith(join(directory,'.source-bindings-')))
    throw new TypeError('source binding journal does not belong to the exact plan');
  const generation=await canonicalDirectory(value.generation.path);
  if(!sameIdentity(generation,value.generation))throw new Error('source binding generation ownership changed');
  for(const [index,entry] of value.entries.entries()){
    const selected=received.targets[index];
    if(entry.target!==selected.target||entry.provider!==selected.provider||entry.consumer!==selected.consumer
      ||entry.stage!==join(value.generation.path,index+'.link')||!Array.isArray(entry.parents))
      throw new TypeError('source binding journal target differs');
    const paths=parentPaths(entry.consumer,entry.target);
    if(entry.parents.length!==paths.length)throw new TypeError('source binding parent receipt is incomplete');
    for(const [i,parent] of entry.parents.entries()){
      if(parent.path!==paths[i]||!sameIdentity(await mutableDirectory(parent.path),parent))
        throw new Error('source binding parent ownership changed');
    }
    await receiveLink(entry.stage,entry.link,entry.provider);
    await receiveLink(entry.target,entry.link,entry.provider);
  }
  return {path,stat,bytes,value};
}

/** Restore one interrupted absent-target source context. The caller MUST hold
 * the same native exclusive lease used by every binder/recovery consumer. This
 * is filesystem custody, never a grant of execution/integration authority. */
export async function recoverSourceBindings(plan,{directory}={}) {
  const held=await receiveJournal(plan,directory);
  if(!held)return Object.freeze({kind:'code.source-bindings.recovery.v1',state:'NOT_RECORDED',restored:0});
  let restored=0;
  // All recorded ancestors and aliases were received before the first unlink.
  for(const entry of held.value.entries){
    if(await receiveLink(entry.target,entry.link,entry.provider)){await unlink(entry.target);restored++;await syncDirectory(dirname(entry.target));}
  }
  const current=await lstat(held.path);
  if(!sameIdentity(current,held.stat)||!(await readFile(held.path)).equals(held.bytes))throw new Error('source binding journal changed; preserved');
  await unlink(held.path);await syncDirectory(directory);
  // After the durable journal is removed all active aliases are absent. A crash
  // here leaves only inactive staging, never a blocking unknown active alias.
  for(const entry of held.value.entries)if(await receiveLink(entry.stage,entry.link,entry.provider))await unlink(entry.stage);
  const intent=join(held.value.generation.path,'intent.json');
  const intentStat=await statOrNull(intent);
  if(intentStat){if(!sameIdentity(intentStat,held.stat))throw new Error('staged journal changed; preserved');await unlink(intent);}
  await rmdir(held.value.generation.path);await syncDirectory(directory);
  return Object.freeze({kind:'code.source-bindings.recovery.v1',state:'RESTORED',restored});
}

async function withDurableBindings(plan,received,directory,run) {
  const state=await ownedStateDirectory(directory);
  if(plan.packages.some(pkg=>within(pkg.dir,directory)||within(directory,pkg.dir)))
    throw new TypeError('durable source binding state must be separate from source roots');
  await recoverSourceBindings(plan,{directory});
  // This opt-in contract only fills absent aliases; ordinary replacement remains
  // available through the original two-argument API below.
  for(const entry of received.targets)if(await statOrNull(entry.target))throw new Error('durable source binding target must be absent');
  const entries=[];
  for(const entry of received.targets){
    const parents=await receiveParents(entry.consumer,entry.target,{create:true});
    if(parents.at(-1).dev!==state.dev)throw new TypeError('durable staging and alias must share a filesystem');
    entries.push({...entry,parents});
  }
  const generation=await mkdtemp(join(directory,'.source-bindings-'));
  const generationStat=await canonicalDirectory(generation);await syncDirectory(directory);
  for(const [index,entry] of entries.entries()){
    entry.stage=join(generation,index+'.link');await symlink(entry.provider,entry.stage,'dir');entry.link=identity(await lstat(entry.stage));
  }
  const intent={schema:INTENT,directory,uid:process.getuid(),planDigest:received.planDigest,
    generation:{path:generation,...identity(generationStat)},entries};
  const intentPath=join(generation,'intent.json'),handle=await open(intentPath,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try{await handle.writeFile(JSON.stringify(intent)+'\n');await handle.sync();}finally{await handle.close();}
  await syncDirectory(generation);
  // A hard link installs the complete immutable intent without replacement.
  // There is no active alias before its received inode is durably recorded.
  await link(intentPath,join(directory,JOURNAL));await syncDirectory(directory);
  let result,failure;
  try{
    for(const entry of entries){await link(entry.stage,entry.target);await syncDirectory(dirname(entry.target));}
    result=await run();
  }catch(error){failure=error;}
  try{await recoverSourceBindings(plan,{directory});}catch(error){failure=failure?new AggregateError([failure,error],'source operation and custody both failed'):error;}
  if(failure)throw failure;return result;
}

/** Temporarily resolves exact source edges and restores original installations.
 * Optional durability only fills absent targets, under the caller's held native
 * lease, with explicit owned state; it is not an installed dependency graph. */
export async function withSourceBindings(plan,run,options=undefined) {
  if(typeof run!=='function')throw new TypeError('source-bound verification requires a callable operation');
  if(options!==undefined&&(!options||Object.keys(options).some(k=>k!=='durability')
    ||!options.durability||Object.keys(options.durability).some(k=>k!=='directory')))
    throw new TypeError('explicit source binding durability options required');
  const received=await receiveBindingPlan(plan);
  if(options?.durability)return withDurableBindings(plan,received,options.durability.directory,run);
  const bindings=[];let result,failure;
  try{
    for(const entry of received.targets){
      const parents=await receiveParents(entry.consumer,entry.target,{create:true});
      const prior=await statOrNull(entry.target),backup=entry.target+'.source-binding-backup-'+process.pid+'-'+bindings.length;
      if(await statOrNull(backup))throw new Error('source binding backup already present');
      const binding={...entry,parents,backup,prior:prior?identity(prior):null,renamed:false,link:null};bindings.push(binding);
      if(prior){await rename(entry.target,backup);binding.renamed=true;}
      await symlink(entry.provider,entry.target,'dir');binding.link=identity(await lstat(entry.target));
    }
    result=await run();
  }catch(error){failure=error;}
  try{
    for(const binding of bindings.reverse()){
      for(const parent of binding.parents)if(!sameIdentity(await mutableDirectory(parent.path),parent))
        throw new Error('source binding parent ownership changed; preserved');
      if(binding.link&&await receiveLink(binding.target,binding.link,binding.provider))await unlink(binding.target);
      else if(!binding.link&&await statOrNull(binding.target))throw new Error('unknown source binding target preserved');
      if(binding.renamed){
        const prior=await lstat(binding.backup);
        if(!sameIdentity(prior,binding.prior)||await statOrNull(binding.target))throw new Error('original installation ownership changed; preserved');
        await rename(binding.backup,binding.target);
      }
    }
  }catch(error){failure=failure?new AggregateError([failure,error],'source operation and custody both failed'):error;}
  if(failure)throw failure;return result;
}

const sourceDigest = bytes => createHash("sha256").update(bytes).digest("hex");
const activeDevelopmentRoots = new Set();

/** An authored test-host composition, never an amendment to a registry contract. */
export function developmentRootSelfRecipe(manifest) {
  const qa = manifest?.registryConsumption?.sourceQualification;
  if (qa === undefined) return null;
  if (qa?.kind !== "development-root-self" || !qa.testLibrary || !qa.selector
    || Object.keys(qa).some(key => !["kind", "testLibrary", "selector"].includes(key))
    || Object.keys(qa.testLibrary).some(key => !["name", "version", "peerVersion"].includes(key))
    || Object.keys(qa.selector).some(key => !["variable", "value"].includes(key)))
    throw new TypeError("source qualification must declare the development root-self context");
  if (typeof manifest.name !== "string" || !/^(?:@[a-z0-9._-]+\/[a-z0-9._-]+|[a-z0-9._-]+)$/u.test(manifest.name)
    || dependencySpecificationViolations(manifest).length || !isExactSemver(manifest.version))
    throw new TypeError("development source QA preserves the exact canonical dependency contract");
  for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"])
    if (Object.hasOwn(manifest[field] ?? {}, manifest.name))
      throw new TypeError("development self context is not a canonical dependency edge");
  const host = qa.testLibrary;
  if (typeof host.name !== "string" || host.name === manifest.name
    || manifest.devDependencies?.[host.name] !== host.version
    || !isExactSemver(host.version) || !isExactSemver(host.peerVersion)
    || ["dependencies", "optionalDependencies", "peerDependencies"].some(field => Object.hasOwn(manifest[field] ?? {}, host.name)))
    throw new TypeError("root-self test library must be one exact development-only supplier");
  if (!/^[A-Z][A-Z0-9_]{1,63}$/u.test(qa.selector.variable ?? "")
    || /^(?:NODE|NPM|PNPM|GIT|HTTP|HTTPS|ALL|NO|LD|DYLD)_/u.test(qa.selector.variable)
    || ["PATH", "HOME", "TMP", "TEMP", "TMPDIR", "SHELL", "BASH_ENV", "ENV"].includes(qa.selector.variable)
    || qa.selector.value !== host.name)
    throw new TypeError("development selector must name only the declared test library");
  if (manifest.exports?.["./package.json"] !== "./package.json")
    throw new TypeError("root-self QA requires the actual source identity export");
  return Object.freeze({ kind: qa.kind, testLibrary: Object.freeze({ ...host }), selector: Object.freeze({ ...qa.selector }) });
}

/** Receive the native peer diagnostic without converting a missing peer into
 * registry compatibility. Only the explicitly authored development edge may be
 * unresolved; every other peer issue remains a refusal. */
export function receiveDevelopmentRootSelfPeerReport(manifest, report) {
  const recipe = developmentRootSelfRecipe(manifest);
  if (!recipe || !report || typeof report !== "object" || Array.isArray(report)
    || Object.keys(report).length !== 1 || !Object.hasOwn(report, "."))
    throw new TypeError("development QA requires the complete native root peer report");
  const project = report["."], missing = project?.missing;
  const issue = missing?.[manifest.name];
  if (!project || Object.keys(project).some(key => !["bad", "missing", "conflicts", "intersections"].includes(key))
    || !project.bad || Object.keys(project.bad).length !== 0
    || !missing || Object.keys(missing).length !== 1
    || !Array.isArray(issue) || issue.length !== 1
    || issue[0]?.optional !== false || issue[0]?.wantedRange !== recipe.testLibrary.peerVersion
    || issue[0]?.parents?.length !== 1
    || issue[0].parents[0]?.name !== recipe.testLibrary.name
    || issue[0].parents[0]?.version !== recipe.testLibrary.version
    || !Array.isArray(project.conflicts) || project.conflicts.length !== 0
    || !project.intersections || Object.keys(project.intersections).length !== 1
    || project.intersections[manifest.name] !== recipe.testLibrary.peerVersion)
    throw new TypeError("development QA refuses undeclared or additional native peer issues");
  return Object.freeze({ kind: "npm.development-root-self.peer-frontier", nativeReport: report,
    authoredPeerSatisfied: false, registryPeerClosureReceived: false,
    selection: Object.freeze({ law: "explicit-development-root-self-source-qualification",
      consumer: recipe.testLibrary, provider: Object.freeze({ name: manifest.name, version: manifest.version }),
      scope: "Functional source interoperability assay; unchanged authored peer requirement remains unsatisfied" }) });
}

async function absent(path) {
  try { await lstat(path); return false; } catch (error) { if (error.code === "ENOENT") return true; throw error; }
}

async function unredirectedDirectory(path) {
  if (!(await lstat(path)).isDirectory() || await realpath(path) !== path)
    throw new TypeError("development source context directory is redirected: " + path);
}

// Each phase gets a fresh native resolver. A require.resolve cache populated by
// the old fallback must not be mistaken for the provider used by fresh tests.
async function nativeEsmResolution(directory, specifiers) {
  const { executeJavascriptNodeCommand } = await import("@red-cup-engineering/execute-javascript-node-command-service");
  if (!specifiers.length || specifiers.length > 2049) throw new TypeError("development source requires bounded public runtime subpaths");
  const source = `import {realpathSync} from 'node:fs';import {fileURLToPath} from 'node:url';
const resolve=specifier=>{try{return {specifier,path:realpathSync(fileURLToPath(import.meta.resolve(specifier)))};}catch(error){return {specifier,error:error.code};}};
console.log(JSON.stringify(JSON.parse(process.argv[1]).map(resolve)));`;
  const { result } = executeJavascriptNodeCommand({ type: "JavascriptNodeCommandExecutionRequest", version: 1,
    command: process.execPath, arguments: ["--input-type=module", "-e", source, JSON.stringify(specifiers)],
    directory, environment: {}, input: null }, { timeoutMilliseconds: 5000 });
  if (result.status !== 0 || result.signal !== null || result.error || Buffer.byteLength(result.stdout) > 512 * 1024)
    throw new TypeError("fresh native development provider resolution failed");
  return JSON.parse(result.stdout);
}

function nativeDevelopmentResolution(library, manifest) {
  const subpaths = Object.keys(manifest.exports).filter(key => (key === "." || key.startsWith("./")) && key !== "./package.json" && !key.includes("*"));
  if (!subpaths.length) throw new TypeError("development source requires a public runtime subpath");
  return nativeEsmResolution(library, [manifest.name + "/package.json", ...subpaths.map(key => key === "." ? manifest.name : manifest.name + key.slice(1))]);
}

async function legacyDevelopmentFallback(modules, manifest, recipe, resolution) {
  const identity = resolution[0];
  if (identity.error === "ERR_MODULE_NOT_FOUND") return null;
  if (identity.error || typeof identity.path !== "string") throw new TypeError("development source peer identity is unreadable");
  const shared = join(modules, ".pnpm", "node_modules", manifest.name);
  const virtualStore = join(modules, ".pnpm");
  for (let at = dirname(shared); at !== modules; at = dirname(at)) await unredirectedDirectory(at);
  if (!within(virtualStore, identity.path) || !(await lstat(shared)).isSymbolicLink()
    || await realpath(shared) !== dirname(identity.path))
    throw new TypeError("development source refuses a direct, redirected or foreign peer fallback");
  const bytes = await readFile(identity.path), prior = JSON.parse(bytes);
  if (!(await lstat(identity.path)).isFile() || prior.name !== manifest.name || !isExactSemver(prior.version)
    || prior.version === recipe.testLibrary.peerVersion || prior.version === manifest.version)
    throw new TypeError("development source cannot replace a compatible or conflicting peer");
  for (const item of resolution) if (item.path && !within(dirname(identity.path), item.path))
    throw new TypeError("development fallback runtime subpath escapes its package");
  return { path: identity.path, shared, name: prior.name, version: prior.version,
    manifestDigest: sourceDigest(bytes), sourceCommit: prior.gitHead ?? null };
}

/** Reuse the original binding conductor for one missing own-root peer only.
 * Canonical source, registry suppliers and their authored peer declarations stay
 * intact. This returns SOURCE QA evidence, not registry or runtime receiving.
 * The caller owns finite execution/resource admission and the source inventory.
 */
export async function withDevelopmentRootSelfContext({ directory, manifest, manifestDigest }, run) {
  const recipe = developmentRootSelfRecipe(manifest);
  if (!recipe || typeof run !== "function" || !isAbsolute(directory) || resolve(directory) !== directory
    || !/^[a-f0-9]{64}$/u.test(manifestDigest ?? ""))
    throw new TypeError("explicit exact development source context required");
  await unredirectedDirectory(directory);
  const modules = join(directory, "node_modules");
  await unredirectedDirectory(modules);
  if (!(await lstat(join(modules, ".modules.yaml"))).isFile()) throw new TypeError("native development installation is absent");
  if (activeDevelopmentRoots.has(directory)) throw new TypeError("development source context is already active");
  const original = new Map();
  for (const name of ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", ".npmrc"]) {
    try {
      const file = join(directory, name), stat = await lstat(file);
      if (!stat.isFile() || await realpath(file) !== file) throw new TypeError("development source input is redirected");
      original.set(name, await readFile(file));
    } catch (error) { if (error.code !== "ENOENT" || name === "package.json") throw error; original.set(name, null); }
  }
  if (sourceDigest(original.get("package.json")) !== manifestDigest
    || !isDeepStrictEqual(JSON.parse(original.get("package.json")), manifest))
    throw new TypeError("development source identity changed");
  const selectedEntry = (await nativeEsmResolution(directory, [recipe.testLibrary.name]))[0];
  if (!selectedEntry.path) throw new TypeError("actual development test-library ESM entry is unavailable");
  const entry = selectedEntry.path;
  if (!within(modules, entry)) throw new TypeError("development test supplier escapes the native installation");
  let library = dirname(entry), libraryManifest, libraryBytes;
  for (let depth = 0; depth < 32 && within(modules, library); depth++) {
    try {
      libraryBytes = await readFile(join(library, "package.json"));
      const candidate = JSON.parse(libraryBytes);
      if (candidate.name === recipe.testLibrary.name) { libraryManifest = candidate; break; }
    } catch (error) { if (error.code !== "ENOENT") throw error; }
    library = dirname(library);
  }
  if (!libraryManifest || libraryManifest.version !== recipe.testLibrary.version
    || libraryManifest.peerDependencies?.[manifest.name] !== recipe.testLibrary.peerVersion)
    throw new TypeError("actual test-library identity or authored peer differs");
  const targets = [join(modules, manifest.name), join(library, "node_modules", manifest.name)];
  const libraryModules = libraryManifest.name.startsWith("@") ? dirname(dirname(library)) : dirname(library);
  const nativePeerTarget = join(libraryModules, manifest.name);
  if (!await absent(nativePeerTarget)) throw new TypeError("root-self QA only fills an absent native peer; direct provider is already installed");
  const createdParents = [];
  for (const [index, target] of targets.entries()) {
    const boundary = index === 0 ? directory : library;
    if (!within(boundary, target) || !await absent(target)) throw new TypeError("development self target is not absent and confined; root-self QA only fills an absent source peer");
    for (let at = dirname(target); at !== boundary; at = dirname(at)) {
      if (await absent(at)) createdParents.push(at);
      else await unredirectedDirectory(at);
    }
  }
  const previousResolution = await nativeDevelopmentResolution(library, manifest);
  const legacyFallback = await legacyDevelopmentFallback(modules, manifest, recipe, previousResolution);
  const source = { name: manifest.name, version: manifest.version, dir: directory, lifecycle: ["test", "test:coordination", "prepack"] };
  const consumer = { name: libraryManifest.name, version: libraryManifest.version, dir: library, lifecycle: [] };
  const plan = { packages: [source, consumer], dependencies: { [source.name]: [source.name], [consumer.name]: [source.name] } };
  let result, failure, provider;
  activeDevelopmentRoots.add(directory);
  try {
    result = await withSourceBindings(plan, async () => {
      const boundResolution = await nativeDevelopmentResolution(library, manifest);
      const identity = boundResolution[0].path;
      if (identity !== join(directory, "package.json")) throw new TypeError("native test-library peer does not resolve to this source root");
      for (const item of boundResolution.slice(1)) if (!item.path || !within(directory, item.path) || within(modules, item.path))
        throw new TypeError("native test-library runtime subpath does not resolve to this source root");
      provider = { name: manifest.name, version: manifest.version, sourceRoot: directory, manifestPath: identity, manifestDigest,
        publicResolution: boundResolution, previousResolution, legacyFallback };
      return run(Object.freeze({ kind: "npm.development-root-self.context", provider: Object.freeze(provider), environment: Object.freeze({ [recipe.selector.variable]: recipe.selector.value }) }));
    });
  } catch (error) { failure = error; }
  try {
    for (const [name, bytes] of original) {
      if (bytes === null ? !await absent(join(directory, name)) : !(await readFile(join(directory, name))).equals(bytes))
        throw new TypeError("development source QA changed canonical input: " + name);
    }
    if (!(await readFile(join(library, "package.json"))).equals(libraryBytes)) throw new TypeError("development source QA changed its registry supplier");
    for (const target of targets) if (!await absent(target)) throw new TypeError("development self binding was not restored");
    if (!await absent(nativePeerTarget)) throw new TypeError("development source QA changed its absent native peer target");
    if (!isDeepStrictEqual(await nativeDevelopmentResolution(library, manifest), previousResolution))
      throw new TypeError("development source QA changed prior native provider resolution");
    if (legacyFallback && (!isDeepStrictEqual(await legacyDevelopmentFallback(modules, manifest, recipe, previousResolution), legacyFallback)))
      throw new TypeError("development source QA changed its legacy fallback identity");
    for (const path of [...new Set(createdParents)].sort((a, b) => b.length - a.length)) {
      try { await rmdir(path); } catch (error) { if (error.code !== "ENOENT") throw error; }
    }
  } catch (error) { failure = failure ? new AggregateError([failure, error], "development source QA and custody both failed") : error; }
  finally { activeDevelopmentRoots.delete(directory); }
  if (failure) throw failure;
  return Object.freeze({ kind: "npm.development-root-self.source-qa", source: Object.freeze(provider),
    testLibrary: recipe.testLibrary, authoredPeer: recipe.testLibrary.peerVersion, selector: recipe.selector,
    authoredPeerSatisfied: false, registryPeerClosureReceived: false,
    canonicalInputsUnchanged: true, bindingsRestored: true, result,
    scope: "Functional development source QA only; not registry closure, artifact publication, portable runtime or operating acceptance" });
}
