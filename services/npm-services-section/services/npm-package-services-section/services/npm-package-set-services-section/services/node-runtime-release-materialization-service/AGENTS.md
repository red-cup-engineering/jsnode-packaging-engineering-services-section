# Node runtime release materialization service

This package owns exactly one capability: turn one admitted Node package in a
workspace into an isolated, content-addressed runtime filesystem closure.

It MUST derive local runtime dependencies from package manifests, preserve the
source bytes used, reject ambiguous package identities, exclude mutable runtime
state and development interiors, and emit recomputable provenance.

It does not install dependencies, promote releases, restart processes, deploy
containers, mutate source packages, or claim that its own artifact is accepted.
