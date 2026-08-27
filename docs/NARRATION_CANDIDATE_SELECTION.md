# Governed Narration Candidate Selection

Storyteller Studio generates multiple narration candidates because long-form performance quality cannot be reduced to a single provider response or a single scalar score. This layer turns that candidate set into an exact, auditable selection without weakening the existing expressive-performance, artifact, engineering or chapter-assembly contracts.

## Why this is additive

The existing chapter assembler remains responsible for its current admission rules: verified artifacts, explicit audio review approval, transcript and engineering bindings, rights, immutable source scope, output profile and edit decisions. Candidate selection does not replace those checks and does not change the required input shape of `createChapterAssemblyPlan`.

Instead, the release path can compose the existing plan with `ReviewedChapterAssemblyAdmission`. This preserves compatibility for existing callers while giving governed production a stronger route that proves each assembled take was selected from the exact reviewed candidate set.

## Source-of-truth contracts

This slice deliberately does not copy current quality thresholds into another policy object.

The existing expressive-performance contract remains authoritative for:

- minimum candidate count;
- minimum distinct reviewer count;
- naturalness, emotional truth, cadence, role fidelity, identity stability and sustained-listenability thresholds;
- blind comparative review;
- fallback-voice rejection;
- synthetic-artifact and generic-delivery rejection;
- voice identity and performance-plan binding.

The generation job remains authoritative for the production candidate-count upper bound and candidate-index domain. The artifact registry and audio-engineering evidence remain authoritative for media identity, byte count, technical eligibility and verification state.

The candidate-selection layer only adds the joins and decisions that those existing contracts do not own.

## Production flow

For each manuscript segment:

1. start from a validated production generation job and generate the complete candidate set;
2. retain each exact candidate as a governed `audio-candidate` artifact;
3. run the existing independent audio-engineering evidence path;
4. create the current expressive role binding and expressive performance plan;
5. obtain the current expressive observation and approved expressive review for the exact candidate;
6. call `createNarrationCandidateEvidenceFromContracts` with the exact audio content hash that was reviewed;
7. repeat for every candidate in the generation sequence;
8. call `createNarrationCandidateSelection` with the full zero-based candidate sequence and the selected take;
9. require a separate named human to give final listening confirmation;
10. create the normal chapter assembly plan;
11. bind one approved selection to every assembly segment with `createReviewedChapterAssemblyAdmission`, or use `createReviewedChapterAssembly` when creating both together.

Production and release code should prefer `createNarrationCandidateEvidenceFromContracts`. The lower-level `createNarrationCandidateEvidence` constructor exists for already-validated imports, deterministic replay and focused tests; it does not replace validation of live artifact, engineering and expressive source contracts.

## Candidate evidence

`NarrationCandidateEvidence` binds the reviewed decision to the exact candidate identity:

- zero-based candidate index;
- project, segment and take identities;
- audio artifact ID, artifact fingerprint, content hash and byte count;
- immutable manuscript source hash;
- generation request hash;
- engineering evidence fingerprint;
- expressive role, performance-plan, observation and review fingerprints;
- provider identity;
- rights fingerprint;
- producing and verifying actor identities;
- measured duration;
- current expressive score dimensions;
- exact blind comparative reviewer panel;
- technical and expressive approval state.

`createNarrationCandidateEvidenceFromContracts` additionally proves that the artifact is verified and not quarantined, the engineering evidence matches the exact audio bytes and is eligible, all expressive contracts join to the same project and segment, the provider matches provenance, rights are still usable at review time, and the supplied reviewed content hash is exactly the audio artifact content hash.

## Comparative selection

`NarrationCandidateSelection` requires:

- at least the current expressive minimum candidate count;
- a complete contiguous zero-based candidate sequence;
- one common project, segment, source hash, rights fingerprint, expressive role and expressive plan;
- the same blind reviewer panel across every candidate;
- unique take IDs, artifact IDs, audio content hashes and generation request hashes;
- selection of a candidate with the highest composite score across the current expressive score dimensions;
- immutable candidate and selection fingerprints;
- a final named human listening confirmation by an actor separate from the selector.

An automated or multimodel process may propose or record the selected candidate. It cannot provide the final human listening confirmation. Selection does not confer title-release or publication authority.

Ties are valid: if multiple candidates share the highest exact composite score, a human may choose among those top-rated candidates. A lower-rated candidate cannot be admitted without first producing new review evidence that changes the governed candidate set.

## Reviewed chapter assembly

`ReviewedChapterAssemblyAdmission` is an additive gate over a valid `ChapterAssemblyPlan`.

It requires exactly one selection for every assembly segment and checks that the selected:

- take ID matches the assembled take;
- audio artifact ID matches the assembled artifact;
- audio artifact fingerprint matches the assembled artifact revision;
- audio content hash matches the assembled bytes;
- project and manuscript source hash match the chapter plan;
- selection was human-approved before the chapter plan was created.

The admission preserves ordered segment IDs and ordered selection fingerprints beside the immutable chapter assembly fingerprint. It does not duplicate the full private artifact graph and it does not grant title-release or publication authority.

## Privacy and public state

Candidate evidence and selection records are private production/audit objects. They contain artifact identities, source and rights fingerprints, reviewer identities and the final confirmation binding.

`narrationCandidateSelectionPublicView` intentionally exposes only safe decision state: selection ID, segment ID, candidate/reviewer counts, selected candidate index, selected composite score, approval time, authority flags and the selection fingerprint. It does not expose private artifact IDs/hashes, source hash, rights fingerprint, final confirmation ID or approver identity.

## Failure model

The path fails closed on:

- candidate or evidence fingerprint tampering;
- incomplete or non-contiguous generation candidates;
- duplicated audio/request identity masquerading as distinct choices;
- review-panel drift between candidates;
- cross-project, cross-segment, source, rights, role or plan drift;
- a selected candidate that is not top-rated;
- automated final approval or selector/approver identity collapse;
- stale, expired or deletion-due rights;
- engineering evidence from different bytes;
- expressive review evidence from another plan, role, observation or provider;
- chapter assembly using a different take, artifact revision or content hash;
- selection approval that occurred after the assembly plan was created.

## Validation boundary

The focused candidate-selection regression suite covers deterministic selection, panel consistency, exact generation sequence, duplicate identity rejection, tamper resistance, human/automation separation, public-state redaction and package exports.

That focused evidence is not equivalent to the repository release gate. Merge and production acceptance still require the exact branch head to pass Storyteller Studio's full Node/npm `verify` chain, including typecheck and the complete engine/API/worker/CLI test set. No hosted GitHub Actions workflow is required or introduced by this slice.
