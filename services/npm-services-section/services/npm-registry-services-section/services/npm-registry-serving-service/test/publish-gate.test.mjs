import assert from "node:assert/strict";
import { test } from "node:test";
import { checkPublication, houseSpecifier, DEFAULT_HOUSE_SCOPES } from "../src/publish-gate.mjs";
import { packTarball } from "./support/tarball.mjs";

// The gate reads a tarball and the packuments of the house packages it depends on; nothing is executed.
const NAME = "@red-cup-engineering/subject";
const dep = (name, versions, tags = {}) => ({
  name, "dist-tags": { latest: Object.keys(versions).at(-1), ...tags },
  versions: Object.fromEntries(Object.entries(versions).map(([version, exports]) => [version, { name, version, ...(exports === undefined ? {} : { exports }) }])),
});
const shelf = {
  "@red-cup-engineering/lib": dep("@red-cup-engineering/lib", {
    "1.0.0": { ".": "./index.mjs", "./old": "./old.mjs" },
    "1.1.0": { ".": "./index.mjs", "./thing": "./thing.mjs", "./features/*": "./features/*.mjs", "./package.json": "./package.json" },
    "2.0.0": { ".": "./index.mjs" },
    "3.0.0-beta.1": { ".": "./index.mjs", "./beta": "./beta.mjs" },
  }, { next: "3.0.0-beta.1" }),
  "@red-cup-engineering/bare": dep("@red-cup-engineering/bare", { "1.0.0": { ".": "./i.mjs" } }),
  "@red-cup-engineering/legacy": dep("@red-cup-engineering/legacy", { "1.0.0": undefined }),
  "@red-cup-engineering/other": dep("@red-cup-engineering/other", { "1.0.0": { ".": "./i.mjs", "./sub": "./sub.mjs" } }),
};
const publishedPackument = async (name) => shelf[name] ?? null;

async function check(files, { manifest = {}, version = "1.0.0" } = {}) {
  const bytes = packTarball({
    "package.json": { name: NAME, version, type: "module", exports: "./index.mjs", ...manifest },
    "index.mjs": "export {};\n",
    ...files,
  });
  return checkPublication({ name: NAME, version, bytes, publishedPackument });
}
const kinds = (violations) => violations.map(({ kind }) => kind);
const only = async (files, options, kind, pattern) => {
  const violations = await check(files, options);
  assert.deepEqual(kinds(violations), [kind], violations.map(({ message }) => message).join("\n"));
  assert.match(violations[0].message, pattern);
};

test("a package whose files, dependencies and imports agree is accepted", async () => {
  assert.deepEqual(await check({
    "src/a.mjs": 'import { x } from "@red-cup-engineering/lib";\nimport "@red-cup-engineering/lib/thing";\nexport * from "@red-cup-engineering/lib/features/deep/name";\nexport { y } from "@red-cup-engineering/other/sub";\nimport pkg from "@red-cup-engineering/lib/package.json" with { type: "json" };\nimport fs from "node:fs"; import z from "left-pad"; import w from "./b.mjs"; import "@red-cup-engineering/subject"; import "@notmine/anything/deep";\nawait import("@red-cup-engineering/lib/thing"); await import(`@red-cup-engineering/other`); await import(name);\n',
    "src/b.cjs": 'module.exports = () => import("@red-cup-engineering/bare");\n',
  }, { manifest: {
    dependencies: { "@red-cup-engineering/lib": "^1.1.0", "left-pad": "^1.0.0" }, peerDependencies: { "@red-cup-engineering/other": "1" },
    optionalDependencies: { "@red-cup-engineering/bare": "1.0.0" },
    exports: { ".": "./index.mjs", "./features/*": "./src/*.mjs" }, bin: { subject: "./src/a.mjs" },
  } }), []);
});

test("export-target: an exports target that is not in the tarball, under any condition Node resolves", async () => {
  await only({}, { manifest: { exports: "./missing.mjs" } }, "export-target", /exports\["\."\] -> \.\/missing\.mjs is not in the tarball/u);
  await only({}, { manifest: { exports: { ".": { import: "./index.mjs", default: "./gone.cjs" } } } }, "export-target", /exports\["\."\]\.default -> \.\/gone\.cjs/u);
  await only({}, { manifest: { exports: { ".": { import: "./nope.mjs", types: "./never-shipped.d.ts" } } } }, "export-target", /\.import -> \.\/nope\.mjs/u);
  await only({}, { manifest: { exports: { ".": "./index.mjs", "./x": "x.mjs" } } }, "export-target", /must start with "\.\/"/u);
  await only({}, { manifest: { exports: { ".": "./index.mjs", "./list": ["./a.mjs", "./b.mjs"] } } }, "export-target", /none of \.\/a\.mjs, \.\/b\.mjs/u);
  assert.deepEqual(await check({ "b.mjs": "" }, { manifest: { exports: { ".": "./index.mjs", "./list": ["./a.mjs", "./b.mjs"], "./types": { types: "./t.d.ts", default: "./index.mjs" } } } }), []);
});

