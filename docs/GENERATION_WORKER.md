# Governed Generation Worker

The generation worker is the internal production boundary between approved narration intent and durable media evidence. It is not a browser feature, a public API route or a direct provider wrapper.

## Internal worker boundary

A worker may operate only on an exclusive queue claim. The configured worker actor must match the worker identity recorded in the active lease. A different process cannot reuse another worker's claim merely because it knows a queue item identifier.

The coordinator receives already-resolved production material:

- exact segment text;
- immutable manuscript source hash;
- approved voice profile and revision;
- performance direction;
- approved pronunciations;
- intended execution mode and audio format;
- rights snapshot;
- optional parent artifacts;
- optional cost policy.

Project and series knowledge resolution remains separate from provider execution so a worker cannot silently invent voice, pronunciation or performance state.

## Deterministic requests

One deterministic synthesis request is built for each candidate index in the generation job. Its identifier and idempotency key cover:

- job and cache identity;
- segment and source hash;
- voice profile and revision;
- performance direction;
- pronunciation decisions;
- mode, format and sample rate;
- candidate index.

Provider fallback may change which approved adapter fulfils the request, but it does not change the underlying production intent.

## Natural narration production

Production routed through EVAVO Audio Studio requires a fingerprinted natural-narration plan before provider work begins. The plan binds the current manuscript segment to:

- its immutable source and exact text hash;
- the approved performance-direction fingerprint;
- language;
- bounded preceding and following manuscript context;
- an opening, middle, closing or standalone boundary;
- a production floor of three candidate performances;
- blind comparative review after objective artifact admission.

The context builder uses neighbouring segments from the same chapter to create bounded neighbouring context and stops at headings or scene breaks. It never inserts the current segment into its own context window. Context and plan fingerprints are carried in request metadata while raw neighbouring prose remains private provider input rather than a public operational field.

Audio Studio production is rejected before synthesis when the plan is absent, the candidate count is below three, the segment exceeds the long-form limit, the context or source binding was altered, or direction falls back to a generic objective or empty subtext. The automatically generated performance plan is a useful planning scaffold, but its shared default objective and subtext are explicitly treated as draft material and must be revised for the actual scene before production. Preview work may still use one candidate because it cannot be promoted as approved production.

Three candidate performances are a minimum comparison set, not permission to release any render automatically. Generated files still require transcript and engineering admission, independent listening review, comparative take selection, chapter continuity review and the existing artifact-release gates.

## Provider execution

The provider adapter registry and server-side credential resolver remain injected dependencies. The worker does not read browser configuration or receive credentials through queue records.

Each result must correlate to the deterministic request and executing adapter. Empty audio, an invalid content type, a mismatched provider identifier, a mismatched adapter version or a malformed capability fingerprint is treated as failed output rather than a candidate.

Credentials are never included in execution evidence, artifact records, queue state or public views.

## Candidate evidence

A successful provider result can create the following governed artifact bundle:

- one `audio-candidate` artifact;
- an optional `transcript` artifact;
- an optional `word-alignment` artifact;
- one job-level `audio-analysis` execution-evidence artifact.

Audio artifact and take identifiers include the deterministic request identity and observed audio content hash. If a retry returns different bytes, it becomes different evidence rather than silently replacing an earlier candidate.

Provider request identifiers remain private artifact provenance. The sanitised execution report stores only their hash. Arbitrary provider provenance is represented by a fingerprint rather than copied into ordinary operational views.

## Execution evidence

The execution report records:

- job status;
- provider route and candidate index for each attempt;
- succeeded, failed or skipped attempt state;
- finding codes;
- deterministic request identifiers;
- output content hashes;
- capability fingerprints;
- bounded usage and cost evidence;
- artifact identifiers;
- fingerprints for private provider references and provenance.

It deliberately excludes raw audio, provider credentials and uncontrolled provider error payloads.

## Cost policy

A project may specify a currency and maximum total estimated generation cost for the job.

When a cost policy is present:

