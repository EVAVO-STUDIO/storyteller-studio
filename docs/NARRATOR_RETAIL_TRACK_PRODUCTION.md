# Admission-bound narrator retail track production

Storyteller Studio treats retail MP3 production as a private governed continuation of the approved narrator audiobook. A technically valid ACX track plan is not sufficient on its own: rendering, engineering and human track review must retain the exact Audio Studio profile admission, Storyteller casting, platform authorisation and complete whole-book approval that created the plan.

## Scope

The production facade begins from one validated:

```text
storyteller-admitted-narrator-retail-track-plan-v1
```

It adds four immutable records:

```text
storyteller-admitted-narrator-retail-track-render-v1
storyteller-admitted-narrator-retail-track-encode-v1
storyteller-admitted-narrator-retail-track-review-binding-v1
storyteller-admitted-narrator-retail-track-review-approval-v1
```

The underlying technical render, artifact, engineering and human review engines remain reusable. The admission-aware facade reopens those contracts and binds them back to the complete narrator source.

## Exact render admission

`renderAdmittedNarratorRetailTrackPlan(...)` renders only a retail plan that is already eligible for encoding.

The resolved private reference master must match the approved whole-book artifact exactly:

- artifact ID;
- artifact revision;
- artifact fingerprint;
- content SHA-256;
- byte count.

Every rendered track remains bound to:

- the technical plan fingerprint;
- the exact reference-master snapshot;
- its approved contiguous source range;
- deterministic ASCII file name;
- output format, sample rate, channels and CBR bit rate;
- FFmpeg filter fingerprint;
- command fingerprint;
- output content hash and byte count.

Raw MP3 bytes are returned only in the private render result. The immutable admission record contains evidence and hashes rather than embedding audio.

## Artifact admission and independent engineering

`ingestAdmittedNarratorRetailTrackRender(...)` does not accept an arbitrary reference artifact. It derives the source artifact directly from the admission-bound whole-book approval.

The established technical encoder then:

1. Stores the plan and render evidence as governed private artifacts.
2. Stores every MP3 as an `audiobook-retail-track` artifact.
3. Runs independent engineering against the actual stored bytes.
4. Rechecks codec, sample rate, channels, bit rate and duration.
5. Quarantines a failed track without deleting its diagnostics.
6. Preserves exact plan, render, artifact and engineering fingerprints.

The admission wrapper additionally verifies that every encoded artifact hash and byte count matches its rendered output and that every technical track still belongs to the admitted plan.

Engineering completion and engineering eligibility are separate:

```text
engineeringEvidenceComplete = true
allTracksEngineeringEligible = true | false
humanTrackReviewEligible = true | false
```

A failed engineering result remains auditable but cannot enter human track approval.

## Complete track listening

`createAdmittedNarratorRetailTrackReviewBinding(...)` starts the established retail-track review only after all tracks are independently engineering-eligible.

Every retail MP3 still requires:

- complete editorial playback;
- complete engineering playback;
- spoken header confirmation;
- opening and closing boundary confirmation;
- minimum score thresholds across every review dimension;
- consumer-headphone and speaker coverage;
- studio-headphone engineering coverage;
- independent editorial and engineering reviewers;
- a third independent final approver;
- zero unresolved finding codes;
- current rights at final approval.

The admission wrapper retains the exact encode chain throughout every review revision. A review from another project, title, plan, render, reference master, engineering profile or narrator admission cannot be substituted.

## Approved artifacts

Final approval produces exact approved revisions of every retail-track artifact.

For every approved artifact, Storyteller rechecks:

- artifact identity;
- original and approved revisions;
- linked previous fingerprint;
- unchanged audio content hash and byte count;
- exact review fingerprint;
- current rights fingerprint;
- verified integrity state;
- approved review state;
- absence of quarantine;
- absence of release state.

The resulting record may state:

```text
humanTrackListeningApproval = true
retailSamplePlanningEligible = true
```

It deliberately retains:

```text
packageManifestEligible = false
deliveryAuthority = false
releaseDecisionAuthority = false
titleReleaseAuthority = false
publicationAuthority = false
```

Track approval allows the governed sample workflow to begin. It does not create a package, upload files, submit a title or claim retailer acceptance.

## Zero-shot and adapted voices

The same production boundary supports both narrator modes.

A zero-shot profile continues to carry:

```text
training = null
trainingProvenanceBound = false
```

An adapted profile continues to carry its exact campaign, training method, capability, engine lock, data partitions, selected checkpoint, receipt and model tree through the nested profile admission.

Both are declared `synthetic-voice` for distributor policy. Owning the source recording, voice rights, model or generated audio does not convert synthesis into human performance or replace title-scoped platform authorisation.

## Public privacy boundary

The public projections expose only bounded operating state such as:

- book ID;
- distributor;
- track count;
- total output bytes;
- engineering eligibility;
- finding codes;
- review counts;
- whether human track listening is complete;
- whether retail sample planning is eligible;
- final wrapper fingerprint.

They exclude:

- voice identity and profile hash;
- profile-admission hash;
- casting fingerprints;
- training campaign, dataset, checkpoint or engine lock;
- platform-authorisation identity;
- reference-master identity;
- plan and render internals;
- artifact IDs and content hashes;
- reviewer identities;
- manuscript text, transcript text, audio and private paths.

## Production flow

```text
exact admitted whole-book approval
→ authorised admitted retail plan
→ private exact-range MP3 rendering
→ governed artifact ingestion
→ independent per-track engineering
→ quarantine or human-review eligibility
→ complete editorial and engineering playback
→ independent final track approval
→ governed retail sample planning
```

Retail sample rendering, sample review, package assembly, package inspection, release decisions, delivery, submission, retailer acceptance and live-publication verification remain later independent boundaries.
