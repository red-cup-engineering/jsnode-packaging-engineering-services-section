# Bounded native metadata batch composition

Status: design before activation. Base is npm PR48/main28e9cd48 and the source-qualified PNPM transport owner at PR5/main d66f2ae3. Existing one-name behavior stays supported.

## Required useful outcome

The same original composer accepts an explicitly selected small native metadata batch through PNPM's typed service contract. It retains the complete canonical selection/provider/transport context once per batch instead of creating a manual operation per package. It receives metadata only, never an installable graph, maturity, trust, artifact verification, source-policy migration or consumer lock.

## Allocation and contract

1. PNPM owns exact distinct-name grammar, maximum four names, deterministic representatives, one root-only query/wanted lock, the unchanged source policy, full metadata production, precise complete wanted output matrix, expected native mirror paths and per-name receiving. It preserves the original single-name service unchanged.
2. npm dispatches only between the two fixed qualified original service entrances based on the own-data query shape. This is not a caller-selected program, argv, callback, module loader or concurrency authority. It binds the exact provider source module digest, all supplier bytes/import edges, same Node/ps and the existing private worker source.
3. Both profiles retain exactly one producer and, only after complete producer receiving, one offline reader through the original bounded synchronous executor. The unchanged outer original process-group supervisor owns140s caller-selected finite deadline, normal/failed-child descendant settlement, cancellation and retained raw output. Existing45s phase/1MiB stop-threshold mapping and16MiB original-receipt evidence limit remain unchanged.
4. One launch-local inherited transport snapshot, original CA identities, canonical inputs, exclusive disjoint attempt and shared owned native cache retain their existing custody. Every selected fresh mirror must be absent; unrelated previously received mirrors may remain. No v11 relabeling, cache writer, cleanup, retry or hidden installation is introduced.
5. Parent acceptance requires exact batch projection/input and retained original producer/reader receipts, complete per-name mirrors from the original receiver, exact hashes unchanged after the original outer group settles, source/query/CA/input custody and successful terminal. Per-name static mirror fields remain static; wanted output is not age/trust or all-version native parsing.

## Concurrency, partial effects and resources

Native outdated uses Promise.all for every selected dependency name. The original metadata HTTP origin gate initially has infinite width; networkConcurrency1 is not a metadata serialization guarantee. Four selected names is the genuine bound on simultaneous top-level name-resolution chains. Each chain may perform redirects or conditional refetches. The exact observed HTTP concurrency is measured in native fixtures, not invented from configuration.

Full HTTP bodies are not hard-capped;64MiB mirror reception is post-write. The caller must admit the aggregate selected-body/cache/evidence/memory uncertainty with fresh capacity. A name-count limit is not a network-byte or peak-memory reservation. The first real batch is a finite set with known prior moderate metadata sizes; no complete727-name run is admitted.

A rejected native Promise.all does not cancel siblings and cache writes are best-effort: any subset may exist after failure. Preserve it after original group settlement, return refused/unknown for the entire batch, skip offline reader and never automatically delete/retry. A caller may compose an explicit finite sequence of disjoint admitted batches serially, but must stop before the next on refusal/unknown. No atomicity or restart recovery is claimed.

## Qualification obligations

Preserve all existing one-name cases. Receive an actual native two/three-name producer/offline reader, exact complete output and all mirrors, including a name with multiple retained selected versions. Observe the actual concurrent request count. Refuse incomplete/duplicate/extra output names, wrong representative, missing/drifting mirrors, source/CA drift and replay. Exercise one HTTP failure while a sibling is delayed and retain nontransactional prefix only after original settlement. Exercise original outer timeout and offline-reader failure, and reuse cache across disjoint success while older received mirrors stay unchanged. Exact source and packed receiving precede runtime adoption.

Measured baseline: three real names are received; the serial HTTP+zod tranche took52.593s and added4248984B cache plus3607266B retained evidence. Each input repeats1366192B supplier inventory (~89% of input), while preparation including795 selections is~170KB. A native batch amortizes that input and worker startup; it does not eliminate actual cache/body costs.
