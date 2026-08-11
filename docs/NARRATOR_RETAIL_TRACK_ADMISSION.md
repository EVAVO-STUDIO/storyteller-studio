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

## Zero-shot and adapted parity

Both narrator modes use the same retail boundary.

A zero-shot profile retains:

```text
training = null
```

An adapted profile retains its exact campaign, capability, engine lock, data partitions, selected checkpoint, training receipt and model tree through the nested profile admission.

Both remain synthetic narration and therefore require the same explicit platform authorisation. Retail MP3 rendering and review must not erase or invent training provenance.

## Authority boundary

An admitted retail track plan may report whether its technical track plan is ready for encoding. An admitted retail-track approval may report that exact MP3 engineering and human listening are complete. Neither can grant:

```text
deliveryAuthority = true
releaseDecisionAuthority = true
titleReleaseAuthority = true
publicationAuthority = true
```

Retail sample creation, sample approval, package build, independent package inspection, package review, delivery, submission, retailer acceptance and live publication remain separate governed stages.

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

The public production projection additionally exposes bounded track count, output byte count and completion state. It does not expose:

- profile ID, revision or hash;
- profile-admission or casting fingerprints;
- training campaign, datasets, checkpoint or engine lock;
- platform-authorisation evidence ID;
- reference-master, plan, render or artifact hashes;
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
→ private package build, inspection and final package review
→ separate release decision and delivery attempt
```
