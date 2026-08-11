# Admission-bound credits, audiobook assembly and whole-book review

Storyteller’s narrator production chain does not stop at an approved mastered chapter. Opening and closing credits, complete-book assembly, lossless reference mastering and continuous whole-book listening must retain the same exact Audio Studio profile admission and Storyteller casting as the chapters between them.

The production boundary is implemented by:

```text
packages/storyteller/src/narrator-credit-admission.ts
packages/storyteller/src/narrator-audiobook-admission.ts
```

The established generic modules remain reusable technical machinery for non-narrator media:

```text
book-credit-generation.ts
book-credit-take.ts
book-credit-take-review.ts
book-credit-master.ts
book-credit-delivery.ts
audiobook-sequence.ts
audiobook-render.ts
audiobook-reference-master.ts
audiobook-reference-master-review.ts
```

## Why this boundary exists

A technically approved credit or complete-book WAV can still belong to the wrong narrator revision. A plain `voiceProfileId` and revision are not sufficient when the selected voice is governed by an immutable Audio Studio admission containing rights, benchmark, holdout and, for adapted voices, training provenance.

Without the admission-aware boundary, production could accidentally combine:

- chapters rendered by one admitted narrator;
- opening credits generated under another profile or provider route;
- a closing credit from an older revision;
- a generic chapter sequence that no longer retains the admitted chapter approvals;
- a reference master rendered from substituted component bytes;
- a whole-book human approval detached from the admitted source chain.

The new contracts reject those substitutions while delegating technical generation, mastering and review rules to the existing proven engines.

## Admission-bound credit generation

`createAdmittedNarratorBookCreditGeneration` starts from an approved exact credit script and one `AdmittedNarratorCasting`.

The resulting job is a real `storyteller-narrator-production-job-v2`, not a generic production job with an optional profile hash. Its deterministic identity binds:

```text
Audio Studio profile-admission hash
admitted Storyteller casting fingerprint
underlying human casting fingerprint
profile ID + revision + profile hash
approved credit script and text hash
calibration-lock fingerprint
provider route
performance direction
pronunciations
candidate count
rights and cost policy
output format and sample rate
```

The exact profile hash is copied into private generation material. The guarded worker therefore rechecks the same admission and voice pin before provider execution.

Changing the profile admission, narrator revision, credit script, direction, pronunciation, rights, provider route or format changes both the job identity and cache key.

## Admission-bound credit delivery

`createAdmittedNarratorBookCreditDelivery` accepts only the complete technical credit evidence:

```text
admission-bound credit generation
approved multi-role selected-take review
lossless BookCreditMasterChain
BookCreditDeliverySnapshot
```

Storyteller reopens and validates:

- exact plan, job and cache identity;
- exact voice profile ID, revision and hash;
- selected take and human approval;
- transcript and engineering evidence already admitted by the technical chain;
- exact lossless credit-master artifact revision, content hash and byte count;
- rights, output profile and delivery chronology.

A detached opening or closing WAV cannot enter admitted book assembly merely because it has valid PCM metadata.

## Admission-bound complete audiobook sequence

`createAdmittedNarratorAudiobookSequence` consumes:

```text
one AdmittedNarratorBookChapterSequence
one admitted opening-credit delivery
one admitted closing-credit delivery
one exact approved mastered artifact for every chapter
```

It delegates deterministic ordering and timeline construction to `createAudiobookSequence`, then seals the result inside:

```text
storyteller-admitted-narrator-audiobook-sequence-v1
```

The wrapper proves that:

- all chapters share one exact Audio Studio profile admission;
- both credits share that admission and admitted casting;
- every approved chapter artifact matches its admission-bound chapter approval;
- opening credit is first and closing credit is last;
- the generic chapter-sequence fingerprint is unchanged;
- rights, engineering profile and lossless output profile are consistent;
- total production-job count includes every chapter segment plus both credit jobs.

Missing, duplicate, cross-casting, cross-admission, reordered or substituted components fail closed.

## Exact render and reference master

`ingestAdmittedNarratorAudiobookReferenceMaster` accepts only a render of the exact admitted audiobook sequence.

The admission-aware reference record retains the complete `AudiobookRenderEvidence`, not only a caller-supplied hash. Validation rechecks:

- sequence ID, revision and fingerprint;
- ordered source artifact IDs, revisions, hashes and byte counts;
- expected complete-book duration;
- output format, sample rate, channels and bit depth;
- render command and output hashes;
- the generic reference-master evidence graph;
- independent post-render engineering;
- exact private reference-master artifact bytes.

Rehashing an outer record cannot attach a render from another sequence or a reference master from another set of components.

## Continuous whole-book listening review

`createAdmittedNarratorWholeBookReviewBinding` wraps the existing rigorous reference-master review session. Editorial and engineering reviewers must still:

- listen to the complete book;
- cover every component;
- cover every adjacent boundary;
- use the required consumer, speaker and studio playback contexts;
- independently assess narrative continuity, sustained listenability, credit accuracy, transitions, silence, tonal consistency and technical defects;
- leave no unresolved findings;
- meet every governed score threshold.

`recordAdmittedNarratorWholeBookReview` preserves the generic immutable review history inside a second admission-aware revision chain. The two revision numbers, timestamps and fingerprints must agree.

A third independent human completes `createAdmittedNarratorWholeBookReviewApproval`, which revalidates the current reference-master artifact and rights before recording:

```text
completeBookListeningApproval = true
eligibleForRetailEncoding = true
```

It must retain:

```text
titleNarratorApproval = false
titleReleaseAuthority = false
publicationAuthority = false
```

A successful whole-book listen permits the approved reference master to enter the separate retail-encoding process. It does not appoint a default narrator, authorize platform delivery or claim publication.

## Zero-shot and adapted parity

The same boundary supports both narrator modes without flattening provenance.

A zero-shot profile retains:

```text
training = null
```

An adapted profile retains the exact campaign, capability, engine lock, dataset partitions, selected checkpoint, training receipt and model tree already bound by the profile admission.

Credit generation, book assembly, reference mastering and whole-book review cannot silently invent training evidence for a zero-shot voice or discard it from a fine-tuned voice.

## Public privacy boundary

The public projections expose bounded operational state only:

- project, book and component counts;
- durations;
- production-job count;
- admission-complete state;
- complete-book listening status;
- retail-encoding eligibility;
- final wrapper fingerprints.

They do not expose:

- profile ID, profile hash or voice identity;
- profile-admission or casting fingerprints;
- training campaign, datasets, checkpoint or engine lock;
- job IDs or cache keys;
- credit script text;
- manuscript text or transcripts;
- private audio or filesystem paths;
- reviewer identities, notes or finding acknowledgements;
- render commands or private provider evidence.

## Production flow

```text
owned and rights-bound narrator source
→ Audio Studio zero-shot comparison or governed fine-tuning
→ immutable Audio Studio profile admission
→ explicit admitted Storyteller casting
→ admission-bound chapter production and review
→ admission-bound mastering and mastered listening approval
→ admission-bound narrator chapter sequence
→ admission-bound opening and closing credit generation
→ exact human credit-take selection and lossless credit masters
→ admitted complete audiobook sequence
→ exact lossless audiobook render
→ admission-bound reference master and independent engineering
→ continuous editorial and engineering whole-book listening
→ independent complete-book approval
→ separate retail encoding, package review, delivery and publication decisions
```

Do not use a raw `BookCreditDeliverySnapshot`, raw `AudiobookSequence`, raw `AudiobookReferenceMasterChain` or raw `AudiobookReferenceMasterReviewSession` alone as production narrator authority once this admission-aware boundary exists.
