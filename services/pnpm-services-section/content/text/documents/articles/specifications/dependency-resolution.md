---
title: "Dependency resolution"
description: "Transitive closure of package dependencies. Conflict detection. Semver-equivalent versioning."
kind: spec
status: normative
version: "0.2"
---

# Dependency resolution

Computes the transitive closure of package dependencies for installation; detects conflicts; rejects unresolvable graphs.

## 1. Algorithm

Standard SAT-based dependency resolution:

1. Read the requested package's `depends-on`.
2. For each dependency, find a package version satisfying the version constraint.
3. Recurse on selected versions.
4. Detect conflicts: two paths require incompatible versions of a third package.
5. Backtrack on conflict; try alternate version selections.
6. If no satisfying assignment exists: `PCD_DEPENDENCY_UNRESOLVABLE`.

## 2. Versioning

Semver-equivalent: `MAJOR.MINOR.PATCH`.

Constraints: `>=0.3.0`, `>=0.3.0,<0.4.0`, `~0.3.1` (compatible patches), `^0.3.1` (compatible minors).

Pre-release qualifiers: `0.3.0-alpha.1`, `0.3.0-beta.2`. Pre-releases excluded from default resolution unless explicitly opted in.

## 3. Lock file

After resolution, the substrate writes a lock file (a substrate cell with the resolved package versions) so subsequent installs are deterministic.

## 4. Conflict reporting

On unresolvable: report which packages have conflicting requirements:

```
ERROR: cannot resolve dependencies
  package:driver-smtp-imap requires package:driver-base >=0.2.0,<0.3.0
  package:driver-mqtt requires package:driver-base >=0.3.0
  No version of package:driver-base satisfies both.
```

## 5. Conformance

Dependency resolution passes:

1. Solvable graphs produce correct lock file.
2. Conflicting graphs produce clear error messages.
3. Pre-releases excluded by default; included with explicit opt-in.

## 6. Plan 9 / Unix analogue

| Unix | Dependency analogue |
|---|---|
| apt's solver | Substrate dependency-resolution |
| `Cargo.lock`, `package-lock.json` | Substrate lock-file cell |
| dnf / pacman | Substrate package-install |
