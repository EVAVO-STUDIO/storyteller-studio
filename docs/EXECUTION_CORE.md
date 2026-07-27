# Execution core

Status: executable source foundation 0.2.0

This document defines the boundary between governed Storyteller Studio project knowledge and any external voice-generation provider.

## 1. Deterministic production requests

A synthesis request is derived from:

- the immutable manuscript source hash and stable segment identifier;
- the generation job and its cache key;
- the approved voice profile and exact revision;
- the approved performance direction;
- approved pronunciation entries;
- requested mode, format and sample rate;
- candidate index.

The complete request produces a deterministic SHA-256 idempotency key. A retry can therefore locate an existing provider attempt or output instead of silently creating another charge or replacing an approved take.

Generation jobs remain blocked unless upstream rights, provider and manuscript gates have passed. Candidate count is explicit and bounded. The execution layer will not reinterpret a blocked job as ready.

## 2. Provider adapter protocol

`packages/storyteller/src/provider-adapter.ts` defines the provider-neutral contract.

Every adapter must expose:

- a stable provider identifier;
- a semantic adapter version;
- a capability inspection operation;
- a synthesis operation;
- server-only credential handling through an external resolver;
- correlation identifiers and complete result provenance.

A capability snapshot records features, input limits, supported formats and sample rates, processing regions, retention and training-use policy, custom-voice consent enforcement, policy version and a deterministic fingerprint.

Provider-specific request syntax, model names, voice identifiers, SSML, dictionaries and response parsing stay inside adapters. The project domain retains canonical direction and pronunciation records rather than provider prompt strings.

## 3. Fallback without silent approval

The executor walks only the approved provider fallback route. For each candidate it records every skipped, failed and successful attempt.

A result is rejected when:

- its provider or adapter version does not match the executing adapter;
- its request or idempotency key cannot be correlated;
- it contains no audio bytes;
- it does not declare an audio media type;
- it lacks a valid capability-snapshot fingerprint.

A failed provider attempt may proceed to the next approved route. It never becomes an approved take. If no route produces a valid candidate, the report remains blocked or partial and records an explicit finding.

## 4. Durable local project state

`packages/storyteller/src/project-store.ts` provides the initial local and single-worker persistence boundary.

It supports revisioned entities for projects, series, manuscript revisions, story bibles, voice profiles, continuity anchors, performance plans, generation jobs, take assessments, chapter assemblies and release packages.

Each stored envelope contains:

- schema version and entity identity;
- monotonic revision;
- creation and save times;
- SHA-256 payload hash;
- link to the previous envelope hash;
- complete envelope fingerprint;
- JSON-safe payload.

Writes use entity locks, optimistic expected-revision checks, same-directory temporary files and replacement writes. Stale writes fail with a conflict rather than overwriting concurrent work. Reads verify both content and envelope fingerprints. Identifiers are constrained and all resolved paths are checked against their expected parent to prevent path traversal.

The file store is suitable for local development, fixtures, offline CLI use and a single isolated worker. Multi-user production will move behind the same repository interface to PostgreSQL and private object storage, preserving revision and integrity semantics.

## 5. Bounded audit events

Audit events contain opaque identifiers, action, entity revision, request identifier and bounded scalar metadata. They do not implicitly include manuscript text, voice samples, provider credentials or generated audio.

The current JSONL audit sink is append-only at the application layer and protected by a daily file lock. Production will additionally use a database transaction and immutable retention policy.

## 6. Series continuity

`packages/storyteller/src/series-continuity.ts` governs decisions that must survive later books.

A series continuity bible records:

- narrator and character voice assignments;
- exact voice-profile revisions;
- continuity anchors and acoustic envelopes;
- approved canonical pronunciations;
- performance principles;
- prohibited shortcuts;
- revision chain and deterministic fingerprint.

A later-book snapshot is assessed against that bible. The engine blocks silent narrator or character recasts, older voice-profile revisions, unexplained anchor changes, conflicting pronunciations and material acoustic drift. A documented story reason such as age, injury or language change can remain a review item, but it does not rewrite series canon automatically.

New names and pronunciations remain proposals. Approved changes are promoted in a separate revision linked to the previous fingerprint.

## 7. Regression calibration suite

The continuity engine selects a bounded regression suite across:

- dialogue and character transitions;
- long syntax and breath architecture;
- quiet narration;
- high-pressure material;
- chapter endings and final-word completeness.

Selection is stable and avoids choosing the same segment twice. Later-book calibration can therefore compare the current provider, voice revision and performance direction against representative approved material rather than one flattering sentence.

## 8. Verification

The source repository tests:

- deterministic capability and synthesis fingerprints;
- candidate-specific request idempotency;
- duplicate adapter rejection;
- provider fallback and missing-credential failure;
- project-store create, read, revision and list operations;
- stale-write conflict handling;
- content-tampering detection;
- path-traversal and cyclic-payload rejection;
- bounded audit records;
- series-bible fingerprints;
- compatible later-book performance;
- silent and approved recast handling;
- pronunciation conflict and proposal handling;
- continuity-bible promotion;
- regression-suite diversity.

The GitHub workflow installs from a clean checkout, runs architecture and private-boundary checks, type-checks all workspaces, runs the tests and builds the Next.js, API and CLI surfaces.
