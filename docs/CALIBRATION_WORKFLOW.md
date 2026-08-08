# Governed Narration Calibration

Storyteller Studio treats narrator calibration as a production gate, not as a short voice demo. A technically valid voice can still sound repetitive, overperformed, emotionally false or tiring across a chapter. Calibration therefore evaluates varied manuscript demands, independent human review and continuity evidence before a narrator configuration can be approved for production.

## Purpose

A calibration session answers a narrower question than voice selection:

> Can this exact voice revision, provider, model and capability snapshot carry this book or series truthfully over sustained listening?

It does not authorise cloning, replace rights validation, waive transcript fidelity or make generated audio releasable. Those remain separate governed boundaries.

## Passage diversity

`proposeCalibrationPassages` selects distinct source spans for materially different narration risks:

- quiet intimacy;
- dialogue distinction;
- long syntax and breath architecture;
- dramatic pressure;
- exposition clarity;
- chapter endings and final-word control;
- pronunciation load;
- humour timing where available;
- manually designated critical passages.

The same easy passage cannot represent every risk. The proposal records segment, source and text hashes, counts, category and rationale codes without copying manuscript prose into the calibration record.

## Candidate evidence

A calibration candidate is accepted only as a reference to already governed evidence:

- an audio take artifact;
- transcript assessment artifact;
- technical assessment artifact;
- exact voice-profile revision;
- provider and model;
- provider capability fingerprint;
- deterministic generation-request hash;
- continuity score;
- unresolved finding codes.

A candidate with unresolved transcript, technical, rights or continuity findings cannot be selected for approval.

## Human review

The default policy requires blind review by at least two independent reviewers. Every selected take is scored from one to five on:

- listener relationship;
- textual truth;
- clarity;
- rhythm;
- emotional truth;
- restraint;
- sustained listenability;
- differentiation;
- pronunciation.

Sustained listenability is deliberately independent. A take may sound impressive for a few seconds while remaining synthetic, repetitive or exhausting across long-form narration.

The policy may require every reviewer to explicitly approve a selected take. A revise or reject decision therefore cannot be averaged away by higher numerical scores.

## Comparative take selection

When a passage has more than one objectively eligible take, Storyteller does not permit an operator to review only a preferred file and ignore the alternatives. Every eligible take must have the policy-required independent review coverage, and the alternatives must share a sufficiently large matched reviewer panel. Where blind review is required, only blind reviews count towards that comparison panel.

The current calibration schema ranks the matched panel's nine review dimensions using an equal-weight mean. Objective failures, unresolved findings and sub-threshold continuity exclude a take before ranking. A reject decision, or a non-approve decision under an approve-only policy, also prevents that take from becoming the selectable benchmark.

The selected take must tie for or exceed the highest comparative score among the remaining eligible alternatives. A lower-rated first render cannot be promoted merely because it was selected first. Ties remain available for a human director to resolve using scene context, neighbouring approved material and documented performance judgement.

## Continuity lock

All selected takes in one approved calibration session must share one provider, model and capability fingerprint. This prevents a narrator lock from being assembled from materially different execution systems.

A later provider or model migration requires a new calibration decision. It must not silently alter the narrator halfway through a book or series.

## Human approval

`approveCalibrationSession` requires:

- an eligible assessment;
- explicit `humanConfirmation: true`;
- a human approver identity;
- complete selected-take coverage;
- independent review coverage;
- complete matched-panel comparison whenever multiple eligible takes exist;
- a selected take that is not lower-rated than an eligible alternative;
- policy score thresholds;
- continuity compliance;
- no unresolved candidate findings.

Automation, worker and system identities cannot provide final calibration approval. Approval records the selected candidate and take-artifact identities, provider configuration, capability fingerprint, assessment fingerprint, approver and time.

## Durable persistence

`FileCalibrationSessionStore` persists calibration sessions through `FileProjectStore` using the dedicated `calibration-session` entity type.

Persistence preserves two linked revision chains:

1. the calibration domain revision and previous session fingerprint;
2. the store-envelope revision and previous envelope hash.

A save requires the current expected envelope revision and exactly the next valid calibration-domain revision. Stale writers, skipped revisions, altered scope and reversed timestamps fail without overwriting current state.

Creation is idempotent only when the existing session has the same immutable fingerprint. Reusing an identifier for different calibration intent is a conflict.

## Production calibration lock

`createProductionCalibrationLock` derives a narrow immutable production lock from an approved calibration session. The lock binds:

- calibration session revision and fingerprint;
- approval and assessment fingerprints;
- project and optional series scope;
- exact voice-profile revision;
- approved provider and model;
- provider capability fingerprint;
- selected reference-take count and set fingerprint;
- approval time.

