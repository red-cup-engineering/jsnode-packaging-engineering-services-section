import { runSourceWorkerProcess as run } from "./source-worker-process.mjs";
import { sourceWorkerFileReference, retainSourceBuildWorkerInput, prepareSourceBuildWorkerHome, validateSourceBuildRegistry, sourceBuildOccurrenceDirectory, retainSourceBuildOccurrence, retainSourceBuildOccurrenceRecord, receiveSourceBuildOccurrenceRecord, receiveSourceBuildWorkerReport, receiveSourceBuildWorkerInput } from "./source-worker-evidence.mjs";
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import * as nativePath from "node:path";
import { homedir } from "node:os";
import { classifyLockfileResolvedUrls } from "./lockfile-registry-classification.mjs";
import { developmentRootSelfRecipe } from "./source-bindings.mjs";
import { browserAssetTreeBuildRecipe, receiveBrowserAssetTreeBuildInputs, receiveBrowserAssetTreeProducts } from "./browser-asset-build-recipe.mjs";
import { sourceWorkerTransport, sourceWorkerCaches, sourceWorkerModuleArguments } from "./source-worker-transport.mjs";


const qualifiedProducts = new WeakMap();
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const literal = path => typeof path === "string" && /^[A-Za-z0-9_-][A-Za-z0-9_./-]*$/u.test(path)
  && path.split("/").every(part => part && part !== "." && part !== "..");
