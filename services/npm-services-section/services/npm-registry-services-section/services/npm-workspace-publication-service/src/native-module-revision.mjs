/** Receive an explicit source revision over an immutable native dependency context.
 * This is a source transformation, not a replacement package publication. Node
 * retains original module URLs and therefore original relative supplier lookup.
 */
import {readFileSync, realpathSync, lstatSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {registerHooks} from 'node:module';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {isAbsolute, normalize, sep, dirname, resolve} from 'node:path';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const within = (root, path) => path === root || path.startsWith(root + sep);
const sourceIdentity = source => typeof source?.repository === 'string'
  && /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(source.repository)
  && /^[a-f0-9]{40}$/.test(source.commit);
const absent = before => before?.kind === 'absent' && Object.keys(before).length === 1;
function requireThat(condition, reason) { if (!condition) throw new TypeError(reason); }
function requireAbsent(path) {
  // A missing leaf has no realpath. Its existing original directory supplies
  // confinement, while lstat distinguishes true absence from a dangling link.
  requireThat(typeof path === 'string' && isAbsolute(path) && normalize(path) === path,
    'normalized absolute native file required');
  const parent = dirname(path);
  requireThat(realpathSync(parent) === parent && lstatSync(parent).isDirectory(),
    'absent native module requires an original canonical directory');
  requireThat(lstatSync(path, {throwIfNoEntry: false}) === undefined,
    'declared absent native module already exists');
}
function bytesAt(path, {immutable = true} = {}) {
  requireThat(typeof path === 'string' && isAbsolute(path) && normalize(path) === path,
    'normalized absolute native file required');
  requireThat(!immutable || /^\/gnu\/store\/[^/]+(?:\/|$)/.test(path), 'immutable native input required');
  requireThat(realpathSync(path) === path, 'native revision input is redirected');
  const stat = lstatSync(path);
  requireThat(stat.isFile() && stat.size <= 1048576, 'bounded regular native input required');
  return readFileSync(path);
}

const sourcePath = path => typeof path === 'string' && !isAbsolute(path)
  && !path.split('/').some(part => !part || part === '.' || part === '..');
const sourceEqual = (a, b) => sourceIdentity(a) && sourceIdentity(b)
  && a.repository === b.repository && a.commit === b.commit;
function absentExport(manifest, key) {
  const exports = manifest.exports;
  requireThat(exports !== null && typeof exports === 'object' && !Array.isArray(exports)
    && exports['./package.json'] === './package.json' && !Object.hasOwn(exports, key),
    'original literal manifest export and absent public key required');
  for (const pattern of Object.keys(exports)) {
    if (!pattern.includes('*')) continue;
    const expression = pattern.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
    requireThat(!new RegExp('^' + expression + '$').test(key), 'ambiguous original wildcard export');
  }
}
function receiveSourcePort(binding, mappings, runtimeRoot, {immutable = true} = {}) {
  requireThat(absent(binding.original), 'public source port requires explicit original absence');
  const supplier = binding.supplier, declaration = binding.sourceExport;
  const importer = mappings.get(pathToFileURL(binding.importer.path).href);
  const selected = mappings.get(pathToFileURL(binding.selected?.path ?? '').href);
  requireThat(importer !== undefined && !absent(importer.file.before)
    && importer.file.before === binding.importer.sha256,
    'added public export requires an exact revised original importer');
  requireThat(selected !== undefined && absent(selected.file.before)
    && selected.file.after === binding.selected?.sha256
    && within(runtimeRoot, selected.file.target), 'public source port requires an explicit absent selected module');
  requireAbsent(selected.file.target);
  requireThat(sourceEqual(declaration?.source, selected.file.source)
    && sourcePath(declaration?.sourcePath) && (declaration.sourcePath === 'package.json' || declaration.sourcePath.endsWith('/package.json'))
    && declaration.key === '.' + binding.specifier.slice(supplier.name.length)
    && typeof declaration.target === 'string' && declaration.target.startsWith('./')
    && sourcePath(declaration.target.slice(2)) && declaration.target.endsWith('.mjs'),
    'exact Git public export declaration required');
  const manifestBytes = bytesAt(supplier.manifest, {immutable});
  requireThat(digest(manifestBytes) === supplier.sha256, 'native supplier changed before source port receiving');
  const original = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(manifestBytes));
  absentExport(original, declaration.key);
  requireThat(sha(declaration.manifest?.sha256) && typeof declaration.manifest?.path === 'string'
    && declaration.manifest.path.endsWith('.json'), 'source JSON manifest hash required');
  const sourceBytes = bytesAt(declaration.manifest.path, {immutable});
  requireThat(digest(sourceBytes) === declaration.manifest.sha256, 'source export manifest differs');
  const source = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(sourceBytes));
  requireThat(source.name === supplier.name && typeof source.version === 'string'
    && source.exports?.[declaration.key] === declaration.target
    && resolve(dirname(supplier.manifest), declaration.target) === selected.file.target
    && resolve('/', dirname(declaration.sourcePath), declaration.target).slice(1) === selected.file.sourcePath,
    'source export declaration does not name the received module');
  requireThat(digest(bytesAt(binding.importer.path, {immutable})) === binding.importer.sha256,
    'source port importer changed before resolution');
  return sourceBytes.length;
}

