# Admission-bound narrator retail release and delivery

A narrator retail package may be technically complete, independently inspected and approved by humans without yet authorising anyone to transfer it to a distributor. The release and delivery boundary therefore begins from the exact admission-bound package approval and preserves the complete Audio Studio and Storyteller narrator lineage through one controlled upload attempt.

The boundary is implemented by:

```text
packages/storyteller/src/narrator-retail-release-delivery.ts
```

It reuses the established generic release and delivery controls:

```text
packages/storyteller/src/audiobook-retail-release-decision.ts
packages/storyteller/src/audiobook-retail-delivery-attempt.ts
```

The wrapper does not duplicate distributor policy, account verification, package review or upload-state logic. It reconstructs those generic records from the exact admitted narrator package and independently revalidates every source fingerprint.

## Admission-bound release decision

`createAdmittedNarratorRetailReleaseDecision` accepts only:

- one exact `AdmittedNarratorRetailPackageApproval`;
- one current distributor-account evidence record for the same project and title;
- one independent human final confirmation;
- one bounded validity window;
- the fixed `manual-acx-upload` delivery method.

The generic release decision is created from the admitted package's exact:

```text
package review
package inspection
package manifest
retail track plan
retail policy
synthetic narration eligibility
current title-scoped platform authorisation
rights snapshot
distributor account evidence
```

The wrapper then reopens the generic decision through `assertAudiobookRetailReleaseDecisionMatchesSources`. A different package, inspection, manifest, plan, policy, narrator eligibility record, rights record or distributor account cannot be attached by rehashing an outer record.

A valid wrapper records:

```text
narratorAdmissionComplete = true
completeBookListeningApproval = true
syntheticNarrationDeclared = true
platformAuthorisationBound = true
retailPackageReviewApproval = true
releaseDecisionRecorded = true
controlledDeliveryAuthorised = true
maximumDeliveryAttempts = 1
```

This is an authorisation for one controlled file-transfer attempt. It is not submission, retailer acceptance or publication authority.

## Independent authority

The underlying release decision requires a human authority who is independent from:

- the latest editorial package reviewer;
- the latest engineering package reviewer;
- the final package approver;
- the narration-rights attestor;
- the distributor-account verifier.

Automation, worker and bot identities cannot authorise controlled delivery. The decision expires no later than the earliest applicable policy, rights, platform-authorisation or distributor-account deadline, and never lasts longer than the generic 72-hour ceiling.

## One controlled delivery attempt

`startAdmittedNarratorRetailDeliveryAttempt` consumes the exact admission-bound release wrapper and starts the generic deterministic attempt using the same package review, inspection, manifest and account evidence.

The attempt remains bound to:

```text
Audio Studio profile admission
Storyteller casting admission
pinned narrator voice
whole-book listening approval
approved retail MP3 set
approved retail sample
inspected private package
independent package review
release-decision fingerprint
current distributor-account evidence
```

The generic attempt permits ordinal `1` only. Its deterministic identity prevents another operator or changed source set from silently creating a second attempt under the same decision.

## No submission or acceptance claim

`recordAdmittedNarratorRetailDeliveryTransfer` fixes the successful transfer attestations rather than accepting caller-selected authority flags. It requires confirmation that:

- every expected media file was transferred;
- every filename was confirmed;
- the internal package manifest was not uploaded as retail media;
- no submission action was initiated;
- no retailer acceptance was claimed.

A successful wrapper reports:

```text
deliveryTransferComplete = true
submissionReviewEligible = true
submissionInitiated = false
retailerAcceptanceClaimed = false
submissionAuthority = false
retailerAcceptanceAuthority = false
publicationAuthority = false
```

The remote draft must still pass the separate submission-review boundary. A later independent submission decision and submission attempt remain mandatory.

## Failure and cancellation

`recordAdmittedNarratorRetailDeliveryFailure` and `cancelAdmittedNarratorRetailDeliveryAttempt` preserve the same narrator and package lineage while recording bounded terminal evidence.

Failed and cancelled attempts have:

```text
deliveryTransferComplete = false
submissionReviewEligible = false
retryPermittedUnderDecision = false
```

The consumed one-attempt release decision cannot be reused. Operators must investigate the failure, revalidate current package, policy, rights, platform authorisation and account evidence, and obtain a new governed release decision before another delivery attempt.

## Zero-shot and adapted parity

Zero-shot and adapted Audio Studio profiles use the same release and delivery boundary.

A zero-shot profile retains `training = null`. An adapted profile retains its campaign, engine lock, data partitions, selected checkpoint, training receipt and model tree through the nested package approval. Neither mode is reclassified as human performance during release or upload.

Both remain synthetic narration and require the same current title-scoped Audible or ACX platform authorisation.

## Authority boundary

The narrator release and delivery wrappers explicitly retain:

```text
releaseDecisionAuthority = false
submissionAuthority = false
retailerAcceptanceAuthority = false
publicationAuthority = false
```

The recorded generic release decision supplies only the exact bounded controlled-delivery authorisation it represents. The wrapper cannot create additional release decisions, submit the title, claim retailer processing or acceptance, or declare the audiobook live.

## Public privacy boundary

The public release view exposes only bounded state such as:

- book identity;
- distributor and policy version;
- synthetic narration classification;
- platform-authorisation presence;
- media-file count and total package bytes;
- one-attempt controlled-delivery state;
- decision and expiry times;
- wrapper fingerprint.

The public delivery view adds only:

- current attempt status;
- transfer-completion and submission-review eligibility;
- whether a receipt exists;
- bounded failure or cancellation codes;
- start and update times.

Neither public view exposes:

- profile IDs, revisions or hashes;
- casting or voice identity;
- training campaign, datasets, checkpoint or engine lock;
- title-scoped platform-authorisation evidence ID;
- package, manifest, inspection or review fingerprints;
- distributor-account identity or account reference hash;
- release authority, operator, reviewer or approver identities;
- remote draft references or transfer receipt hashes;
- manuscript text, transcripts, narration audio, model weights or private filesystem paths.

## Production flow

```text
admission-bound narrator retail package approval
→ independent admission-bound release decision
→ one controlled manual delivery attempt
→ complete file transfer without submission
→ admission-bound transfer evidence
→ separate remote-draft submission review
→ separate submission decision and attempt
→ retailer-status evidence
→ separate live-publication verification
```

Release eligibility, controlled transfer, submission, retailer acceptance and publication remain distinct governed stages.
