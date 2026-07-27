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

Audit metadata omits:

- manuscript prose;
- reviewer identities and notes;
- selected artifact identifiers;
- provider and model identity;
- provider capability fingerprint;
- voice-profile identity;
- generation-request hashes.

The audit actor remains available to authorised internal audit readers. It is not part of the redacted operational projection.

## Public projection

`storedCalibrationSessionPublicView` exposes readiness and aggregate quality state without exposing private review or execution evidence. It includes status, counts, category coverage, dimension averages, overall score, safe finding codes, revision, fingerprints and persistence time.

It omits reviewers, approvers, notes, provider details, voice identity, private artifacts and manuscript text.

## API and browser boundary

The engine and file store are internal capabilities. The normal web application and operator API must not directly:

- add candidates;
- record reviews;
- select takes;
- approve or reject sessions;
- overwrite calibration records;
- read private artifact or provider evidence.

A later API slice may expose authenticated read-only redacted projections. Mutations require a dedicated review service with workspace entitlement, actor identity, optimistic revisions and explicit human confirmation.

## Series use

An approved calibration session is a prerequisite for promoting narrator anchors into series continuity. It does not itself rewrite the series bible. The continuity layer must record the approved voice revision and selected acoustic evidence explicitly, preserving any later recast or model migration as a reviewed change.

## Production migration

The file store is appropriate for offline work, tests and one isolated host. Multi-user production will preserve the same contracts using:

- PostgreSQL optimistic revisions and transactional writes;
- private object storage for take evidence;
- workspace authentication and role-based review rights;
- immutable reviewer and approval audit records;
- signed, short-lived access to authorised review media;
- retention and deletion policy for rejected takes;
- series-level regression calibration before later-book production.
