# Admission-bound narrator retail track planning

A complete Storyteller audiobook can pass chapter review, mastering, post-master listening and continuous whole-book review while still being misclassified at the distributor boundary. An authorised synthetic narrator is not a human performance merely because the voice owner also owns the recording, training data or model output.

Production retail-track planning therefore begins from the exact admission-bound whole-book approval and an exact current distributor authorisation.

The boundary is implemented by:

```text
packages/storyteller/src/narrator-retail-track-admission.ts
```

The established technical planner remains reusable:

```text
packages/storyteller/src/audiobook-retail-track-plan.ts
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

The wrapper delegates track construction to `createAcxAudiobookRetailTrackPlan` using the exact nested technical records from the approved narrator book:

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

## Zero-shot and adapted parity

Both narrator modes use the same retail boundary.

A zero-shot profile retains:

```text
training = null
```

An adapted profile retains its exact campaign, capability, engine lock, data partitions, selected checkpoint, training receipt and model tree through the nested profile admission.

Both remain synthetic narration and therefore require the same explicit platform authorisation.

## Authority boundary

An admitted retail track plan may report whether its technical track plan is ready for encoding. It cannot grant:

```text
deliveryAuthority = true
releaseDecisionAuthority = true
titleReleaseAuthority = true
publicationAuthority = true
```

Retail MP3 rendering, independent engineering, full track listening, sample creation, package review, delivery, submission, retailer acceptance and live publication remain separate governed stages.

## Public privacy boundary

The public projection exposes only bounded state:

- book identity;
- distributor and policy version;
- track and blocker counts;
- production-job count;
- synthetic-narration declaration;
- platform-authorisation presence;
- encoding eligibility;
- final wrapper fingerprint.

It does not expose:

- profile ID, revision or hash;
- profile-admission or casting fingerprints;
- training campaign, datasets, checkpoint or engine lock;
- platform-authorisation evidence ID;
- reference-master hashes;
- reviewer identities;
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
→ governed retail sample and sample review
→ private package build, inspection and final package review
→ separate release decision and delivery attempt
```