test("export-target: a pattern target must match at least one shipped file", async () => {
  await only({}, { manifest: { exports: { ".": "./index.mjs", "./f/*": "./src/*.mjs" } } }, "export-target", /\.\/src\/\*\.mjs matches no file/u);
  assert.deepEqual(await check({ "src/a/b.mjs": "" }, { manifest: { exports: { ".": "./index.mjs", "./f/*": "./src/*.mjs" } } }), []);
});

test("bin-target: a bin that is not in the tarball, in both forms", async () => {
  await only({}, { manifest: { bin: "./cli.mjs" } }, "bin-target", /bin -> \.\/cli\.mjs is not in the tarball/u);
  await only({ "ok.mjs": "" }, { manifest: { bin: { ok: "ok.mjs", broken: "bin/broken.mjs" } } }, "bin-target", /bin\["broken"\] -> bin\/broken\.mjs/u);
});

test("undeclared-import: static, re-export and dynamic imports of a house package that is not declared", async () => {
  const violations = await check({
    "a.mjs": 'import x from "@red-cup-engineering/lib";',
    "b.mjs": 'export * from "@lenticule-science/nowhere/deep";',
    "c.mjs": 'export { y } from "@emsenn/y";',
    "d.cjs": 'const load = () => import("@561-group/z");',
    "e.mjs": 'await import(`@coesite-operations/w`);',
    "f.mjs": 'import "@causeway-services/v";',
  });
  assert.deepEqual(kinds(violations), Array(6).fill("undeclared-import"));
  assert.match(violations[0].message, /^a\.mjs:1 imports "@red-cup-engineering\/lib", but @red-cup-engineering\/lib is not in dependencies, peerDependencies or optionalDependencies$/u);
  assert.match(violations[3].message, /^d\.cjs:1 imports "@561-group\/z"/u);
});

test("undeclared-import reads syntax: comments, strings, other scopes, devDependencies and bundled node_modules do not count", async () => {
  await only({ "a.mjs": 'import x from "@red-cup-engineering/lib";' }, { manifest: { devDependencies: { "@red-cup-engineering/lib": "^1.0.0" } } }, "undeclared-import", /a\.mjs:1/u);
  assert.deepEqual(await check({
    "a.mjs": '// import x from "@red-cup-engineering/lib";\n/* import("@red-cup-engineering/lib") */\nconst s = \'import x from "@red-cup-engineering/lib"\';\nconst t = `${s} @red-cup-engineering/lib`;\nawait import(`@red-cup-engineering/${s}`);\n',
    "node_modules/bundled/index.mjs": 'import "@red-cup-engineering/lib";',
    "vendor/node_modules/x.js": 'import "@red-cup-engineering/lib";',
    "notes.txt": 'import "@red-cup-engineering/lib"',
  }), []);
});

test("undeclared-import finds an import in a .js file whether its package is CommonJS or ESM", async () => {
  await only({ "a.js": 'import x from "@red-cup-engineering/lib";' }, { manifest: { type: "module" } }, "undeclared-import", /a\.js:1/u);
  await only({ "a.js": 'import x from "@red-cup-engineering/lib";' }, { manifest: { type: "commonjs" } }, "undeclared-import", /a\.js:1/u);
  await only({ "a.js": 'const { x } = require("left-pad"); module.exports = () => import("@red-cup-engineering/lib");' }, { manifest: { type: "commonjs" } }, "undeclared-import", /a\.js:1/u);
});

