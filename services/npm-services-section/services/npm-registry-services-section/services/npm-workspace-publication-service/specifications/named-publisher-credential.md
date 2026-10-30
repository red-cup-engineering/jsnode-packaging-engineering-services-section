# Named publisher credential carrier

## Requirement

The 2026-10-23 Bare Cedar Fog publication attempt reached the canonical registry
with the reviewed fixed Organizing artifact and received E401 because the
installed publisher had no named credential carrier. The Leader explicitly
authorized repairing that carrier using the existing identity. The original
implementation already exists at PR15 commit
`139e672a1fe8cba4de675c4869cef2d96f132505`, published as
`0.15.0-dev.0`. Recover its unchanged adapter into current publisher source so
ordinary consumers can use it without discarding later archive and Git-source
receiving fixes. A source repair alone is not installed publication capability.

## Design

Expose the original `createNamedPublisherCredentialProvider` through
`./named-publisher-credential`. Its implementation imports Node builtins only;
it changes no dependency selection or existing registry port. Before any value
read, the original custody registry must contain exactly one matching named
service consumer, selected password identifier, exact registry provider, account
owner and existing host holder. An unrelated house-env consumer does not qualify.
Construction grants nothing. The caller must finish its existing policy admission
before entering `withConfiguredEnvironment`.

The existing provider opens only that selected credential, rechecks metadata,
and receives the serving registry's actual bounded HTTPS `/-/whoami` response.
It keeps authentication in an ephemeral configured child context and admits only
its existing bounded npm/pnpm metadata, packing and publication commands plus tar
inspection. Metadata drift, foreign authority, redirects, arbitrary commands,
configuration overrides and use after callback completion refuse. Errors retain
fixed reason codes; configuration, values and raw subprocess diagnostics do not
escape. Cleanup removes transient carrier files.

Recover the same original optional authenticated read port on
`receiveRegistryTarball`. It requests the observed same-authority HTTPS artifact
URL through the named provider, rejects redirects and modified coordinates,
bounds the stream to 64 MiB and checks SHA512 before creating a destination.
The existing default transport remains available. This permits independent
receiving without npm startup, mutable metadata resolution or shared caches.
The existing `isVersionPublished` metadata operation already accepts that
provider fetch port and owns identity, reachability and actual-404 classification.

## Bounded host transport and public failure evidence

The actual 2026-10-23 named identity read returned HTTP200 after 9060 ms,
near the fixed 10000 ms bound. Its metadata reads then timed out at 10007 ms.
Allow the host caller to select `requestTimeoutMs`: a positive safe integer,
default 10000, maximum 60000. Invalid values refuse during construction before
any custody access. Apply the same bound to identity and receiving fetches and
the isolated npm fetch configuration. This changes only the selected host
provider, never global transport policy, identity or authority. Qualify the
30000 ms caller through the same independent source and registry receiving.

Sanitized subprocess errors retain the existing fixed protocol classification
and safe public execution facts: numeric exit code, allowlisted native system
code, HTTP E4xx/E5xx classifications, allowlisted termination signal and killed
boolean. Raw messages, output,
environment, arguments and configuration remain private. An unknown failure
must stay unknown rather than imply publication or absence.
When npm reports a structured `error.code`, retain it separately as
`reportedCode` only if it is a public identifier of at most 64 ASCII letters,
digits, underscores or hyphens starting with a letter. Reject values containing
the selected password, its base64 or the Basic username/password encoding,
case-insensitively, inside the existing credential closure. Never retain the
structured summary or any other raw error field.

This adapter does not add a credential holder, consumer, account or role. The
original custody owner separately admits and performs metadata changes. Neither
this leaf nor a successful registry observation supplies canonical Work, office
approval, replay authority, publication receiving or machine deployment. Existing
human-authorized fixed-artifact bootstrap remains bootstrap. Recovery of the
separate retained publication operation is outside this bounded source change.

## Receiving

Recover the original 42 native cases unchanged. They exercise admission before
value read, exact account authentication, command confinement, subprocess error
redaction, snapshot drift, fresh receiving cache, callback lifetime and cleanup.
Require byte identity of the recovered implementation and cases with PR15 and the
independently downloaded published leaf. Current registry and carrier tests must
continue passing against the current main dependency graph. Publication and an
independent consumer's installed receiving remain downstream obligations.
Recover the original nine direct-read cases for exact URL, foreign authority,
query/fragment, malformed/redirected/corrupt transfers and excess-stream refusal.
The native npm client also publishes a disposable fixture to an isolated
loopback registry using only dummy credentials. Receiving checks the actual
Basic account and archive bytes and distinguishes successful publication from
HTTP413 and HTTP503 through the sanitized public failure codes. This is a
protocol fixture, not evidence of production registry publication.
