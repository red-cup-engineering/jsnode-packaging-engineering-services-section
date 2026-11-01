# Transient publication resources

## Receiving purpose and existing ownership

Repeated fabrication must release its disposable allocation after a settled
operation without deleting original source, caller-owned storage, durable
artifacts or resources whose execution custody remains uncertain. The package
publication owner already separates source carriers, content-addressed artifacts,
frozen-consumer installation and native worker evidence. These lifetimes remain
separate. This specification refines the carrier staging and explicit stale
installation maintenance operations; it does not create another cleaner or
authorize a background sweep.

## Carrier staging

`packSourceRegistryClosure` owns the unique `.carrier-*` directory it allocates
inside the caller's artifact destination. Its lifetime begins at successful
allocation, before globbing, copying or projecting the manifest.

- C1: every settled exit after allocation, including a pre-pack copy refusal,
  retires that exact owned staging directory. The surrounding destination and
  original source remain caller-owned.
- C2: a successful operation retains the immutable content-addressed archive and
  its existing packed receipt. The progress receiver observes the archive after
  staging retirement; an incomplete carrier does not emit a packed receipt.
- C3: the change does not retire `.registry-install-*` staging retained by
  `receiveSourceRegistryConsumers` after uncertain native worker custody. That
  operation's process evidence, original failure and recovery boundary retain
  their existing semantics.

This settled-operation contract does not assert cleanup after process death or
prove descendant quiescence from an exception. Native consumer lifetime remains
governed by `native-frozen-store-assembly.md` and `source-worker-evidence.md`.

## Explicit installation maintenance

`deriveStaleInstallTreesReport` supplies a conservative maintenance classification;
`prune-stale-install-trees --apply` explicitly selects removal. A prune candidate
is not proof that no process uses the installation. The caller must establish
its own maintenance window and preserve active or uncertain work.

- I1: a package-owned regular `package-lock.json`, `npm-shrinkwrap.json` or
  `pnpm-lock.yaml` is supported lock evidence. A directory, symlink or absent
  path is not a package-owned lock. Lock presence does not prove registry
  availability, full native reinstall receiving or unmodified installed bytes.
- I2: a nearest ancestor npm workspace declaration or `pnpm-workspace.yaml`
  keeps the member installation. Search stays within the explicit scan root.
  A package's own PNPM policy file is not an ancestor declaration. PNPM workspace
  patterns are not evaluated by this maintenance classifier: an ancestor policy
  is conservatively sufficient to keep. An unreadable or invalid existing ancestor
  manifest also keeps the member because standalone ownership is unknown. Scan
  roots must be unredirected and outside installation trees; installed packages'
  nested dependency trees remain with their installation owner.
- I3: installations beneath the publication owner's `.registry-install-*` or
  `.source-bindings-*` families are kept. Their durable owner resolves disposition;
  a lock or old timestamp cannot settle their execution custody.
- I4: recent filesystem modification anywhere in owned package source or its
  installation is an additional keep signal, including a source snapshot outside
  Git. One walk receives both trees; `.git` has its separate Git observer. Symlink
  targets are not traversed. Failed activity observation keeps the tree. Old
  timestamps are never affirmative quiescence or completion evidence.
- I5: existing recent-Git, systemd and MCP reference keeps remain in force. A
  classification does not replace current caller custody when removal is selected.

## Clause receiving

| Clause | Original-owner verification |
| --- | --- |
| C1 | `test/source-registry-staging-cleanup.test.mjs`: native FIFO copy refusal leaves only caller evidence; source and FIFO remain |
| C2 | Same file: successful archive survives; no staging remains when progress receives the packed receipt |
| C3 | Source delta is confined to `packSourceRegistryClosure`; original consumer uncertainty tests and implementation remain unchanged |
| I1–I5 | `test/prune-stale-install-trees.test.mjs` and `test/stale-install-resource-lifecycle.test.mjs`: native CLI plus explicit owner/classification controls |