test("dependency: a declared house dependency with no published package, version or tag is refused", async () => {
  await only({}, { manifest: { dependencies: { "@red-cup-engineering/ghost": "^1.0.0" } } }, "dependency", /dependencies\["@red-cup-engineering\/ghost"\]: "\^1\.0\.0": @red-cup-engineering\/ghost is not published in this registry/u);
  await only({}, { manifest: { dependencies: { "@red-cup-engineering/lib": "^1.2.0" } } }, "dependency", /no published version satisfies "\^1\.2\.0" \(newest published: 3\.0\.0-beta\.1, 2\.0\.0, 1\.1\.0, 1\.0\.0\)/u);
  await only({}, { manifest: { peerDependencies: { "@red-cup-engineering/lib": "9.9.9" } } }, "dependency", /peerDependencies\["@red-cup-engineering\/lib"\]: "9\.9\.9"/u);
  await only({}, { manifest: { optionalDependencies: { "@red-cup-engineering/lib": "nightly" } } }, "dependency", /neither a semver range nor a dist-tag/u);
  await only({}, { manifest: { dependencies: { "@red-cup-engineering/lib": "workspace:*" } } }, "dependency", /workspace:\*/u);
  await only({}, { manifest: { dependencies: { "@red-cup-engineering/lib": "file:../lib" } } }, "dependency", /file:\.\.\/lib/u);
  await only({}, { manifest: { dependencies: { alias: "npm:@red-cup-engineering/ghost@1" } } }, "dependency", /@red-cup-engineering\/ghost is not published/u);
  assert.deepEqual(await check({}, { manifest: { dependencies: { "@red-cup-engineering/lib": "next", "@red-cup-engineering/bare": "*", "@red-cup-engineering/other": ">=1 <2", alias: "npm:@red-cup-engineering/lib@1" } } }), []);
});

