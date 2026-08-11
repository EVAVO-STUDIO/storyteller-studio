# Admission-bound narrator retail track planning and production

A complete Storyteller audiobook can pass chapter review, mastering, post-master listening and continuous whole-book review while still being misclassified at the distributor boundary. An authorised synthetic narrator is not a human performance merely because the voice owner also owns the recording, training data or model output.

Production retail-track planning therefore begins from the exact admission-bound whole-book approval and an exact current distributor authorisation. Retail MP3 production then carries that same lineage through independent engineering and complete human listening approval.

The planning boundary is implemented by:

```text
packages/storyteller/src/narrator-retail-track-admission.ts
```

The production and approval boundary is implemented by:

```text
packages/storyteller/src/narrator-retail-track-production.ts
```

The sample and package approval boundary is implemented by:

```text
packages/storyteller/src/narrator-retail-package-admission.ts
```

The established technical planner, renderer, encoder and reviewer remain reusable:

```text
packages/storyteller/src/audiobook-retail-track-plan.ts
packages/storyteller/src/audiobook-retail-track-render.ts
packages/storyteller/src/audiobook-retail-track-encode.ts
packages/storyteller/src/audiobook-retail-track-review.ts
```

## Required upstream evidence

`createAdmittedNarratorRetailTrackPlan` accepts only:

- one exact `AdmittedNarratorWholeBookReviewApproval`;
- a current versioned ACX/Audible retail-encoding policy;
- title-scoped synthetic-narration eligibility evidence;
- a current Audible or ACX platform authorisation;
- an independent human retail-planning actor and decision time.

The whole-book approval already binds:

- Audio Studio profile admission;
- zero-shot or adapted training provenance;
- admitted Storyteller casting;
- chapter production jobs and immutable source lineage;
- objective monitoring and human chapter review;
- mastering and post-master review;
- opening and closing credits;
- complete lossless audiobook assembly;
- exact reference-master bytes;
- continuous editorial and engineering whole-book listening.

## Synthetic narration must be declared honestly

The Storyteller narrator route is synthetic whether its selected profile is zero-shot or fine-tuned. This boundary requires:

```text
sourceKind = synthetic-voice
platformAuthorisation = current title-scoped Audible or ACX evidence
```

It rejects `human-performance` classification for the Audio Studio-generated narrator.

The following are valuable but do not replace distributor authorisation:

- ownership of the source audiobook;
- performer and voice consent;
- commercial model licensing;
- training-data rights;
- a successful blind listening result;
- a successful continuous holdout;
- Storyteller casting approval;
- complete-book human approval.

Those records prove rights and quality. They do not prove that a distributor currently permits synthetic narration for the title.

## Deterministic technical planning

The planning wrapper delegates track construction to `createAcxAudiobookRetailTrackPlan` using the exact nested technical records from the approved narrator book:

```text
approved AudiobookSequence
approved AudiobookReferenceMasterChain
approved whole-book review session
approved reference-master ArtifactRecord
current retail policy
current narration eligibility and platform authorisation
```

Validation reconstructs the technical plan and requires the same fingerprint. It also rechecks:

- project and book scope;
- policy identity and currency;
- platform-authorisation scope and currency;
- rights fingerprint;
- exact reference-master artifact revision, hash and bytes;
- exact whole-book review session and approval;
- exact Audio Studio profile admission and Storyteller casting;
- exact total governed narrator-production-job count;
- all track blockers and output intent.

A rehashed outer record cannot substitute another reference master, policy, distributor authorisation, review or track plan.

## Admission-bound MP3 production and review

The production wrapper begins only after the admitted plan reports `retailEncodingEligible = true`. It consumes the established technical encode chain and its approved track-review session rather than introducing another renderer or reviewer.

Every retail MP3 must retain:

```text
admitted narrator retail-plan fingerprint
exact approved reference-master revision and bytes
exact generic track-plan fingerprint
exact render and command evidence
independent post-encode engineering evidence
complete editorial playback
complete engineering playback
third-person artifact approval
```

`createAdmittedNarratorRetailTrackApproval` revalidates the technical encode chain, the complete human review and every approved artifact revision. For each track it requires the same:

- ordinal, role and file name;
- planned and rendered track fingerprints;
- artifact ID and original revision;
- approved next revision and previous fingerprint;
- content SHA-256 and byte count;
- engineering evidence and eligibility state;
- reviewer-set and final-approval evidence;
- current rights scope;
- narrator admission, casting and voice revision.

A review from another plan, another narrator admission, another reference master or another encode chain cannot be attached to the selected title. Rehashing an outer wrapper does not permit approved MP3 substitution.

The resulting record may state:

