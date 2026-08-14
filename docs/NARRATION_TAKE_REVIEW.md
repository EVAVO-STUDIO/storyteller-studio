# Governed Narration Take Review

Storyteller Studio treats take selection as a versioned editorial decision, not as a filename choice, a provider score or an automatic preference for the first successful render.

## Repository boundary

Audio Studio remains responsible for synthesis, source ingestion, model execution, acoustic analysis and mastered audio tooling. Storyteller Studio owns the narrative decision: which authorised performance best serves the exact manuscript segment, its neighbouring context and the long-form listening experience.

The take-review record therefore stores no raw audio bytes and exposes no provider credential. It binds immutable Storyteller artifact revisions produced by the governed Audio Studio or provider pipeline.

## Candidate admission

A review session accepts between two and eight alternatives for one manuscript segment. Every candidate must provide one exact evidence chain:

- a verified, still-pending `audio-candidate` artifact;
- a verified transcript artifact that directly parents that candidate;
- a verified `audio-analysis` artifact that directly parents that candidate;
- eligible engineering evidence matching the candidate content hash and byte count;
- an `audio-analysis` artifact whose SHA-256 and byte count match the exact serialized engineering evidence;
- matching project, job, segment and take scope within each chain;
- matching generation-request hashes within each chain;
- one manuscript-source hash across all alternatives;
- one current rights fingerprint across all alternatives;
- current audiobook and commercial-use permission;
- one reviewed engineering-profile fingerprint across all alternatives.

An objectively failed, quarantined, already approved, rights-expired or mismatched artifact cannot enter the review session.

## Blind matched-panel review

Every admitted alternative must receive both required perspectives:

- **editorial** review for textual truth, pronunciation, pacing, rhythm, emotional truth, restraint, sustained listenability and continuity;
- **engineering** review for the same listening outcome plus technical comfort under a studio monitoring context.

Reviews are blind and require a full listen. Editorial review must include a consumer listening context. Engineering review must include studio headphones. Playback contexts are stored canonically so equivalent evidence cannot acquire different fingerprints through ordering alone.

The same editorial reviewer and the same engineering reviewer must assess every alternative. The two perspectives must be completed by different humans. Candidate creators and integrity verifiers cannot review their own work. Review-panel members cannot select or finally approve the winning take.

## Comparative selection

Storyteller computes a deterministic equal-weight mean across both current reviews and all nine dimensions. A candidate is ready only when both reviewers approve it and every dimension meets the configured minimum.

The selector may choose only the highest-rated candidate, or one of several exact ties. A lower-rated take cannot be promoted merely because it rendered first, cost less or was already highlighted in a user interface.

Any later review invalidates the existing selection. This prevents a stale decision from surviving changed evidence.

## Final approval and assembly binding

Final approval requires an explicit human confirmation. Storyteller re-checks rights at approval time, creates the normal approved artifact revision, and records:

- the selected take;
- comparative score;
- exact current review-set fingerprint;
- selector identity and time;
- final confirmation identity;
- approver identity and time;
- approved artifact fingerprint and revision;
- immutable session, selection and approval fingerprints.

Chapter assembly accepts the approved audio revision only when it is the direct revision successor of the selected pending candidate and matches the approved session exactly. It also requires the exact transcript artifact, engineering artifact and engineering-evidence fingerprints reviewed for that take. Each chapter segment snapshots the session, selection, approval and performance-context fingerprints. Replacing any reviewed evidence chain without replacing the governed decision therefore fails closed.

## Persistence and privacy

`FileNarrationTakeReviewStore` uses the existing revisioned project store, optimistic concurrency and audit events. An update must extend the previous session fingerprint and expected store revision.

The public projection reports only safe counts, status, policy version, revision, timestamps and fingerprints. It omits manuscript hashes, rights evidence, take IDs, artifact IDs, provider records, reviewer identities, selector identities, approver identities, scores by reviewer and private media locators.

## Current boundary

This workflow governs ordinary narration and dialogue take selection before chapter assembly. It does not replace calibration, chapter-master review, mastering review or retail-release approval. Those later gates remain independent and may impose stricter multi-reviewer or release-manager separation.
