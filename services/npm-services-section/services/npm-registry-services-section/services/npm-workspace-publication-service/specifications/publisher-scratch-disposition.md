# Terminal publication qualification scratch

A caller-owned reusable cache is separate from one qualification invocation's temporary directory. Selecting that cache must not retain the invocation scratch directory. The original gate now removes its own scratch on successful qualification, typed refusal, and unexpected error, and reports qualificationScratchDisposition only after removal succeeds. The returned report retains the actual steps, source version, refusal and qualification evidence. It does not claim that ephemeral path remains readable.

The shared cache, package source, lockfile, generated products, native worker custody controls and publication authority are unchanged. No disk survey, dependency-tree copying or periodic cleanup is added. An uncertain worker still belongs to its original outer worker-custody receiver.

Four scoped cases execute the original publisher against isolated child-command fixtures: qualification with cache, refusal with cache, unexpected error with cache, and qualification without cache. They require the temporary child output to disappear and the caller's cache marker and source version to survive. They do not publish a package or contact a paid provider.
