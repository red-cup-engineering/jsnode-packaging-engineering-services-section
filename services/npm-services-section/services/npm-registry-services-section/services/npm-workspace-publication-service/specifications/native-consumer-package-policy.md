# Preserve native PNPM package policy

A source consumer's `.pnpmfile.cjs` is part of its frozen installation policy. The 24 October main-runtime receiving attempt refused because the temporary native project retained the committed hook checksum but omitted the original hook. Keep the exact bounded regular hook file beside the selected manifest, workspace policy, registry configuration and lock. Record its SHA-256, compare the source and temporary bytes after installation, and refuse any drift before replacing the previous installation. Never erase the checksum, relax the frozen lock, or infer a replacement hook. This supports the project's default `.pnpmfile.cjs`; arbitrary external policy modules remain subject to native PNPM refusal.

Qualification includes real PNPM 11.28.5 against an isolated local registry, unchanged lock bytes, a useful installed package, and refusal of source or temporary-hook drift. These checks do not assert production deployment or business success.