test("dependency-subpath: an import the highest published version satisfying the range does not export", async () => {
  await only({ "a.mjs": 'import "@red-cup-engineering/lib/thing";' }, { manifest: { dependencies: { "@red-cup-engineering/lib": "~1.0.0" } } }, "dependency-subpath",
    /^a\.mjs:1 imports "@red-cup-engineering\/lib\/thing", but @red-cup-engineering\/lib@1\.0\.0 \(the highest published version satisfying "~1\.0\.0"\) does not export "\.\/thing"; it exports \., \.\/old\. Published versions that do export it: 1\.1\.0$/u);
  // the highest satisfying version is the one judged, not the lowest or the latest tag
  await only({ "a.mjs": 'import "@red-cup-engineering/lib/thing";' }, { manifest: { dependencies: { "@red-cup-engineering/lib": "^1.0.0 || ^2.0.0" } } }, "dependency-subpath", /@red-cup-engineering\/lib@2\.0\.0 \(the highest/u);
  assert.deepEqual(await check({ "a.mjs": 'import "@red-cup-engineering/lib/thing";' }, { manifest: { dependencies: { "@red-cup-engineering/lib": "^1.0.0" } } }), []);
  await only({ "a.mjs": 'import "@red-cup-engineering/lib/beta";' }, { manifest: { dependencies: { "@red-cup-engineering/lib": "^1.0.0" } } }, "dependency-subpath", /does not export "\.\/beta"/u);
  assert.deepEqual(await check({ "a.mjs": 'import "@red-cup-engineering/lib/beta";' }, { manifest: { dependencies: { "@red-cup-engineering/lib": "next" } } }), []);
});

test("dependency-subpath: pattern exports, ./package.json and the package root are all judged by the manifest", async () => {
  const dependencies = { "@red-cup-engineering/lib": "1.1.0", "@red-cup-engineering/bare": "1.0.0" };
  assert.deepEqual(await check({ "a.mjs": 'import "@red-cup-engineering/lib/features/a"; import "@red-cup-engineering/lib/features/a/b"; import "@red-cup-engineering/lib/package.json";' }, { manifest: { dependencies } }), []);
  await only({ "a.mjs": 'import "@red-cup-engineering/lib/featurez/a";' }, { manifest: { dependencies } }, "dependency-subpath", /does not export "\.\/featurez\/a"/u);
  await only({ "a.mjs": 'import "@red-cup-engineering/bare/package.json";' }, { manifest: { dependencies } }, "dependency-subpath", /@red-cup-engineering\/bare@1\.0\.0 .* does not export "\.\/package\.json"; it exports \.$/u);
  await only({ "a.mjs": 'import "@red-cup-engineering/bare/";' }, { manifest: { dependencies } }, "dependency-subpath", /does not export "\.\/"/u);
  await only({ "a.mjs": 'import "@red-cup-engineering/lib/old";' }, { manifest: { dependencies: { "@red-cup-engineering/lib": "1.1.0" } } }, "dependency-subpath", /does not export "\.\/old"/u);
});

test("dependency-subpath: a dependency that declares no exports exposes its files and is not second-guessed", async () => {
  assert.deepEqual(await check({ "a.mjs": 'import "@red-cup-engineering/legacy"; import "@red-cup-engineering/legacy/lib/x.js";' }, { manifest: { dependencies: { "@red-cup-engineering/legacy": "1" } } }), []);
});

test("self-import: the package named by its own exports, or not at all", async () => {
  await only({ "a.mjs": 'import "@red-cup-engineering/subject/nope";' }, {}, "self-import", /a\.mjs:1 imports "@red-cup-engineering\/subject\/nope", but @red-cup-engineering\/subject does not export "\.\/nope" \(its exports: \.\)/u);
  await only({ "a.mjs": 'import "@red-cup-engineering/subject/y/missing";', "src/y/z.mjs": "" }, { manifest: { exports: { ".": "./index.mjs", "./y/*": "./src/y/*.mjs" } } }, "self-import", /exports as \.\/src\/y\/missing\.mjs, but that file is not in the tarball/u);
  await only({ "a.mjs": 'import "@red-cup-engineering/subject/x";' }, { manifest: { exports: { ".": "./index.mjs", "./x": "./x.mjs" } } }, "export-target", /\.\/x\.mjs is not in the tarball/u);
  await only({ "a.mjs": 'import "@red-cup-engineering/subject";' }, { manifest: { exports: undefined, main: "index.mjs" } }, "self-import", /declares no "exports"/u);
  assert.deepEqual(await check({ "a.mjs": 'import "@red-cup-engineering/subject/y/z";', "src/y/z.mjs": "" }, { manifest: { exports: { ".": "./index.mjs", "./y/*": "./src/y/*.mjs" } } }), []);
});

test("source: a module that names a house package but cannot be read is refused, not skipped", async () => {
  await only({ "a.mjs": 'import x from "@red-cup-engineering/lib"; const = ;' }, {}, "source", /a\.mjs names a house package but cannot be read as JavaScript: .*\(1:/u);
  assert.deepEqual(await check({ "broken.mjs": "const = ;", "notes.js": "{{{" }), [], "a file that names no house package is not this gate's business");
});

test("tarball: bytes that are not a package, or are another package, are refused", async () => {
  const bad = async (bytes, pattern) => {
    const violations = await checkPublication({ name: NAME, version: "1.0.0", bytes, publishedPackument });
    assert.deepEqual(kinds(violations), ["tarball"]);
    assert.match(violations[0].message, pattern);
  };
  await bad(Buffer.from("fixture artifact"), /not gzip/u);
  await bad(packTarball({ "index.mjs": "" }), /no readable package\.json/u);
  await bad(packTarball({ "package.json": "{" }), /no readable package\.json/u);
  await bad(packTarball({ "package.json": { name: "@red-cup-engineering/other", version: "1.0.0" } }), /is @red-cup-engineering\/other@1\.0\.0, not the @red-cup-engineering\/subject@1\.0\.0 being published/u);
  await bad(packTarball({ "package.json": { name: NAME, version: "1.0.1" } }), /@red-cup-engineering\/subject@1\.0\.1, not/u);
});

test("every violation is reported at once", async () => {
  const violations = await check({ "a.mjs": 'import "@red-cup-engineering/lib/thing"; import "@red-cup-engineering/other";' }, {
    manifest: { exports: { ".": "./index.mjs", "./gone": "./gone.mjs" }, bin: { c: "./c.mjs" }, dependencies: { "@red-cup-engineering/lib": "~1.0.0", "@red-cup-engineering/ghost": "1" } },
  });
  assert.deepEqual(kinds(violations).sort(), ["bin-target", "dependency", "dependency-subpath", "export-target", "undeclared-import"]);
});

test("house specifiers are recognised by scope and split into package and subpath", () => {
  assert.deepEqual(houseSpecifier("@red-cup-engineering/a", DEFAULT_HOUSE_SCOPES), { name: "@red-cup-engineering/a", subpath: "." });
  assert.deepEqual(houseSpecifier("@emsenn/a/b/c.mjs", DEFAULT_HOUSE_SCOPES), { name: "@emsenn/a", subpath: "./b/c.mjs" });
  for (const other of ["left-pad", "@types/node", "node:fs", "./x", "@red-cup-engineering", "@red-cup-engineeringx/a"]) assert.equal(houseSpecifier(other, DEFAULT_HOUSE_SCOPES), null, other);
});