- every accepted result must include finite non-negative cost evidence;
- every result must use the configured currency;
- mixed currencies are blocked;
- missing cost evidence is blocked;
- the summed estimate must not exceed the configured ceiling.

A cost-policy failure occurs after provider execution evidence is retained, but before queue completion. This makes unapproved spend visible without pretending that the resulting media is admitted production output.

A later reservation layer will move the budget decision ahead of provider execution using transactional account and project budgets. The current policy is still required as a post-execution fail-closed control.

## Failure classification

Worker outcomes are classified rather than collapsed into one generic exception:

### Configuration blocked

Missing adapters, missing server-side credentials or unresolved provider configuration block the queue item. They are not reported as completed and are not retried indefinitely.

### Retryable provider failure

Temporary synthesis failures or invalid provider responses use the queue's bounded retry state and deterministic backoff. Partial successful artifacts may remain as evidence, but they do not satisfy candidate count or complete the job.

### Artifact ingestion blocked

Media signature failure, private storage failure, artifact idempotency conflict or registry failure blocks the job. Successfully persisted evidence remains immutable and auditable.

### Artifact quarantined

A promoted object that fails final integrity verification becomes a quarantine revision. Any quarantined candidate blocks queue completion.

### Cost policy blocked

Missing, inconsistent or excessive cost evidence blocks completion after the sanitised execution report is persisted.

### Ownership lost

The heartbeat signal aborts provider work when the queue claim is no longer authoritative. Abort checkpoints run before candidate ingestion, execution-report persistence and terminal queue transitions. A stale worker therefore cannot continue writing artifacts or change queue state after another worker has recovered the job.

## Queue completion

Queue completion is attempted only when:

1. provider execution produced the complete candidate set;
2. every audio candidate is persisted and verified;
3. transcript, alignment and execution-report dependencies are persisted and verified;
4. artifact project, job and segment scope matches the claim;
5. rights remain valid for the intended use;
6. candidate count exactly matches the generation job;
7. cost policy passes;
8. the exclusive lease is still valid;
9. heartbeat scheduling has stopped before the terminal transition.

The queue stores only governed artifact identifiers, candidate take identifiers, the execution-report hash and bounded cost accounting. It does not store audio bytes or private object locators.

## No public execution route

Normal web and API code must not import or invoke the generation worker. Public application surfaces may create governed generation intent and inspect redacted state, but they do not claim leases, resolve provider credentials, invoke adapters, write objects, verify artifacts or complete jobs.

A future deployment will expose this coordinator only through an isolated worker process or private service identity.

## Lease heartbeat

`runGenerationWorkerWithHeartbeat()` composes the governed worker with `GenerationLeaseHeartbeatController`.

The runtime:

- starts bounded lease renewal before provider execution;
- combines heartbeat ownership loss with an optional process cancellation signal;
- serialises overlapping heartbeat operations;
- aborts the provider when ownership is lost;
- checks abort state before post-provider artifact writes;
- stops renewal before `complete`, `fail` or `block`;
- disposes temporary abort listeners;
- leaves expired or interrupted work recoverable by the queue reaper;
- returns only redacted worker and heartbeat summaries.

The heartbeat snapshot contains queue and job identifiers, safe timestamps, revision and renewal count. It does not contain the opaque lease token, token hash, worker identity, provider credentials or private object locators.

Detailed renewal semantics and failure states are documented in `LEASE_HEARTBEAT.md`.

## Remaining production runtime work

The internal coordinator now proves provider execution, evidence persistence, bounded retry, cost gates, lease renewal and stale-worker protection. A deployed worker service still requires:

- process-level claim polling and concurrency limits;
- transactional budget reservations before provider calls;
- graceful host shutdown across multiple active claims;
- provider-specific adapter packages and credential rotation;
- operational metrics without manuscript or credential leakage;
- PostgreSQL queue claims for multi-instance execution;
- production private object storage and retention reconciliation;
- dead-letter and operator recovery workflows.

These capabilities remain internal service concerns and must not be added to the normal web application or public operator API.
