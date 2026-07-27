# Governed generation execution

Storyteller Studio separates a **generation intent** from provider execution. A project plan may be correct while execution remains blocked because rights, provider capabilities, credentials, budget, storage or human review are not ready.

## Execution boundary

`GenerationJob` is the immutable intent produced from a project manifest. `FileGenerationQueue` is the first durable worker boundary. It does not contain manuscript files, raw voice samples or generated audio. It stores only the bounded information required to schedule an already-governed segment and references to outputs held by an approved artifact store.

The queue is deliberately provider-neutral. A worker claims a job, constructs deterministic candidate requests, resolves server-only credentials, executes the approved provider fallback chain, validates each result and then records either:

- a completion containing an execution-report hash, result identifiers and artifact references;
- a retryable failure with bounded backoff;
- a permanent failure;
- a governance block;
- or an operator cancellation.

A provider response is never treated as approved narration merely because bytes were returned. Transcript fidelity, final-word coverage, technical audio metrics, continuity and human dramatic review remain separate gates.

## Queue state model

The persisted states are:

- `queued` — eligible when `availableAt` is reached;
- `leased` — exclusively claimed by one worker for a bounded interval;
- `retry-wait` — available after deterministic exponential backoff;
- `completed` — provider execution finished and output references were recorded;
- `blocked` — an upstream governance or configuration gate is unresolved;
- `failed` — no attempts remain or the failure is permanent;
- `cancelled` — an operator stopped further work.

Every transition uses the project store's optimistic revision check. A stale worker cannot overwrite a newer cancellation, completion or lease. Expired leases are reaped and can be retried until the explicit attempt ceiling is reached.

## Lease security

Workers receive a 256-bit opaque lease token. Only its SHA-256 hash is persisted. The raw token is never written to queue state or audit metadata. Heartbeat, completion, block and failure operations require the live opaque token and use timing-safe hash comparison.

Cancellation does not require possession of the worker lease because an authorised operator must be able to halt expensive or unsafe work. Cancelling a leased item removes the persisted lease immediately, so a late worker completion fails closed.

## Idempotency and retries

Queue identifiers derive from stable generation-job identifiers. Enqueue is idempotent only when the immutable generation intent matches. Reusing the same job identifier for a different cache key, provider route, segment or candidate count raises an idempotency conflict rather than silently replacing work.

Retries use bounded exponential backoff with deterministic jitter. This avoids synchronised retry storms while preserving reproducibility. Attempt counts increase when a lease is claimed, not merely when a row is inspected.

## Persistence and artifacts

The file-backed queue is appropriate for:

- local production;
- fixtures and tests;
- a single isolated worker host;
- offline or workstation-assisted authoring.

It is not represented as the final multi-instance production queue. A hosted deployment should preserve the same state and revision contracts in PostgreSQL, use row-level or advisory locking for claims, and store audio, transcripts, waveform data and artwork in private object storage.

Queue completion records may include:

- execution-report hashes;
- provider result identifiers;
- private artifact object keys or governed artifact identifiers;
- bounded cost and currency metadata.

They must not include raw audio bytes, provider credentials, signed download URLs, manuscript text or voice samples.

## Audit posture

State transitions append bounded audit events that record the actor, action, entity revision and non-sensitive operational metadata. Audit events never receive lease tokens, credentials, manuscript passages or media payloads.

## Production worker sequence

1. Reap expired leases.
2. Claim the highest-priority eligible item.
3. Load the immutable project, segment, performance direction, voice revision and pronunciation revision.
4. Re-check rights and provider capability fingerprints.
5. Reserve the approved cost budget.
6. Build deterministic candidate synthesis requests.
7. Execute the provider fallback chain with cancellation and timeout propagation.
8. Write provider outputs to private temporary artifact storage.
9. Verify hashes, content type, transcript coverage and technical media integrity.
10. Record completion references or a bounded failure.
11. Release or reconcile the budget reservation.
12. Send generated candidates to the human review and QA workflow; do not auto-release them.

## Required hosted-production additions

Before production provider execution is enabled, the repository still requires:

- workspace-authenticated queue APIs;
- PostgreSQL queue persistence and transactional claims;
- private object storage with encryption and retention controls;
- provider credential and region configuration;
- per-project budget reservations and usage reconciliation;
- artifact malware and format validation where uploaded inputs are accepted;
- speech-to-text alignment and pronunciation checking;
- FFmpeg/ffprobe analysis workers;
- human take review, surgical regeneration and chapter assembly;
- release-package and distributor-profile validation.