```text
retailTrackEngineeringComplete = true
retailTrackListeningApproval = true
eligibleForRetailSample = true
```

It is still not a release decision.

## Admission-bound sample production and review

The sample boundary starts from one exact approved retail-track set. The selected source track must be the same approved artifact revision, content hash, byte count, review fingerprint and rights scope recorded by the admitted retail-track approval.

The established sample planner, renderer, private artifact ingestion and review workflow remain authoritative. The admission wrapper reopens those records and requires:

- an exact ready-for-rendering sample plan bound to the admitted retail policy and encode chain;
- independent confirmation that the chosen range is representative of the book and that both boundaries were completely listened to;
- a separate complete content-safety review that confirms the range comes from the audiobook and is suitable for a retail preview;
- an exact rendered sample chain with no engineering findings;
- complete editorial and engineering playback of the sample;
- third-person approval of the exact sample artifact revision;
- unchanged Audio Studio profile admission, Storyteller casting, voice pin and title-scoped platform authorisation.

`createAdmittedNarratorRetailSampleApproval` rejects another track approval, another sample plan, another rendered chain, another review session or another approved sample artifact even when an outer record is rehashed.

A successful sample approval may state:

```text
sampleContentSafetyApproval = true
retailSampleEngineeringComplete = true
retailSampleListeningApproval = true
eligibleForRetailPackage = true
```

It cannot authorise delivery, release or publication.

## Private package build, inspection and review

The package boundary begins from the exact admission-bound sample approval and the same approved retail MP3 file set. It reuses the established package manifest, private package build, independent package inspection and human package-review stages.

The package approval requires one coherent chain:

```text
admission-bound retail-track approval
→ admission-bound sample approval
→ immutable package manifest
→ private content-addressed package build
→ independent inspection of every expected package entry
→ complete editorial and engineering package review
→ third-person package approval
```

Validation requires the manifest, build and inspection to describe the same project, book, policy, track order, approved artifact revisions, sample artifact, media filenames, byte totals and package contents. Unexpected entries, substituted media, changed permissions, altered hashes, changed file counts or a review from another package fail closed.

`createAdmittedNarratorRetailPackageApproval` preserves the narrator admission, casting, voice pin, synthetic-narration declaration and current platform authorisation while confirming:

```text
privatePackageBuildComplete = true
privatePackageInspectionComplete = true
retailPackageReviewApproval = true
releaseDecisionEligible = true
```

`releaseDecisionEligible` means that a separate governed release authority may now evaluate the exact inspected package. It does not itself grant delivery, release, submission, retailer acceptance or publication authority.

## Zero-shot and adapted parity

Both narrator modes use the same retail boundary.

A zero-shot profile retains:

```text
training = null
```

An adapted profile retains its exact campaign, capability, engine lock, data partitions, selected checkpoint, training receipt and model tree through the nested profile admission.

Both remain synthetic narration and therefore require the same explicit platform authorisation. Retail MP3 rendering, sample production and private package review must not erase or invent training provenance.

## Authority boundary

An admitted retail track plan may report whether its technical track plan is ready for encoding. An admitted retail-track approval may report that exact MP3 engineering and human listening are complete. An admitted sample or package approval may report readiness for the next governed stage. None can grant:

```text
deliveryAuthority = true
releaseDecisionAuthority = true
titleReleaseAuthority = true
publicationAuthority = true
```

A separate release decision, delivery attempt, submission review, submission decision, retailer-status observation and live-publication verification remain mandatory.

## Public privacy boundary

The public planning projection exposes only bounded state:

- book identity;
- distributor and policy version;
- track and blocker counts;
- production-job count;
- synthetic-narration declaration;
- platform-authorisation presence;
- encoding eligibility;
- final wrapper fingerprint.

The public production, sample and package projections additionally expose bounded counts, byte totals and completion state. They do not expose:

- profile ID, revision or hash;
- profile-admission or casting fingerprints;
- training campaign, datasets, checkpoint or engine lock;
- platform-authorisation evidence ID;
- reference-master, plan, render, artifact or package hashes;
- production job IDs or cache keys;
- reviewer or approver identities;
- manuscript text, transcripts, audio or private filesystem paths.

## Production flow

```text
admission-bound complete audiobook approval
→ current ACX/Audible policy
→ exact synthetic-narration declaration
→ current title-scoped platform authorisation
→ admission-bound deterministic track plan
→ private MP3 rendering and independent engineering
→ complete per-track human review
→ admission-bound retail-track approval
→ governed retail sample and sample review
→ admission-bound sample approval
→ private package build, inspection and final package review
→ admission-bound package approval
→ separate release decision and delivery attempt
```
