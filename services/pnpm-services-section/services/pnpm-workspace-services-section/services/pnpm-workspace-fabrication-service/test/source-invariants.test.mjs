import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readdir, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { fabricatePnpmWorkspace, projectPnpmWorkspace } from '../src/fabricate-pnpm-workspace.mjs';

const source = {
  root: { name: '@customer/aggregate', version: '1.0.0' },
  pnpmVersion: '12.9.1',
  buildPolicy: { 'esbuild@0.28.1': false, 'utf-8-validate@5.0.10': false },
  packages: [
    { path: 'packages/Zeta', manifest: { name: '@customer/zeta', version: '1.0.0', dependencies: { '@customer/alpha': '2.0.0', '@external/lib': '3.1.0' }, exports: { './beta': './src/beta.mjs', '.': './src/index.mjs' } } },
    { path: 'packages/alpha', manifest: { name: '@customer/alpha', version: '2.0.0', type: 'module', scripts: { test: 'node --test', check: 'node --check src/index.mjs' } } },
  ],
};

// CF-PNPM-007: The pnpm workspace file takes glob patterns, so escaping and
// JSON-quoting an exact path does not stop it changing the selected packages.
test('exact customer paths cannot silently become pnpm workspace glob selectors', () => {
  for (const path of ['packages/*', 'packages/?', 'packages/[ab]', 'packages/{a,b}', '!packages/alpha', 'packages/+(a|b)', 'packages/alpha/**']) {
    assert.throws(() => projectPnpmWorkspace({ ...source, packages: [{ path, manifest: { name: 'test', version: '1.0.0' } }] }), /package path|workspace selector/u, path);
  }
});

// CF-PNPM-008: A symlink at ANY ancestor is an alias to foreign territory.
// The original guard checked only the final output's lstat, after mkdir.
test('a parent symlink cannot redirect fabrication into unrelated territory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pnpm-ancestor-'));
  const foreign = join(root, 'foreign');
  const redirected = join(root, 'parent-alias');
  try {
    await mkdir(foreign);
    await symlink(foreign, redirected, 'dir');
    await assert.rejects(fabricatePnpmWorkspace({ specification: source, outputDirectory: join(redirected, 'product') }), /symbolic link|symlink|alias/u);
    assert.deepEqual(await readdir(foreign), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

// CF-PNPM-009: Two equivalent JSON input trees must not emit different bytes
// or digest merely because their producer constructed object keys in another
// order or their package array is in another order.
test('equivalent JSON sources canonicalize across reversed key and package ordering', () => {
  const alternate = {
    packages: [...source.packages].reverse().map(x => ({
      manifest: Object.fromEntries(Object.entries(x.manifest).reverse().map(([key, value]) => [key, (value && typeof value === 'object' && !Array.isArray(value)) ? Object.fromEntries(Object.entries(value).reverse()) : value])),
      path: x.path,
    })),
    buildPolicy: Object.fromEntries(Object.entries(source.buildPolicy).reverse()),
    pnpmVersion: source.pnpmVersion,
    root: { version: source.root.version, name: source.root.name },
  };
  const a = projectPnpmWorkspace(source), b = projectPnpmWorkspace(alternate);
  assert.equal(a.digest, b.digest);
  assert.deepEqual([...a.files], [...b.files]);
});

// CF-PNPM-010: A presented digest and file list must not be mutable after
// projectPnpmWorkspace has told receivers it is immutable.
test('projection contents and package identity are immutable after digesting', () => {
  const p = projectPnpmWorkspace(source);
  const original = [...p.files];
  const originalDigest = p.digest;
  assert.throws(() => p.files.set('packages/alpha/package.json', '{"name":"altered"}'), TypeError);
  assert.throws(() => p.files.delete('package.json'), TypeError);
  assert.throws(() => p.packages.push({ path: 'injected' }), TypeError);
  assert.throws(() => { p.packages[0].name = 'injected'; }, TypeError);
  assert.deepEqual([...p.files], original);
  assert.equal(p.digest, originalDigest);
});

// CF-PNPM-011: Recompute digest from *the materialized files* independently
// of any in-memory projection and verify the package identity carrier.
test('the fabricated receipt is independently reproducible from disk bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pnpm-digest-'));
  try {
    const receipt = await fabricatePnpmWorkspace({ specification: source, outputDirectory: join(root, 'product') });
    const digest = createHash('sha256');
    for (const path of [...receipt.files].sort()) {
      const body = await readFile(join(root, 'product', path));
      digest.update(path).update('\0').update(body).update('\0');
    }
    assert.equal(digest.digest('hex'), receipt.digest);
    assert.equal((await readdir(join(root, 'product'))).includes('package.json'), true);
    assert.deepEqual(receipt.packages.map(p => p.name).sort(), ['@customer/alpha', '@customer/zeta']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

// CF-PNPM-009: Canonicalization is also a type admission boundary, never a
// coercion through JSON.stringify which would erase unsupported values.
test('non-JSON and accessor-backed sources refuse before projection', () => {
  const accessorManifest = {};
  Object.defineProperty(accessorManifest, 'name', { enumerable: true, get() { throw new Error('untrusted accessor executed'); } });
  for (const manifest of [accessorManifest, { name: 'pkg', version: '1.0.0', data: Number.POSITIVE_INFINITY }, { name: 'pkg', version: '1.0.0', data: undefined }, { name: 'pkg', version: '1.0.0', data: new Date() }]) {
    assert.throws(() => projectPnpmWorkspace({ ...source, packages: [{ path: 'packages/test', manifest }] }), /inert JSON|finite JSON/u);
  }
});

test('zero-package workspace renders an explicit empty array instead of YAML null', () => {
  const p = projectPnpmWorkspace({ ...source, packages: [] });
  assert.match(p.files.get('pnpm-workspace.yaml'), /^packages: \[\]\n/u);
});
