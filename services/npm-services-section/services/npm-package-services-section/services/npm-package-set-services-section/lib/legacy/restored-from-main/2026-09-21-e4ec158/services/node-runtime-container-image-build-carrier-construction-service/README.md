# Node runtime container image build-carrier construction service

This package owns one pure boundary: it combines an admitted provider runtime
image requirement with explicit corporation-selected construction authority and
forms the deterministic, credential-free `Dockerfile` carrier needed by the
Node runtime container-image context materializer.

It does not copy a runtime release, build an image, resolve a tag, invoke
Cloud Build, select an Artifact Registry repository, deploy Cloud Run, or hold
credentials. Provider packages own their command, Node compatibility floor,
hashed Python requirements lock, and abstract runtime capabilities. A resource
owner selects exact construction artifacts: Node patch and digest-pinned base,
an admitted public `OciImageObservation`, Debian snapshot/architecture and exact top-level
package requests, CPython and venv, numeric runtime
identity, filesystem paths, listener port, and bounded shutdown timeout. This
package owns only their safe deterministic translation into Dockerfile bytes.

The `ociImageObservation` input is the unmodified singular output of
`@red-cup-engineering/oci-image-observation-service@0.1.0`. This package calls
that owner's public `verifyOciImageObservationRecord` API, then requires one
selected manifest/config/platform, statically observed exact Node and Debian
facts, and the final rootfs occupied UID/GID union. Runtime identity selection
refuses every observed collision. The authority retains the admitted owner
record and exposes `baseImageSource` as its exact observation ID, immutable
reference, selected index (when present), manifest, and config projection. It
does not mint a substitute observation.

## Public values

- `formNodeRuntimeContainerImageConstructionAuthority(input)` validates and
  content-addresses explicit construction selections.
- `admitNodeRuntimeContainerImageConstructionAuthority(value)` independently
  reforms an authority and refuses any mutation or non content.
- `formNodeRuntimeContainerImageBuildCarrierSet({ providerRequirement,
  authority })` admits both records and returns a content-addressed carrier set.
- `admitNodeRuntimeContainerImageBuildCarrierSet(value)` independently
  reconstructs the carrier bytes and identities.

The carrier set exposes this adapter directly to
`node-runtime-container-image-context-materialization-service`:

```js
{
  layoutPolicy: {
    type: "NodeRuntimeContainerImageLayoutPolicy",
    version: 1,
    entries: [{ id: "provider-entry", mount: "app/provider" }]
  },
  staticCarriers: [
    { path: "Dockerfile", mode: 420, utf8: "..." }
  ]
}
```

It also exposes a `runtimeProjection` containing every Dockerfile environment
value; concrete application, writable, temporary, venv, and Python-executable
paths; ownership and write policy; UID/GID, workdir, stop-signal, listener,
process argv, full provider secret and evidence-choice contracts, all external
environment names, and shutdown selection.
If the provider requirement does not declare an environment binding for its
Python executable or shutdown timeout, the projection names that fact in
`unresolvedBindings`. It likewise lists every still-external environment and
secret binding, including conditional evidence-alternative bindings. The
constructor does not invent an inert variable and pretend the program reads it.

The identity scope is exact carrier path, UTF-8 bytes, and regular-file mode.
Directory metadata is not represented. Runtime environment values and secret
references are deployment concerns and never enter these carriers.

The adapter has the context materializer's documented public input shape. This
package deliberately has no unpublished or workspace dependency on that owner,
so its own tests verify the adapter record and deterministic bytes, not a
cross-package materialization transaction. That end-to-end test belongs where
both independently released packages are composed.

The Debian snapshot is installed without moving repository aliases. The
constructor always unions its `ca-certificates`/Python/pip/venv needs with
provider additions, then emits exact top-level `name=version` package requests
with `--no-install-recommends`. These are not falsely called a complete `.deb`
closure: apt still resolves transitive artifacts for the selected architecture
inside the immutable snapshot. The downstream image-admission owner must
measure that resulting closure from the built image or SBOM. The provider lock
digest is verified before pip installs it with
`--require-hashes`. The application and venv remain root-owned and have all
write bits removed. Only the selected dedicated writable and temporary child
paths are owned by the non-root runtime identity. Shared roots such as `/tmp`
are not admitted as those selections. The final image starts the provider-owned
Node entrypoint directly. Construction does not invent a passwd/group name:
dedicated paths are numerically owned and `USER uid:gid` is numeric. A provider
that actually requires a named POSIX account must declare that separate
capability.

The OCI observation closes pre-build numeric collisions only. Snapshot apt
maintainer scripts may introduce identities later, so the downstream built-
image inspection must remeasure the final account databases and filesystem
owners before image admission.

The authority also requires the human-readable base-image tag to name the
observed exact Node patch and Debian suite. The tag is only a consistency hint;
the verified content-addressed `ociImageObservation`, not the mutable tag,
supplies the metadata evidence consumed by construction. Its requested digest
must equal the digest on the selected Dockerfile base reference even when their
human-readable repository/tag spellings differ.
