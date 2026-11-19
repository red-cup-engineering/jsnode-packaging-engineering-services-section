#!/usr/bin/env node
/**
 * CF-PNPM-012: Independent pnpm 12 acceptance oracle for the *packed CLI*.
 * Native npm tests cannot substitute for a real dependency manager install.
 * In CI, install pnpm 12.9.1 first and then run npm run verify:pnpm.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

function run(command, args, cwd, environment = {}) {
  // PNPM 12 otherwise resolves the root packageManager pin through a remote
  // package-manager bootstrap registry, even when the exact native binary has
  // been preinstalled. Explicitly REQUIRE the running pinned version rather
  // than downloading or silently accepting a mismatched pnpm.
  const pin = command === 'pnpm' ? { pnpm_config_pm_on_fail: 'error' } : {};
  const child = spawnSync(command, args, { cwd, env: { ...process.env, ...environment, ...pin }, encoding: 'utf8', timeout: 60_000 });
  if (child.error) throw child.error;
  return child;
}
function mustPass(result, label) {
  assert.equal(result.status, 0, `${label}: ${result.stdout}\n${result.stderr}`);
  return result.stdout;
}
const pnpm = mustPass(run('pnpm', ['--version'], process.cwd()), 'PNPM discovery').trim();
assert.equal(pnpm, '12.9.1', 'a different PNPM release cannot certify this original consumer');

// Actual blocked versions from original BCF release observation PR #595.
const denied = Object.fromEntries([
  '@contentauth/c2pa-node@0.6.3', '@foundry-rs/forge@1.7.1',
  'bufferutil@4.1.0', 'es5-ext@0.10.64', 'esbuild@0.28.1',
  'utf-8-validate@5.0.10', 'utf-8-validate@6.0.6',
  'workerd@1.20260828.1',
].map(name => [name, false]));
const externalName = '@fixture/denied-install';
// A name-wide false rule covers a local tarball; registry-version rules do not.
const externalMatcher = externalName;
const registryOnlyMatcher = `${externalName}@1.0.0`;
const temp = await mkdtemp(join(tmpdir(), 'pnpm-12-receiving-'));
try {
  const fixture = join(temp, 'external-script-source');
  await mkdir(fixture);
  await writeFile(join(fixture, 'package.json'), JSON.stringify({
    name: externalName, version: '1.0.0',
    scripts: { postinstall: `node -e "require('node:fs').writeFileSync(process.env.PNPM_ASSAY_MARKER, 'executed')"` },
  }, null, 2));
  mustPass(run('npm', ['pack', '--ignore-scripts', '--pack-destination', temp], fixture), 'fixture packaging');
  const tarball = (await readdir(temp)).find(file => file.endsWith('.tgz'));
  assert.ok(tarball, 'local third-party package tarball must exist');

  const specification = {
    root: { name: '@receiving/aggregate', version: '1.0.0' },
    pnpmVersion: pnpm,
    buildPolicy: { ...denied, [externalMatcher]: false },
    packages: [
      { path: 'packages/provider', manifest: { name: '@receiving/provider', version: '1.2.3' } },
      { path: 'packages/consumer', manifest: {
        name: '@receiving/consumer', version: '1.0.0',
        dependencies: { '@receiving/provider': '1.2.3', [externalName]: `file:../../../${tarball}` },
      } },
    ],
  };
  const specPath = join(temp, 'spec.json');
  const sourceRoot = resolve(import.meta.dirname, '..');
  const archive = mustPass(run('npm', ['pack', '--ignore-scripts', '--pack-destination', temp], sourceRoot), 'fabricator packing').trim();
  assert.ok(archive.includes('.tgz'));
  const fabricatorArchive = (await readdir(temp)).filter(file => file.endsWith('.tgz') && file !== tarball);
  assert.equal(fabricatorArchive.length, 1);
  const unpacked = join(temp, 'unpacked');
  await mkdir(unpacked);
  mustPass(run('tar', ['-xzf', join(temp, fabricatorArchive[0]), '-C', unpacked], temp), 'unpack fabrication consumer');
  const packedCLI = join(unpacked, 'package', 'scripts', 'fabricate-pnpm-workspace.mjs');

  for (const decision of ['explicit-denial', 'registry-only-denial', 'unknown-script']) {
    const output = join(temp, decision);
    const policy = { ...specification.buildPolicy };
    if (decision !== 'explicit-denial') delete policy[externalMatcher];
    if (decision === 'registry-only-denial') policy[registryOnlyMatcher] = false;
    await writeFile(specPath, JSON.stringify({ ...specification, buildPolicy: policy }));
    const receipt = JSON.parse(mustPass(run(process.execPath, [packedCLI, '--specification', specPath, '--output', output], temp), `fabricate ${decision}`));

    // Independently read bytes from the filesystem, not from its projection.
    const digest = createHash('sha256');
    for (const file of receipt.files) digest.update(file).update('\0').update(await readFile(join(output, file))).update('\0');
    assert.equal(digest.digest('hex'), receipt.digest);

    const marker = join(temp, `${decision}.marker`);
    const env = { PNPM_ASSAY_MARKER: marker };
    // PNPM 12 resolves its own packageManager config dependency against the
    // trusted registry on first use, even when its native executable is present.
    // The first bootstrap may obtain manager metadata; ordinary fixture
    // dependencies are local tarballs/workspace links. Frozen replay is offline.
    const firstInstallArgs = decision === 'explicit-denial'
      ? ['install', '--no-frozen-lockfile']
      : ['install', '--offline', '--no-frozen-lockfile'];
    const install = run('pnpm', firstInstallArgs, output, env);
    if (decision === 'explicit-denial') {
      mustPass(install, 'real PNPM 12.9.1 source-denied install');
      mustPass(run('pnpm', ['install', '--offline', '--frozen-lockfile'], output, env), 'real PNPM frozen replay');
      const link = await realpath(join(output, 'packages/consumer/node_modules/@receiving/provider'));
      assert.equal(link, resolve(output, 'packages/provider'));
      const policy = JSON.parse(mustPass(run('pnpm', ['config', 'get', '--json', 'allowBuilds'], output), 'pnpm interpreted policy'));
      assert.deepEqual(policy, specification.buildPolicy);
    } else {
      // A registry-version rule is NOT permission or denial for a tarball
      // source. An absent rule and a registry-only rule must both be rejected.
      assert.notEqual(install.status, 0, `unreviewed source script must be refused: ${install.stdout}\n${install.stderr}`);
      assert.match(install.stdout + install.stderr, /ERR_PNPM_IGNORED_BUILDS/u);
    }
    await assert.rejects(readFile(marker), { code: 'ENOENT' });
  }
  // CF-PNPM-014: a real PNPM resolver must reject a customer constraint
  // inconsistent with the locally held provider, rather than install a
  // different version silently substituted by this fabricator.
  for (const [requested, compatible] of [['^1.2.0', true], ['^2.0.0', false]]) {
    const output = join(temp, compatible ? 'range-compatible' : 'range-incompatible');
    const source = {
      ...specification,
      packages: specification.packages.map(item => item.manifest.name === '@receiving/consumer'
        ? { ...item, manifest: {
          ...item.manifest,
          dependencies: { '@receiving/provider': requested },
        } }
        : item),
    };
    await writeFile(specPath, JSON.stringify(source));
    mustPass(run(process.execPath,
      [packedCLI, '--specification', specPath, '--output', output], temp),
      `fabricate declared source range ${requested}`);
    const actual = JSON.parse(await readFile(join(output, 'packages/consumer/package.json'), 'utf8'));
    assert.equal(actual.dependencies['@receiving/provider'], `workspace:${requested}`);
    const install = run('pnpm', ['install', '--offline', '--no-frozen-lockfile'], output);
    if (compatible) {
      mustPass(install, 'PNPM native compatible range receiving');
      const link = await realpath(join(output, 'packages/consumer/node_modules/@receiving/provider'));
      assert.equal(link, resolve(output, 'packages/provider'));
    } else {
      assert.notEqual(install.status, 0,
        `PNPM MUST reject incompatible local provider: ${install.stdout}\n${install.stderr}`);
      // PNPM 12 wraps error prose across lines. Normalize only whitespace,
      // and require the exact refused requirement and held provider version.
      const refusal = (install.stdout + install.stderr).replace(/\s+/gu, ' ');
      assert.match(refusal,
        /No matching version found for @receiving\/provider@workspace:\^2\.0\.0 inside the workspace/u);
      assert.match(refusal, /Available versions: 1\.2\.3/u);
    }
  }
  console.log('CF-PNPM-014: PNPM 12.9.1 retained compatible local provider and refused incompatible declared range');
  console.log('CF-PNPM-012: PNPM 12.9.1 real workspace linking, frozen replay, exact observed denials and unknown-script refusal passed');
} finally {
  await rm(temp, { recursive: true, force: true });
}