/** Pure receiving may inspect staged inputs. Live registration requires Guix
 * custody for the revision, original runtime, and every replacement file.
 */
export function receiveNativeModuleRevision(revision, {immutable = true} = {}) {
  requireThat(revision?.kind === 'code.native-module-source-revision/v5', 'native source revision v5 required');
  requireThat(typeof revision.runtimeRoot === 'string' && isAbsolute(revision.runtimeRoot)
    && normalize(revision.runtimeRoot) === revision.runtimeRoot
    && realpathSync(revision.runtimeRoot) === revision.runtimeRoot
    && (!immutable || /^\/gnu\/store\/[^/]+$/.test(revision.runtimeRoot)), 'immutable original runtime required');
  requireThat(sourceIdentity(revision.source), 'exact upstream Git source required');
  requireThat(Array.isArray(revision.files) && revision.files.length > 0 && revision.files.length <= 64,
    'explicit bounded source revision required');
  const mappings = new Map();
  // Keep the original worst-case source-byte bound while admitting larger
  // cohorts of small modules. Physical dependency-context duplicates still
  // retain their own exact source and supplier identities.
  let sourceBytes = 0;
  for (const file of revision.files) {
    requireThat(typeof file.target === 'string' && within(revision.runtimeRoot, file.target)
      && isAbsolute(file.target) && normalize(file.target) === file.target
      && file.target.endsWith('.mjs') && (sha(file.before) || absent(file.before)) && sha(file.after), 'confined module identities required');
    requireThat(typeof file.sourcePath === 'string' && file.sourcePath.endsWith('.mjs')
      && !isAbsolute(file.sourcePath) && !file.sourcePath.split('/').some(p => !p || p === '.' || p === '..'),
    'canonical upstream module path required');
    const addition = absent(file.before);
    if (addition) {
      requireThat(sourceIdentity(file.source), 'added native module requires exact upstream Git source');
      requireAbsent(file.target);
    }
    const original = addition ? undefined : bytesAt(file.target, {immutable}), replacement = bytesAt(file.replacement, {immutable});
    sourceBytes += (original?.length ?? 0) + replacement.length;
    requireThat(sourceBytes <= 64 * 1048576, 'bounded aggregate native source required');
    requireThat(addition || digest(original) === file.before, 'incumbent native source differs');
    requireThat(digest(replacement) === file.after, 'received upstream source differs');
    const url = pathToFileURL(file.target).href;
    requireThat(!mappings.has(url), 'competing source revisions');
    mappings.set(url, {file, source: new TextDecoder('utf-8', {fatal: true}).decode(replacement)});
  }
  const bindings = new Map();
  const declared = revision.bindings ?? [];
  requireThat(Array.isArray(declared) && declared.length <= 32, 'bounded native named bindings required');
  for (const binding of declared) {
    requireThat(binding.kind === undefined || binding.kind === 'absent-public-export', 'unknown named source binding');
    const added = binding.kind === 'absent-public-export';
    for (const [name, input] of Object.entries(added ? {importer: binding.importer} : {importer: binding.importer, original: binding.original, selected: binding.selected})) {
      requireThat(typeof input?.path === 'string' && within(revision.runtimeRoot, input.path)
        && input.path.endsWith('.mjs') && sha(input.sha256), 'confined named module identity required: ' + name);
      requireThat(digest(bytesAt(input.path, {immutable})) === input.sha256, 'named module preimage differs: ' + name);
    }
    const supplier = binding.supplier;
    requireThat(typeof supplier?.manifest === 'string' && within(revision.runtimeRoot, supplier.manifest)
      && supplier.manifest.endsWith('/package.json') && sha(supplier.sha256), 'native supplier manifest required');
    const manifestBytes = bytesAt(supplier.manifest, {immutable});
    requireThat(digest(manifestBytes) === supplier.sha256, 'native supplier manifest differs');
    const manifest = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(manifestBytes));
    requireThat(typeof supplier.name === 'string' && supplier.name === manifest.name
      && typeof supplier.version === 'string' && supplier.version === manifest.version, 'actual native supplier identity required');
    requireThat(typeof binding.specifier === 'string' && (binding.specifier === supplier.name
      || binding.specifier.startsWith(supplier.name + '/')), 'binding must name the actual supplier export');
    const exportKey = binding.specifier === supplier.name ? '.' : '.' + binding.specifier.slice(supplier.name.length);
    const publicTarget = manifest.exports?.[exportKey];
    const supplierRoot = dirname(supplier.manifest);
    if (added) {
      sourceBytes += receiveSourcePort(binding, mappings, revision.runtimeRoot, {immutable});
      requireThat(sourceBytes <= 64 * 1048576, 'bounded aggregate native source required');
    } else requireThat(typeof publicTarget === 'string' && publicTarget.startsWith('./')
      && within(supplierRoot, resolve(supplierRoot, publicTarget))
      && resolve(supplierRoot, publicTarget) === binding.selected.path, 'one literal native public export required');
    const key = pathToFileURL(binding.importer.path).href + '\\0' + binding.specifier;
    requireThat(!bindings.has(key), 'competing native named bindings');
    bindings.set(key, binding);
  }
  return {revision, mappings, bindings, immutable};
}