const glob = path => typeof path === "string" && /^[A-Za-z0-9_][A-Za-z0-9_./*?-]*\.test\.[cm]?js$/u.test(path)
  && path.split("/").every(part => part && part !== "." && part !== "..");
const sourceEntryPath = path => typeof path === "string" && !path.startsWith("/") && !/[\\\0\r\n]/u.test(path)
  && path.split("/").every(part => part && part !== "." && part !== "..");
const exact = /^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/u;

/** A caller-owned native cache is reusable input, never a source or install receipt. */
export async function validateSourceBuildCacheRoot(cacheRoot, directory) {
  if (typeof cacheRoot !== "string" || !isAbsolute(cacheRoot))
    throw new TypeError("source cacheRoot must be an absolute private owned directory");
  const stat = await lstat(cacheRoot);
  if (!stat.isDirectory() || stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0
    || await realpath(cacheRoot) !== cacheRoot)
    throw new TypeError("source cacheRoot must be an unredirected private owned directory");
  for (const name of ["npm", "npm/_cacache", "npm/_logs", "pnpm-metadata", "pnpm-store", "yarn"]) {
    const path = join(cacheRoot, name);
    let child;
    try { child = await lstat(path); }
    catch (error) { if (error.code === "ENOENT") continue; throw error; }
    if (!child.isDirectory() || child.uid !== process.getuid() || await realpath(path) !== path)
      throw new TypeError("source cacheRoot native cache directories must be owned and unredirected");
  }
  const source = await realpath(directory);
  const inside = (parent, child) => {
    const path = relative(parent, child);
    return path === "" || (path !== ".." && !path.startsWith(".." + sep) && !isAbsolute(path));
  };
  if (inside(source, cacheRoot) || inside(cacheRoot, source))
    throw new TypeError("source cacheRoot must be separate from the source directory");
  return cacheRoot;
}

/** Only the already admitted literal native test command; never parse arbitrary shell. */
function nativeTestTargets(manifest, script = "test") {
  const test = /^(?:npm run build && )?node --test(?: --test-concurrency=[1-9][0-9]*)? (.+)$/u.exec(manifest.scripts?.[script] ?? "");
  const targets = test?.[1].split(" ").map(token => /^(['"])(.*)\1$/u.exec(token)?.[2] ?? token);
  if (!targets || !targets.every(glob)) throw new TypeError("publication build requires confined native Node test globs");
  return targets;
}

/** Existing Code gate classes, never a general lifecycle executor.
 * Direct TypeScript/npm, the literal asset-tree/PNPM adapter, and explicit native
 * root-self development QA are supported.
 */
export function sourcePublicationBuildRecipe(manifest) {
  const development = developmentRootSelfRecipe(manifest);
  if (development) {
    if (manifest.scripts?.build !== undefined) throw new TypeError("development root-self QA admits native JavaScript source only");
    nativeTestTargets(manifest);
    if (manifest.scripts?.["test:coordination"] !== undefined) nativeTestTargets(manifest, "test:coordination");
    if (manifest.packageManager !== undefined && !/^pnpm@\d+\.\d+\.\d+$/u.test(manifest.packageManager))
      throw new TypeError("development root-self QA preserves the owner's native PNPM lock");
    return { developmentRootSelf: development };
  }
  if (manifest.scripts?.build === undefined) return null;
  const browserAssetTree = browserAssetTreeBuildRecipe(manifest);
  const recipe = /^tsc -p (tsconfig(?:\.build)?\.json)$/u.exec(manifest.scripts.build);
  if (!recipe && !browserAssetTree) return null;
  if (typeof nativePath.matchesGlob !== "function") throw new TypeError("source build qualification requires the native path glob matcher"); // Other recipes retain the original pack-only/refusal path; never execute them.
  nativeTestTargets(manifest);
  if (!browserAssetTree && manifest.packageManager !== undefined && !/^npm@\d+\.\d+\.\d+$/u.test(manifest.packageManager))
    throw new TypeError("publication build requires the owner's npm lock");
  for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"])
    for (const [name, version] of Object.entries(manifest[field] ?? {}))
      if (!exact.test(version)) throw new TypeError("publication build requires exact registry dependencies: " + name);
  if (browserAssetTree) return { browserAssetTree };
  if (!exact.test(manifest.devDependencies?.typescript ?? "")) throw new TypeError("publication build requires an exact build-only TypeScript supplier");
  return { configuration: recipe[1] };
}

/** The original gate's source-only worker is deliberately selected. It cannot publish,
 * bump a version, repin a consumer or write its applying EAVT receipt on this path.
 * No service credential or inherited npm configuration reaches its child.
 */
export async function runSourceBuildWorker({ directory, registry, scratch, cacheRoot, timeoutMilliseconds = 300_000 }) {
  if (process.platform !== "linux") throw new TypeError("source build qualification requires the Linux worker custody contract");
  if (!Number.isSafeInteger(timeoutMilliseconds) || timeoutMilliseconds < 1 || timeoutMilliseconds > 300_000)
    throw new TypeError("source worker timeout must be 1 through 300000 milliseconds");
  validateSourceBuildRegistry(registry);
  if (cacheRoot !== undefined) await validateSourceBuildCacheRoot(cacheRoot, directory);
  const caches = sourceWorkerCaches(process.env, homedir(), [directory, scratch]);
  const home = join(scratch, "build-home"), userconfig = join(home, "npmrc"), globalconfig = join(home, "global-npmrc");
  prepareSourceBuildWorkerHome(scratch);
  await writeFile(userconfig, "", { flag: "wx", mode: 0o600 });
  await writeFile(globalconfig, "", { flag: "wx", mode: 0o600 });
  const gate = fileURLToPath(new URL("../scripts/publish-package.mjs", import.meta.url));
  const launchEnvironment = { ...process.env };
  const moduleArguments = await sourceWorkerModuleArguments({ environment: launchEnvironment });
  const environment = { ...sourceWorkerTransport(launchEnvironment), ...caches,
    ...Object.fromEntries(["PATH", "LANG", "LC_ALL", "TZ", "SystemRoot", "WINDIR"].filter(key => launchEnvironment[key] !== undefined).map(key => [key, launchEnvironment[key]])) };
  const input = retainSourceBuildWorkerInput(home, {
    kind: "npm.source-build-worker.input.v1", profile: "live-parent", scratch, directory,
    program: process.execPath, gate: sourceWorkerFileReference(gate),
    manifest: sourceWorkerFileReference(join(directory, "package.json")), registry,
    cacheRoot: cacheRoot ?? null, timeout: timeoutMilliseconds, maxBuffer: 16 * 1024 * 1024,
  });
  const receiving = observation => ({ kind: "npm.source-build-worker.receiving.v1", scratch, input,
    request: observation?.workerEvidence?.request ?? null });
  const evidence = observation => ({ workerEvidence: observation?.workerEvidence ?? null,
    processObservation: observation ?? null, workerReceiving: receiving(observation) });
  const parseReport = text => {
    const report = JSON.parse(text);
    if (!report || typeof report !== "object" || Array.isArray(report)
      || report.kind !== "npm.source-build-qualification"
      || !["refused", "source-build-qualified"].includes(report.outcome))
      throw new TypeError("fixed source build worker returned an unsupported report");
    return report;
  };
  let result;
  try { result = await run(process.execPath, [...moduleArguments, gate, "--qualify-build", "--package", directory, "--registry", registry,
    ...(cacheRoot === undefined ? [] : ["--qualification-cache-root", cacheRoot])], {
    cwd: scratch, timeout: timeoutMilliseconds, maxBuffer: 16 * 1024 * 1024,
    custodyMode: "live-parent", receiveProcess: true, evidence: { directory: join(home, "worker-evidence"), input },
    env: { ...environment, HOME: home, TMPDIR: scratch, TEMP: scratch, TMP: scratch,
      npm_config_userconfig: userconfig, npm_config_globalconfig: globalconfig,
      npm_config_ignore_scripts: "true", npm_config_update_notifier: "false", npm_config_audit: "false", npm_config_fund: "false" },
  }); } catch (error) {
    // A completed gate refusal has a typed report on stdout. Preserve its
    // actual reason; timeout, signal and malformed output remain process failures.
    if (error.code === 2 && !error.signal && error.killed !== true) {
      try { const report = parseReport(error.stdout); if (report.outcome === "refused") return { ...report, ...evidence(error.processObservation) }; } catch {}
    }
    error.workerReceiving = receiving(error.processObservation);
    throw error;
  }
  try { return { ...parseReport(result.stdout), ...evidence(result.processObservation) }; }
  catch (error) { Object.assign(error, evidence(result.processObservation)); throw error; }
}

/** Receive Code's generated products while preserving every authored input.
 * The caller supplies the exact Git reader's regular-file entries, never a live checkout scan.
 */
export async function qualifySourcePublicationBuild(options) {
  let worker;
  const gate = options.codeGate ?? runSourceBuildWorker;
  try {
    const qualified = await qualifySourcePublicationBuildOwned({ ...options, codeGate: async request => {
      worker = await gate(request); return worker;
    } });
    if (qualified && worker?.workerReceiving) { Object.assign(qualified, {
      workerReceiving: worker.workerReceiving, workerEvidence: worker.workerEvidence, processObservation: worker.processObservation,
    });
      const held = qualifiedProducts.get(qualified);
      if (held) held.qualificationSHA256 = digest(JSON.stringify(qualified));
    }
    return qualified;
  } catch (error) {
    if (worker?.workerReceiving) Object.assign(error, {
      workerReceiving: worker.workerReceiving, workerEvidence: worker.workerEvidence, processObservation: worker.processObservation,
    });
    throw error;
  }
}
async function sourceBuildContext({ directory, manifest, entries, registry }) {
  const recipe = sourcePublicationBuildRecipe(manifest);
  if (!recipe) return null;
  if (typeof nativePath.matchesGlob !== "function") throw new TypeError("source build qualification requires the native path glob matcher");
  if (!isAbsolute(directory) || await realpath(directory) !== directory || !(await lstat(directory)).isDirectory())
    throw new TypeError("source build requires an unredirected absolute source directory");
  let sourceBytes = 0;
  if (!Array.isArray(entries) || !entries.length || entries.length > 100_000) throw new TypeError("bounded committed source entries required");
  for (const entry of entries) {
    if (!sourceEntryPath(entry?.path)
      || !["100644", "100755"].includes(entry.mode) || !(entry.bytes instanceof Uint8Array))
      throw new TypeError("source build entries must be confined regular committed files");
    sourceBytes += entry.bytes.length;
    if (sourceBytes > 64 * 1024 * 1024) throw new RangeError("source build input byte bound exceeded");
  }
  const authored = new Map(entries.map(entry => [entry.path, entry]));
  if (authored.size !== entries.length || !authored.has("package.json")
    || JSON.stringify(JSON.parse(Buffer.from(authored.get("package.json").bytes).toString("utf8"))) !== JSON.stringify(manifest))
    throw new TypeError("source build requires unique entries and the exact committed manifest");
  if (recipe.developmentRootSelf) {
    for (const path of [".pnpmfile.cjs", ".pnpmfile.mjs", "package-lock.json", "yarn.lock"])
      if (authored.has(path)) throw new TypeError("unsupported development source QA configuration: " + path);
    if (!authored.has("pnpm-lock.yaml") || !authored.has("pnpm-workspace.yaml"))
      throw new TypeError("development source QA requires the authored native PNPM lock and policy");
    const receiveSource = async () => {
      for (const [path, entry] of authored) {
        const file = join(directory, path), stat = await lstat(file);
        if (!stat.isFile() || await realpath(file) !== file || digest(await readFile(file)) !== digest(entry.bytes)
          || Boolean(stat.mode & 0o111) !== (entry.mode === "100755"))
          throw new TypeError("development source QA changed authored input: " + path);
      }
    };
    await receiveSource();
    return {directory,manifest,registry,recipe,authored,receiveAuthored:receiveSource};
  }
  let browserAssetTree, output;
  if (recipe.browserAssetTree) {
    browserAssetTree = await receiveBrowserAssetTreeBuildInputs({ directory, manifest, registry, authored });
    output = browserAssetTree.output;
  } else {
    if (!authored.has("package-lock.json")) throw new TypeError("publication build requires a committed npm lock");
    for (const path of [".pnpmfile.cjs", ".pnpmfile.mjs", "pnpm-workspace.yaml", "pnpm-lock.yaml", "yarn.lock"])
      if (authored.has(path)) throw new TypeError("unsupported publication build configuration: " + path);
    if (authored.has(".npmrc")) {
      const text = Buffer.from(authored.get(".npmrc").bytes).toString("utf8").trim();
      if (text !== `registry=${registry.replace(/\/$/u, "")}` && text !== `registry=${registry.replace(/\/$/u, "")}/`)
        throw new TypeError("publication build project configuration must retain the canonical registry only");
    }
    const lock = JSON.parse(Buffer.from(authored.get("package-lock.json").bytes).toString("utf8"));
    const compiler = lock.packages?.["node_modules/typescript"];
    if (classifyLockfileResolvedUrls(lock, registry).houseScopedNotCanonical > 0
      || Object.values(lock.packages ?? {}).some(entry => entry?.link === true || /^(?:file|link|workspace|git|git\+[^:]*|ssh):/u.test(entry?.resolved ?? "")))
      throw new TypeError("publication build lock must retain exact registry supplier routing");
    if (![2, 3].includes(lock.lockfileVersion) || lock.name !== manifest.name || lock.version !== manifest.version
      || lock.packages?.[""]?.name !== manifest.name || lock.packages?.[""]?.version !== manifest.version
      || lock.packages?.[""]?.devDependencies?.typescript !== manifest.devDependencies.typescript
      || compiler?.version !== manifest.devDependencies.typescript || !/^sha512-[A-Za-z0-9+/]+=*$/u.test(compiler.integrity ?? ""))
      throw new TypeError("publication build compiler and source identity must match the committed npm lock");
    const configuration = authored.get(recipe.configuration);
    if (!configuration) throw new TypeError("publication build configuration is not committed");
    const config = JSON.parse(Buffer.from(configuration.bytes).toString("utf8")), options = config.compilerOptions ?? {};
    if (config.extends !== undefined || config.references !== undefined
      || (config.files !== undefined && (!Array.isArray(config.files) || !config.files.length || !config.files.every(literal)))
      || !literal(options.rootDir) || !literal(options.outDir)
      || options.rootDir === options.outDir || options.outDir === "node_modules" || options.outDir.startsWith("node_modules/") || options.outDir.startsWith(options.rootDir + "/")
      || ["outFile", "declarationDir", "tsBuildInfoFile", "plugins", "rootDirs", "typeRoots", "baseUrl", "paths"].some(key => options[key] !== undefined)
      || !Array.isArray(config.include) || !config.include.length
      || [...config.include, ...(config.exclude ?? [])].some(path => typeof path !== "string" || path.startsWith("/") || /[\\\0]/u.test(path) || path.split("/").some(part => part === "..")))
      throw new TypeError("publication compiler inputs and output must remain in the direct source owner");
    output = options.outDir;
  }
  if ([...authored.keys()].some(path => path === output || path.startsWith(output + "/")))
    throw new TypeError("publication build cannot overwrite committed products");
  async function receiveAuthored() {
    for (const [path, entry] of authored) {
      const file = join(directory, path), stat = await lstat(file);
      if (!stat.isFile() || await realpath(file) !== file || digest(await readFile(file)) !== digest(entry.bytes) || Boolean(stat.mode & 0o111) !== (entry.mode === "100755"))
        throw new TypeError("publication build changed authored source: " + path);
    }
  }
  await receiveAuthored();
  return {directory,manifest,registry,recipe,authored,receiveAuthored,browserAssetTree,output};
}

async function receiveSourceBuildSemantics(context,result) {
  const {directory,manifest,registry,recipe,authored,receiveAuthored,browserAssetTree,output}=context;
  if (recipe.developmentRootSelf) {
    if (result?.outcome === "refused") throw new TypeError("Code publication gate refused: " + JSON.stringify(result.refusal));
    const sourceQa = result?.state?.developmentSourceQa;
    if (result?.kind !== "npm.source-build-qualification" || result.outcome !== "source-build-qualified"
      || result.package !== manifest.name || result.state?.sourceVersion !== manifest.version
      || result.steps?.some(step => step.step >= 3)
      || ![1, 2].every(step => result.steps?.some(row => row.step === step && row.ok === true))
      || sourceQa?.kind !== "npm.development-root-self.source-qa" || sourceQa.source?.name !== manifest.name
      || sourceQa.source?.version !== manifest.version || sourceQa.source?.manifestDigest !== digest(authored.get("package.json").bytes)
      || sourceQa.canonicalInputsUnchanged !== true || sourceQa.bindingsRestored !== true
      || sourceQa.authoredPeerSatisfied !== false || sourceQa.registryPeerClosureReceived !== false
      || result.steps.find(row => row.step === 1).evidence?.lockfile?.kind !== "npm.development-root-self.installation"
      || result.steps.find(row => row.step === 1).evidence?.lockfile?.peerFrontier?.kind !== "npm.development-root-self.peer-frontier"
      || result.steps.find(row => row.step === 1).evidence?.lockfile?.peerFrontier?.authoredPeerSatisfied !== false
      || result.steps.find(row => row.step === 1).evidence?.lockfile?.registryPeerClosureReceived !== false)
      throw new TypeError("Code gate did not qualify this exact development source context");
    const count = result.steps.find(row => row.step === 2).evidence?.testCount;
    if (![count?.tests, count?.pass, count?.fail].every(Number.isSafeInteger)
      || count.tests < 1 || count.pass < 1 || count.fail !== 0 || count.pass > count.tests)
      throw new TypeError("Code development source QA did not execute passing required tests");
    await receiveAuthored();
    let paths = 0, bytes = 0;
    const receiveProducts = async at => {
      for (const entry of await readdir(at, { withFileTypes: true })) {
        const file = join(at, entry.name), path = relative(directory, file).split("\\").join("/");
        if (path === "node_modules") continue;
        if (++paths > 100_000) throw new RangeError("development source QA path bound exceeded");
        if (entry.isDirectory()) await receiveProducts(file);
        else {
          if (!entry.isFile() || !authored.has(path)) throw new TypeError("development source QA added undeclared product: " + path);
          bytes += (await lstat(file)).size;
          if (bytes > 64 * 1024 * 1024) throw new RangeError("development source QA byte bound exceeded");
        }
      }
    };
    await receiveProducts(directory);
    const qualification = { producer: "@red-cup-engineering/npm-workspace-publication-service", operation: "qualify-source-publication-build", apply: false,
      sourceVersion: manifest.version, authoredFiles: authored.size, paths, bytes, steps: result.steps, developmentSourceQa: sourceQa,
      scope: "Development source QA; canonical registry, final artifact and installed/runtime receiving remain separate" };
    return {qualification,products:[]};
  }
  if (result?.outcome === "refused") throw new TypeError("Code publication gate refused: " + JSON.stringify(result.refusal));
  if (result?.kind !== "npm.source-build-qualification" || result.outcome !== "source-build-qualified" || result.package !== manifest.name || result.state?.sourceVersion !== manifest.version
    || result.steps?.some(step => step.step >= 3) || ![1, 2].every(step => result.steps?.some(row => row.step === step && row.ok === true)))
    throw new TypeError("Code publication gate did not qualify this source without applying effects");
  const count = result.steps.find(row => row.step === 2).evidence?.testCount;
  if (![count?.tests, count?.pass, count?.fail].every(Number.isSafeInteger)
    || count.tests < 1 || count.pass < 1 || count.fail !== 0 || count.pass > count.tests)
    throw new TypeError("Code publication gate did not execute passing required tests");
  if (browserAssetTree && (result.steps.find(row => row.step === 1).evidence?.packageManager !== "pnpm"
    || result.steps.find(row => row.step === 1).evidence?.installMode !== "verify"
    || JSON.stringify(result.steps.find(row => row.step === 2).evidence?.browserAssetTree) !== JSON.stringify(browserAssetTree)))
    throw new TypeError("Code gate did not receive the exact browser asset recipe and frozen PNPM installation");
  if (browserAssetTree) {
    const installed = result.steps.find(row => row.step === 2).evidence?.installedBrowserProvider;
    if (installed?.name !== browserAssetTree.provider || installed?.version !== browserAssetTree.providerVersion
      || ![installed.manifestSHA256, installed.entrypointSHA256].every(value => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value)))
      throw new TypeError("Code gate did not receive the installed browser asset provider");
  }
  await receiveAuthored();
  const receivedFiles = [];
  let paths = 0, bytes = 0;
  async function receive(at) {
    for (const entry of await readdir(at, { withFileTypes: true })) {
      const file = join(at, entry.name), path = relative(directory, file).split("\\").join("/");
      if (path === "node_modules") continue;
      if (++paths > 100_000) throw new RangeError("publication build output path bound exceeded");
      if (entry.isDirectory()) await receive(file);
      else if (!entry.isFile()) throw new TypeError("publication build produced a nonregular carrier");
      else {
        receivedFiles.push(path);
        bytes += (await lstat(file)).size;
        if (bytes > 64 * 1024 * 1024) throw new RangeError("publication build output byte bound exceeded");
        if (!authored.has(path) && !path.startsWith(output + "/")) throw new TypeError("publication build added undeclared source: " + path);
      }
    }
  }
  await receive(directory);
  if (browserAssetTree) await receiveBrowserAssetTreeProducts({ directory, authored, recipe: browserAssetTree, receivedFiles });
  const testTargets = nativeTestTargets(manifest).map(pattern => ({ pattern,
    files: receivedFiles.filter(path => nativePath.matchesGlob(path, pattern)) }));
  for (const target of testTargets) if (target.files.length === 0)
    throw new TypeError("publication build declared test target has no received file: " + target.pattern);
  const qualification = { producer: "@red-cup-engineering/npm-workspace-publication-service", operation: "qualify-source-publication-build", apply: false,
    ...(browserAssetTree ? { browserAssetTree } : { configuration: recipe.configuration }),
    sourceVersion: manifest.version, steps: result.steps, testTargets, authoredFiles: authored.size, paths, bytes };
  const products = [];
  for (const path of receivedFiles.filter(path => !authored.has(path))) {
    const file = join(directory, path), stat = await lstat(file), body = await readFile(file);
    if (!stat.isFile() || await realpath(file) !== file) throw new TypeError("qualified product became redirected");
    products.push({ path, mode: stat.mode & 0o777, sha256: digest(body), bytes: body.length });
  }
  return {qualification,products};
}
function mintSourceBuildProducts(received,directory) {
  const {qualification,products}=received;
  qualifiedProducts.set(qualification,{directory,products,qualificationSHA256:digest(JSON.stringify(qualification))});
  return qualification;
}
async function qualifySourcePublicationBuildOwned(options) {
  const context=await sourceBuildContext(options);
  if(!context)return null;
  const result=await options.codeGate({directory:options.directory,registry:options.registry,scratch:options.scratch});
  return mintSourceBuildProducts(await receiveSourceBuildSemantics(context,result),options.directory);
}

/** Only a retained result of this actual in-process producer can open this port.
 * JSON reports preserve evidence but cannot manufacture qualified products.
 */
export async function receiveQualifiedPublicationBuildProducts(qualification, { directory }) {
  const held = qualifiedProducts.get(qualification);
  if (!held || held.directory !== directory || held.qualificationSHA256 !== digest(JSON.stringify(qualification))) throw new TypeError("original in-process Code build qualification required");
  const provenance = { producer: qualification.producer, operation: qualification.operation,
    sourceVersion: qualification.sourceVersion, qualificationSHA256: held.qualificationSHA256 };
  const products = [];
  for (const expected of held.products) {
    const file = join(directory, expected.path), stat = await lstat(file);
    if (!stat.isFile() || stat.size !== expected.bytes) throw new TypeError("qualified Code product size changed");
    const bytes = await readFile(file);
    if (!stat.isFile() || await realpath(file) !== file || (stat.mode & 0o777) !== expected.mode
      || bytes.length !== expected.bytes || digest(bytes) !== expected.sha256)
      throw new TypeError("qualified Code product changed: " + expected.path);
    products.push({ path: expected.path, bytes, mode: expected.mode, source: { ...provenance } });
  }
  return products;
}


// Original fixed-build handoff. Source provenance and provider selection are
// caller-received inputs, not newly issued Work or deployment authority.
const fixedBuildKind='npm.fixed-build';
const hex256=value=>typeof value==='string'&&/^[a-f0-9]{64}$/u.test(value);
const exactObject=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)
  &&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const equalJSON=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function buildSourceReference(value){
  if(!exactObject(value,['repository','commit'])||typeof value.repository!=='string'
    ||! /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(value.repository)
    ||! /^[a-f0-9]{40}$/u.test(value.commit??''))throw new TypeError('exact original source reference required');
  return {repository:value.repository,commit:value.commit};
}
function buildProviderSelection(value){
  if(!exactObject(value,['profile','job','release','declarationSHA256'])
    ||value.profile!=='native-manual-request/1'||typeof value.job!=='string'
    ||! /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value.job)
    ||! /^[a-f0-9]{40}$/u.test(value.release??'')||!hex256(value.declarationSHA256))
    throw new TypeError('original fixed provider selection required');
  return {...value};
}
function fixedBuildOwner(){
  return ['../package.json','../scripts/publish-package.mjs','source-build-qualification.mjs',
    'source-worker-evidence.mjs','source-worker-process.mjs','source-worker-transport.mjs',
    'source-build-worker-receiving.mjs','../scripts/run-admitted-source-build.mjs',
    'source-bindings.mjs','lockfile-registry-classification.mjs','browser-asset-build-recipe.mjs']
    .map(path=>sourceWorkerFileReference(fileURLToPath(new URL(path,import.meta.url))));
}
function independentBuildStateRoot(root,directory){
  const inside=(parent,child)=>{const path=relative(parent,child);return path===''||(!isAbsolute(path)&&path!=='..'&&!path.startsWith('..'+sep));};
  if(typeof directory!=='string'||!isAbsolute(directory)||inside(root,directory)||inside(directory,root))throw new TypeError('fixed build evidence and source must remain separate');
}
function buildOccurrenceRequest(request){
  if(!exactObject(request,['id','digest'])||typeof request.id!=='string'
    ||! /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(request.id)||!hex256(request.digest))
    throw new TypeError('exact fixed build occurrence required');
  return request;
}
async function fixedBuildEntries(value){
  if(!Array.isArray(value.entries)||!value.entries.length||value.entries.length>100000)
    throw new TypeError('bounded original source inventory required');
  if(typeof value.directory!=='string'||!isAbsolute(value.directory)||nativePath.resolve(value.directory)!==value.directory||await realpath(value.directory)!==value.directory)throw new TypeError('fixed build source directory differs');
  const entries=[];let total=0;const seen=new Set();
  for(const e of value.entries){
    if(!exactObject(e,['path','mode','bytes','sha256'])||!sourceEntryPath(e.path)||seen.has(e.path)
      ||!['100644','100755'].includes(e.mode)||!Number.isSafeInteger(e.bytes)||e.bytes<0||!hex256(e.sha256))
      throw new TypeError('fixed build source inventory differs');
    seen.add(e.path);total+=e.bytes;if(total>64*1024*1024)throw new RangeError('fixed build source byte bound exceeded');
    const path=join(value.directory,e.path),reference=sourceWorkerFileReference(path),stat=await lstat(path);
    if(reference.bytes!==e.bytes||reference.sha256!==e.sha256||Boolean(stat.mode&0o111)!==(e.mode==='100755'))
      throw new TypeError('admitted fixed build source changed');
    const bytes=await readFile(path);
    if(bytes.length!==e.bytes||digest(bytes)!==e.sha256)throw new TypeError('admitted fixed build source changed while reading');
    entries.push({path:e.path,mode:e.mode,bytes});
  }
  return entries;
}
async function originalBuildAdmission(root,request){
  buildOccurrenceRequest(request);
  const admission=receiveSourceBuildOccurrenceRecord(root,request.id,'admission.json'),v=admission.value;
  if(admission.reference.sha256!==request.digest||!exactObject(v,['kind','id','source','consumer','provider','ownerQualification','ownerFiles','runtime','directory','registry','timeout','entries'])
    ||v.kind!==fixedBuildKind+'.admission.v1'||v.id!==request.id||!Number.isSafeInteger(v.timeout)||v.timeout<1||v.timeout>300000)
    throw new TypeError('original fixed build admission differs');
  buildSourceReference(v.source);buildProviderSelection(v.provider);
  if(!exactObject(v.consumer,['source','path','sha256'])||!literal(v.consumer.path)||!hex256(v.consumer.sha256))throw new TypeError('original consumer provenance required');
  buildSourceReference(v.consumer.source);
  if(!exactObject(v.ownerQualification,['source','closureSHA256'])||!hex256(v.ownerQualification.closureSHA256))throw new TypeError('owner source qualification required');
  buildSourceReference(v.ownerQualification.source);
  validateSourceBuildRegistry(v.registry);
  if(!exactObject(v.runtime,['program','version'])||v.runtime.program!==process.execPath||v.runtime.version!==process.version)throw new TypeError('fixed build runtime differs');
  if(!equalJSON(v.ownerFiles,fixedBuildOwner()))throw new TypeError('fixed build owner bytes changed');
  independentBuildStateRoot(root,v.directory);
  const entries=await fixedBuildEntries(v),manifestEntry=entries.find(e=>e.path==='package.json');
  if(!manifestEntry)throw new TypeError('fixed build manifest missing');
  const manifest=JSON.parse(manifestEntry.bytes),context=await sourceBuildContext({directory:v.directory,manifest,entries,registry:v.registry});
  if(!context||context.recipe.browserAssetTree)throw new TypeError('fixed build retained recipe not yet admitted');
  receiveSourceBuildOccurrenceRecord(root,request.id,'admission.json',admission.reference);
  return {admission,context,entries,manifest};
}
async function receiveInitialBuildTree(context){
  const {directory}=context;
  // Initial admission receives authored files, not an unreceived prior build.
  let paths=0;const inspect=async at=>{for(const e of await readdir(at,{withFileTypes:true})){
    const path=join(at,e.name),name=relative(directory,path).split('\\').join('/');if(name==='node_modules')continue;
    if(++paths>100000)throw new RangeError('fixed build initial path bound exceeded');
    if(e.isDirectory())await inspect(path);else if(!e.isFile()||!context.authored.has(name))throw new TypeError('fixed build contains unreceived initial products');
  }};await inspect(directory);
}
/** Prepare only: no worker/manager/registry effect and no institutional admission. */
export async function admitSourcePublicationBuild(options){
  if(!exactObject(options,['root','id','source','consumer','provider','ownerQualification','directory','manifest','entries','registry','timeout']))
    throw new TypeError('fixed build admission fields required');
  const {root,id,directory,manifest,entries,registry,timeout}=options;
  sourceBuildOccurrenceDirectory(root,id);independentBuildStateRoot(root,directory);validateSourceBuildRegistry(registry);
  buildSourceReference(options.source);buildProviderSelection(options.provider);
  if(!exactObject(options.consumer,['source','path','sha256'])||!literal(options.consumer.path)||!hex256(options.consumer.sha256))throw new TypeError('original consumer provenance required');
  buildSourceReference(options.consumer.source);
  if(!exactObject(options.ownerQualification,['source','closureSHA256'])||!hex256(options.ownerQualification.closureSHA256))throw new TypeError('qualified owner source witness required');
  buildSourceReference(options.ownerQualification.source);
  if(!Number.isSafeInteger(timeout)||timeout<1||timeout>300000)throw new TypeError('fixed build deadline outside original bound');
  const context=await sourceBuildContext({directory,manifest,entries,registry});
  if(!context||context.recipe.browserAssetTree)throw new TypeError('fixed build retained recipe not yet admitted');
  await receiveInitialBuildTree(context);
  const value={kind:fixedBuildKind+'.admission.v1',id,source:buildSourceReference(options.source),consumer:options.consumer,
    provider:buildProviderSelection(options.provider),ownerQualification:options.ownerQualification,ownerFiles:fixedBuildOwner(),runtime:{program:process.execPath,version:process.version},directory,registry,timeout,
    entries:entries.map(e=>({path:e.path,mode:e.mode,bytes:e.bytes.length,sha256:digest(e.bytes)}))};
  const reference=retainSourceBuildOccurrence(root,id,value);
  return Object.freeze({kind:fixedBuildKind+'.admitted.v1',request:{id,digest:reference.sha256},admission:reference,
    institutionalAdmission:false,providerAdmission:false});
}
/** Read by exact occurrence, never by a latest-input search. */
export async function receiveSourcePublicationBuildAdmission({root,request}){
  const {admission}=await originalBuildAdmission(root,request);
  return Object.freeze({kind:fixedBuildKind+'.admission-received.v1',request:{...request},admission:admission.reference,
    provider:admission.value.provider,source:admission.value.source,consumer:admission.value.consumer,
    institutionalAdmission:false,providerAdmission:false});
}
function originalBuildCorrelation(v,request,environment){
  if(environment.NODE_JOB_REQUEST_PROFILE!==v.provider.profile||environment.NODE_JOB_REQUEST_ID!==request.id
    ||environment.NODE_JOB_REQUEST_DIGEST!==request.digest||environment.NODE_JOB_ID!==v.provider.job
    ||environment.NODE_JOB_RELEASE!==v.provider.release
    ||! /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/u.test(environment.NODE_JOB_REQUEST_ATTEMPT??'')
    ||! /^[a-f0-9]{32}$/u.test(environment.INVOCATION_ID??''))throw new TypeError('original fixed job request correlation unavailable');
  return {profile:v.provider.profile,request:{...request},job:v.provider.job,release:v.provider.release,
    declarationSHA256:v.provider.declarationSHA256,attempt:environment.NODE_JOB_REQUEST_ATTEMPT,invocation:environment.INVOCATION_ID};
}
/** Fixed provider program only. It has no codeGate/program/argv override. */
export async function executeAdmittedSourcePublicationBuild(options){
  if(!exactObject(options,['root','request']))throw new TypeError('fixed build execution fields required');
  const {root,request}=options;
  const {admission,context}=await originalBuildAdmission(root,request),v=admission.value;
  const correlation=originalBuildCorrelation(v,request,process.env);
  await receiveInitialBuildTree(context);
  const execution=retainSourceBuildOccurrenceRecord(root,request.id,'execution.json',{
    kind:fixedBuildKind+'.execution.v1',admission:admission.reference,correlation});
  const scratch=join(sourceBuildOccurrenceDirectory(root,request.id),'worker');
  const result=await runSourceBuildWorker({directory:v.directory,registry:v.registry,scratch,timeoutMilliseconds:v.timeout});
  const semantics=await receiveSourceBuildSemantics(context,result);
  const received=receiveSourceBuildWorkerReport(join(scratch,'build-home'),result.workerReceiving.request);
  // Compare the original raw gate report, not additive transport fields.
  const raw={...result};for(const key of ['workerReceiving','workerEvidence','processObservation'])delete raw[key];
  if(!equalJSON(received.value,raw))throw new TypeError('fixed build original report differs');
  const value={kind:fixedBuildKind+'.result.v1',admission:admission.reference,execution,correlation,
    workerReceiving:result.workerReceiving,terminal:received.terminal,report:received.reference,
    qualification:semantics.qualification,products:semantics.products};
  await context.receiveAuthored();
  receiveSourceBuildOccurrenceRecord(root,request.id,'admission.json',admission.reference);
  const reference=retainSourceBuildOccurrenceRecord(root,request.id,'result.json',value);
  return Object.freeze({kind:fixedBuildKind+'.completed.v1',request:{...request},result:reference,
    providerSettlementReceived:false,registryReceiving:false});
}
/** Retained semantic receiving, not a build retry or manager settlement. */
export async function receiveAdmittedSourcePublicationBuild(options){
  if(!exactObject(options,['root','request'])&&!exactObject(options,['root','request','result']))throw new TypeError('fixed build receiving fields required');
  const {root,request,result:expectedResult}=options;
  if(Object.hasOwn(options,'result')&&(!exactObject(expectedResult,['path','bytes','sha256'])||typeof expectedResult.path!=='string'||!isAbsolute(expectedResult.path)||nativePath.resolve(expectedResult.path)!==expectedResult.path||!Number.isSafeInteger(expectedResult.bytes)||expectedResult.bytes<0||expectedResult.bytes>16777216||!hex256(expectedResult.sha256)))throw new TypeError('exact retained result reference required');
  const {admission,context}=await originalBuildAdmission(root,request);
  const result=receiveSourceBuildOccurrenceRecord(root,request.id,'result.json',expectedResult),v=result.value;
  if(!exactObject(v,['kind','admission','execution','correlation','workerReceiving','terminal','report','qualification','products'])||v.kind!==fixedBuildKind+'.result.v1'||!equalJSON(v.admission,admission.reference))throw new TypeError('original fixed semantic result required');
  const execution=receiveSourceBuildOccurrenceRecord(root,request.id,'execution.json',v.execution);
  if(!exactObject(execution.value,['kind','admission','correlation'])||execution.value.kind!==fixedBuildKind+'.execution.v1'||!equalJSON(execution.value.admission,admission.reference)
    ||!equalJSON(execution.value.correlation,v.correlation)||!equalJSON(v.correlation?.request,request))throw new TypeError('fixed semantic execution differs');
  const expectedCorrelation=originalBuildCorrelation(admission.value,request,{NODE_JOB_REQUEST_PROFILE:v.correlation.profile,NODE_JOB_REQUEST_ID:v.correlation.request.id,NODE_JOB_REQUEST_DIGEST:v.correlation.request.digest,NODE_JOB_ID:v.correlation.job,NODE_JOB_RELEASE:v.correlation.release,NODE_JOB_REQUEST_ATTEMPT:v.correlation.attempt,INVOCATION_ID:v.correlation.invocation});
  if(!equalJSON(expectedCorrelation,v.correlation))throw new TypeError('fixed build provider correlation differs');
  const scratch=join(sourceBuildOccurrenceDirectory(root,request.id),'worker');
  if(v.workerReceiving?.kind!=='npm.source-build-worker.receiving.v1'||v.workerReceiving.scratch!==scratch)throw new TypeError('fixed build worker scope differs');
  const worker=await import('./source-build-worker-receiving.mjs');
  const settled=worker.receiveSourcePublicationBuildWorker(v.workerReceiving);
  if(settled.state!=='settled-success'||!equalJSON(settled.worker.references.terminal,v.terminal))throw new TypeError('fixed build original worker settlement differs');
  const input=receiveSourceBuildWorkerInput(join(scratch,'build-home'),v.workerReceiving.input).value;
  const owner=admission.value,gate=owner.ownerFiles.find(r=>r.path===fileURLToPath(new URL('../scripts/publish-package.mjs',import.meta.url)));
  const manifest=owner.entries.find(e=>e.path==='package.json');
  if(input.directory!==owner.directory||input.registry!==owner.registry||input.timeout!==owner.timeout
    ||input.program!==owner.runtime.program||input.cacheRoot!==null||input.maxBuffer!==16*1024*1024
    ||!equalJSON(input.gate,gate)||!equalJSON(input.manifest,{path:join(owner.directory,'package.json'),bytes:manifest.bytes,sha256:manifest.sha256})
    ||!equalJSON(settled.worker.invocation.source,['source-worker-process.mjs','source-worker-evidence.mjs'].map(name=>owner.ownerFiles.find(r=>r.path===fileURLToPath(new URL(name,import.meta.url))))))
    throw new TypeError('nested worker does not bind original admission owner/input');
  const received=receiveSourceBuildWorkerReport(join(scratch,'build-home'),v.workerReceiving.request);
  if(!equalJSON(received.reference,v.report)||!equalJSON(received.terminal,v.terminal))throw new TypeError('fixed semantic report differs');
  const semantics=await receiveSourceBuildSemantics(context,received.value);
  if(!equalJSON(semantics.qualification,v.qualification)||!equalJSON(semantics.products,v.products))throw new TypeError('original qualified build products changed');
  receiveSourceBuildOccurrenceRecord(root,request.id,'admission.json',admission.reference);
  receiveSourceBuildOccurrenceRecord(root,request.id,'execution.json',execution.reference);
  receiveSourceBuildOccurrenceRecord(root,request.id,'result.json',result.reference);
  const again=worker.receiveSourcePublicationBuildWorker(v.workerReceiving);
  if(again.state!=='settled-success'||!equalJSON(again.worker.references.terminal,v.terminal))throw new TypeError('fixed build chain changed during receiving');
  await context.receiveAuthored();
  return Object.freeze({kind:fixedBuildKind+'.received.v1',request:{...request},result:result.reference,
    qualification:mintSourceBuildProducts(semantics,admission.value.directory),correlation:v.correlation,
    providerSettlementReceived:false,registryReceiving:false,replayPermitted:false});
}
