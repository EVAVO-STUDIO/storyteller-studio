# Admission-bound narrator mastering

The technical narrator mastering chain can prove that one reviewed chapter render, one approved pre-master artifact and one engineering result are processed into one exact mastered chapter. Production audiobook mastering additionally needs to retain the complete Audio Studio and Storyteller admission lineage that authorised that chapter performance.

`narrator-mastering-admission.ts` is the private production boundary between the admitted chapter review and the existing technical mastering chain.

## Why this boundary exists

The low-level `NarratorMasteringAuthorization` contains the raw human chapter-review and objective-monitor fingerprints. It does not, by itself, retain the complete profile-admission and production-job lineage introduced by the admitted chapter-review layer.

Without the admitted mastering boundary, the following evidence could be dropped before mastering:

- the exact Audio Studio profile-admission hash;
- the admitted Storyteller casting fingerprint;
- the zero-shot or adapted training provenance carried by that admission;
- the exact ordered production-job and cache-key set;
- the immutable chapter-source fingerprint;
- the admitted objective-monitor fingerprint; and
- the admitted human chapter-review fingerprint.

Production mastering now carries those identities alongside the existing source-master, engineering, plan, render and mastered-artifact evidence.

## Private context

Every admitted mastering operation receives one `AdmittedNarratorMasteringContext` containing:

```text
validated admitted casting
exact project manifest
complete ordered narrator production jobs
versioned monitoring policy
admission-bound narrator quality reference
```

The context is used to reopen and revalidate the admitted chapter review before mastering. It is private production state. Public projections do not expose the profile hash, training provenance, casting fingerprints, manuscript text, production cache keys or reviewer evidence.

## Authorization

`createAdmittedNarratorMasteringAuthorization` consumes the exact `AdmittedChapterNarratorReview` directly. It creates the existing technical authorization from the nested reviewed chapter and then binds both layers into:

```text
storyteller-admitted-narrator-mastering-authorization-v1
```

The authorization retains:

```text
profileAdmissionHash
admittedCastingFingerprint
castingFingerprint
profile ID + revision + profile hash
chapterSourceFingerprint
productionSetFingerprint
productionJobCount
admittedChapterReviewFingerprint
admittedMonitoringFingerprint
objectiveMonitoringFingerprint
chapterNarratorReviewFingerprint
full admitted casting
full admitted chapter review
technical mastering authorization
```

The technical authorization must agree with the admitted review on project, chapter, narrator revision, render, source, objective evidence, reviewer panel and chronology. A technically valid authorization for another render or another chapter cannot be rebound by recomputing the outer hash.

`bindAdmittedNarratorMasteringAuthorization` also exists for a technical authorization that was created immediately beforehand through the existing low-level chain. It performs the same complete cross-binding and cannot turn an unrelated authorization into production authority.

## Plan, render and mastered receipt

The admission lineage continues through three more immutable contracts:

```text
storyteller-admitted-narrator-approved-mastering-plan-v1
storyteller-admitted-narrator-approved-mastering-render-v1
storyteller-admitted-narrator-approved-mastered-chapter-v1
```

The admission-bound plan wraps the existing approved mastering plan and verifies that its low-level authorization is the exact authorization nested in the admitted record.

The admission-bound render receipt carries the exact profile admission, admitted casting, production set, admitted review and admitted monitor fingerprints beside the existing shell-free mastering render receipt and output-byte identity. Production rendering uses `renderAdmittedNarratorApprovedMasteringPlan`.

The admission-bound mastered chapter receipt carries the same lineage beside the existing mastered artifact chain, post-master engineering evidence, final mastered bytes and human-review eligibility. Production ingestion uses `ingestAdmittedNarratorApprovedMasteredChapter`.

A changed profile admission, job set, review, monitoring result, plan, render receipt, mastered artifact or outer fingerprint fails closed.

## Public privacy boundary

`admittedNarratorApprovedMasteredChapterPublicView` exposes only bounded operational state:

- project and chapter identity;
- mastering-plan identity;
- mastered artifact ID and revision;
- whether narrator admission is bound;
- production-job count;
- human-master-review eligibility;
- finding-code count; and
- final receipt fingerprint.

It does not expose:

- Audio Studio profile identity or profile hash;
- training campaign, checkpoint, dataset or engine-lock evidence;
- admitted or underlying casting fingerprints;
- production job IDs or cache keys;
- source or render hashes;
- objective monitoring internals;
- reviewer identities; or
- private filesystem and media locations.

## Human authority boundary

Every admission-bound mastering record retains:

```text
masteredListeningApproval=false
completeBookListeningApproval=false
titleNarratorApproval=false
titleReleaseAuthority=false
publicationAuthority=false
```

Mastering eligibility does not approve the mastered audio. The exact mastered chapter must still pass the independent complete post-master listening process, narrator-bound book sequencing, continuous whole-book review and separate release governance.

## Production flow

```text
complete Audio Studio profile admission
→ explicit admitted Storyteller casting
→ ordered v2 narrator production jobs
→ admission-bound objective monitoring
→ admission-bound human chapter review
→ admitted narrator mastering authorization
→ admitted narrator approved mastering plan
→ admitted narrator mastering render receipt
→ admitted narrator mastered chapter receipt
→ independent complete post-master listening review
→ narrator-bound book sequence
→ continuous whole-book review
→ separate retail release and publication decisions
```

The low-level mastering chain remains reusable technical machinery. Production narrator mastering uses the admission-bound layer so that technical processing cannot silently discard the evidence that authorised the performance.