The redacted public lock omits session, project, series, voice-profile, provider, model, capability and artifact identities. It reports only that a lock exists, the relevant revisions and counts, approval time and lock fingerprint.

A draft, rejected, tampered or future-dated approval cannot produce an effective production lock.

## Per-job binding

`FileGenerationCalibrationBindingStore` binds one ready generation job to one production calibration lock. The binding additionally fixes:

- job, project and segment identity;
- generation cache key;
- candidate count;
- the sole approved provider route;
- immutable binding fingerprint.

Bindings are create-once and idempotent only for identical production intent. Reusing a job identity for a different lock, route or scope is a conflict.

The binding uses the internal `generation-job` entity namespace with a calibration-specific identifier. It does not expose a normal API mutation route.

## Pre-provider admission

`CalibratedGenerationMaterialStore` rechecks production calibration after the worker owns an exclusive queue lease and resolves immutable generation material.

Before provider credentials or synthesis are used it requires:

1. a binding for the claimed job;
2. matching job, project, segment, cache key and candidate count;
3. exactly one provider route matching the approved provider;
4. matching voice-profile revision;
5. production execution mode;
6. the original approved calibration session still present and integrity-valid;
7. the persisted session still reproduces the exact lock fingerprint.

Preview and calibration-mode requests remain available before final production approval. The production lock is deliberately required only when generating releasable production candidates.

## Provider result enforcement

`createCalibrationBoundProviderRegistry` wraps approved provider adapters inside the private worker process.

For production requests the wrapper resolves the per-job binding again before calling the provider. After synthesis it rejects output when any of these differ from the approved calibration:

- provider identifier;
- model identifier in governed provenance;
- provider capability fingerprint.

Rejected output is returned as a safe calibration admission code before artifact ingestion. Provider response bodies, credentials and private calibration evidence are not copied into the error.

This second check protects against remote model drift, stale adapter configuration and a provider returning output under a different capability snapshot than the one approved during calibration.

## Audit boundary

Calibration audit events retain only bounded operational facts:

- project identity;
- whether the session is series-scoped;
- voice revision number;
- status;
- passage, candidate, review and selection counts;
- distinct reviewer count;
- current approval eligibility;
- session fingerprint.

Generation-binding audit metadata adds only job, project and segment identity, candidate count, numeric revisions and immutable fingerprints.

Audit metadata omits:

- manuscript prose;
- reviewer identities and notes;
- selected artifact identifiers;
- calibration session identifier;
- provider and model identity;
- provider capability fingerprint;
- voice-profile identity;
- generation-request hashes.

The audit actor remains available to authorised internal audit readers. It is not part of the redacted operational projection.

## Public projection

`storedCalibrationSessionPublicView` exposes readiness and aggregate quality state without exposing private review or execution evidence. It includes status, counts, category coverage, dimension averages, overall score, safe finding codes, revision, fingerprints and persistence time.

`generationCalibrationBindingPublicView` adds redacted job scope, lock state, numeric revisions, selected-reference count, approval time and fingerprints.

These projections omit reviewers, approvers, notes, provider details, voice identity, private artifacts, calibration session identity and manuscript text.

## API and browser boundary

The authenticated API exposes only redacted reads:

- `GET /v1/calibrations`;
- `GET /v1/calibrations/:sessionId`.

The file-backed read runtime is disabled by default and requires an explicit single-host acknowledgement in production. Every write method returns `CALIBRATION_MUTATION_API_NOT_EXPOSED`.

The normal web application and operator API cannot directly:

- add candidates;
- record reviews;
- select takes;
- approve or reject sessions;
- create production locks;
- bind generation jobs;
- overwrite calibration records;
- read private artifact or provider evidence.

Mutations require a dedicated internal review service with workspace entitlement, actor identity, optimistic revisions and explicit human confirmation.

## Series use

An approved calibration session is a prerequisite for promoting narrator anchors into series continuity. It does not itself rewrite the series bible. The continuity layer must record the approved voice revision and selected acoustic evidence explicitly, preserving any later recast or model migration as a reviewed change.

Every later book should run regression calibration against the approved series anchors before production. A deliberate recast or provider migration creates a new approved lock rather than silently replacing the original.

## Production migration

The file stores are appropriate for offline work, tests and one isolated host. Multi-user production will preserve the same contracts using:

- PostgreSQL optimistic revisions and transactional writes;
- transactional generation-binding admission with queue ownership;
- private object storage for take evidence;
- workspace authentication and role-based review rights;
- immutable reviewer and approval audit records;
- signed, short-lived access to authorised review media;
- retention and deletion policy for rejected takes;
- series-level regression calibration before later-book production;
- deployment metrics that report only redacted counts, states and safe finding codes.