/** Only exact selected URLs change. Resolution, package versions, relative
 * imports, unselected loads and the existing dependency graph stay native.
 */
export function nativeModuleRevisionHooks(received) {
  return {resolve(specifier, context, nextResolve) {
    const binding = received.bindings?.get(context.parentURL + '\\0' + specifier);
    if (binding === undefined) {
      if (received.mappings.has(context.parentURL) && (specifier.startsWith('./') || specifier.startsWith('../'))) {
        const target = new URL(specifier, context.parentURL);
        requireThat(target.protocol === 'file:' && within(received.revision.runtimeRoot, fileURLToPath(target)),
          'relative native module escapes original runtime');
        const selected = received.mappings.get(target.href);
        if (selected !== undefined && absent(selected.file.before)) {
          requireThat(!target.search && !target.hash && specifier.endsWith('.mjs'), 'exact added native module import required');
          requireAbsent(selected.file.target);
          return {url: target.href, format: 'module', shortCircuit: true};
        }
      }
      return nextResolve(specifier, context);
    }
    if (binding.kind === 'absent-public-export') {
      receiveSourcePort(binding, received.mappings, received.revision.runtimeRoot, {immutable: received.immutable});
      const supplier = nextResolve(binding.supplier.name + '/package.json', context);
      requireThat(supplier.url === pathToFileURL(binding.supplier.manifest).href,
        'actual original supplier manifest resolution differs');
      let refused = false;
      try { nextResolve(specifier, context); }
      catch (error) { if (error.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') throw error; refused = true; }
      requireThat(refused, 'original public export is not actually absent');
      return {url: pathToFileURL(binding.selected.path).href, format: 'module', shortCircuit: true};
    }
    // Prove what the actual original ESM resolver selected before changing this
    // one port. Other consumers, imports, conditions and supplier graphs delegate.
    const original = nextResolve(specifier, context);
    requireThat(original.url === pathToFileURL(binding.original.path).href, 'original native export resolution differs');
    for (const input of [binding.importer, binding.original, binding.selected])
      requireThat(digest(readFileSync(input.path)) === input.sha256, 'named module changed before resolution');
    requireThat(digest(readFileSync(binding.supplier.manifest)) === binding.supplier.sha256,
      'native supplier changed before resolution');
    return {...original, url: pathToFileURL(binding.selected.path).href, shortCircuit: true};
  }, load(url, context, nextLoad) {
    const selected = received.mappings.get(url);
    if (selected === undefined) return nextLoad(url, context);
    for (const binding of received.bindings.values())
      if (binding.kind === 'absent-public-export' && pathToFileURL(binding.selected.path).href === url)
        receiveSourcePort(binding, received.mappings, received.revision.runtimeRoot, {immutable: received.immutable});
    if (absent(selected.file.before)) requireAbsent(selected.file.target);
    else requireThat(digest(readFileSync(selected.file.target)) === selected.file.before,
      'native source changed before module load');
    requireThat(digest(readFileSync(selected.file.replacement)) === selected.file.after,
      'upstream source changed before module load');
    return {format: 'module', source: selected.source, shortCircuit: true};
  }};
}

export function registerNativeModuleRevision(path) {
  const revision = JSON.parse(bytesAt(path));
  return registerHooks(nativeModuleRevisionHooks(receiveNativeModuleRevision(revision)));
}
