# Admission-bound narrator retail submission

A successful controlled delivery only proves that the approved media files reached a remote distributor draft. It does not prove that the remote draft matches the exact admitted narrator package, that remote processing completed cleanly, that a human reviewed the processed draft, or that anyone is authorised to submit it.

The admission-bound submission layer carries the complete Audio Studio and Storyteller narrator lineage through remote-draft review, one independent submission decision and one governed manual submission attempt.

The boundary is implemented by:

```text
packages/storyteller/src/narrator-retail-submission.ts
```

It reuses the established generic controls:

```text
packages/storyteller/src/audiobook-retail-submission-review.ts
packages/storyteller/src/audiobook-retail-submission-decision.ts
packages/storyteller/src/audiobook-retail-submission-attempt.ts
```

The wrapper does not duplicate remote review, authority, account, policy, rights or submission-state logic. It reconstructs the generic source sets from the exact admitted narrator delivery and revalidates every nested fingerprint.

## Admission-bound remote-draft review

`createAdmittedNarratorRetailSubmissionReviewApproval` accepts only an approved generic submission-review session that matches one exact successful `AdmittedNarratorRetailDeliveryAttempt`.

The delivery must still prove:

```text
status = files-transferred-awaiting-submission-review
deliveryTransferComplete = true
submissionReviewEligible = true
submissionInitiated = false
retailerAcceptanceClaimed = false
```

The generic review is reopened against the exact:

- delivery attempt and transfer receipt;
- release decision;
- package review and independent inspection;
- immutable package manifest;
- current retail policy and rights evidence;
- current distributor-account evidence;
- approved remote-draft reference and complete media-file set.

Editorial and engineering reviewers must be distinct humans. Together they must open the remote draft, match its reference, confirm the complete file list, play the required book positions and retail sample, confirm that remote processing completed without validation errors, and confirm that submission has not begun. A third independent human approves the review for a later submission decision.

A successful wrapper records:

```text
remoteDraftReviewComplete = true
submissionDecisionEligible = true
automaticSubmissionAuthority = false
retailerAcceptanceAuthority = false
publicationAuthority = false
```

Remote-draft approval is evidence for a separate authority decision. It is not submission.

## Independent single-submission decision

`createAdmittedNarratorRetailSubmissionDecision` begins from the exact admission-bound remote-draft approval.

It carries the admitted narrator lineage through the generic submission decision using the exact:

```text
Audio Studio profile admission
Storyteller casting admission
pinned narrator voice
whole-book listening approval
approved retail tracks and sample
inspected private package
controlled delivery and remote-draft receipt
approved remote-draft review
synthetic narration eligibility
current title-scoped platform authorisation
current distributor account
current policy and rights
```

The submission authority must be independent from the editorial and engineering reviewers, the remote-draft approver, the delivery operator, the release authority, the distributor-account verifier and the narration-rights attestor. Automation, worker and bot identities cannot authorise submission.

The decision is short-lived and expires no later than the earliest applicable review, policy, rights, platform-authorisation or account deadline. It authorises exactly one `manual-acx-submit` attempt.

The wrapper records:

```text
submissionDecisionRecorded = true
singleSubmissionAuthorised = true
maximumSubmissionAttempts = 1
automaticSubmissionAuthority = false
retailerAcceptanceAuthority = false
publicationAuthority = false
```

`automaticSubmissionAuthority = false` means that no worker, health check, retry loop or background automation may consume the decision. A separately identified human operator must start the one governed attempt.

## One governed submission attempt

`startAdmittedNarratorRetailSubmissionAttempt` consumes the exact admission-bound decision and begins the generic deterministic attempt using the same approved review, delivery attempt and distributor-account evidence.

The attempt identity is derived from the submission-decision fingerprint and ordinal `1`. Another operator or changed source set cannot silently create a second attempt under the same decision.

A successful submission receipt is recorded through `recordAdmittedNarratorRetailSubmissionReceipt`. The wrapper fixes the attestations rather than accepting caller-selected authority flags:

- all approved files were included;
- the distributor accepted the submission for processing;
- submission was initiated;
- the expected media-file count was acknowledged;
- retailer acceptance was not claimed;
- a public listing was not claimed.

Successful state is therefore:

```text
status = submitted-awaiting-retailer-review
submissionComplete = true
retailerReviewEligible = true
submissionInitiated = true
retailerAcceptanceClaimed = false
listingPublished = false
```

This records a retailer processing handoff only. Retailer acceptance, listing identity, live-publication verification and publication monitoring remain separate governed stages.

## Failure and cancellation

`recordAdmittedNarratorRetailSubmissionFailure` and `cancelAdmittedNarratorRetailSubmissionAttempt` preserve the same narrator, package, delivery, review and decision lineage while recording bounded terminal evidence.

Failed and cancelled attempts have:

```text
submissionComplete = false
retailerReviewEligible = false
submissionInitiated = false
retryPermittedUnderDecision = false
```

The consumed one-attempt decision cannot be reused. A later attempt requires a new current remote-draft review, a new independent submission decision and revalidation of the full narrator and retail evidence chain.

## Zero-shot and adapted parity

Zero-shot and adapted Audio Studio narrator profiles use the same submission boundary.

A zero-shot profile retains `training = null`. An adapted profile retains its training campaign, engine lock, data partitions, selected checkpoint, training receipt and model tree through the nested admission records. Neither mode is reclassified as human performance during remote review or submission.

Both remain synthetic narration and require the same current title-scoped Audible or ACX platform authorisation.

## Substitution resistance

Each wrapper is fingerprinted and independently reopens the generic source contract. Rehashing an outer wrapper cannot substitute:

- another narrator profile or casting;
- another book or project;
- another package, inspection or manifest;
- another delivery attempt or remote draft;
- another review session;
- another distributor account;
- another submission decision or receipt.

Cross-title, stale, expired or structurally changed evidence fails closed before the next stage becomes eligible.

## Public privacy boundary

The public review, decision and attempt projections expose only bounded state such as:

- book identity;
- distributor and policy version where applicable;
- media-file count and total package bytes;
- narrator admission and synthetic-authorisation presence;
- remote-review, submission-decision and submission-attempt progress;
- terminal failure or cancellation codes;
- timestamps and wrapper fingerprints.

They do not expose:

- profile IDs, revisions or hashes;
- casting or voice identity;
- training campaign, datasets, checkpoint or engine lock;
- platform-authorisation evidence identity;
- package, inspection, manifest, delivery, review or decision fingerprints;
- distributor-account identity or account-reference hash;
- reviewer, approver, authority or operator identities;
- remote-draft references, submission receipts or retailer submission references;
- manuscript text, transcripts, narration audio, model weights or private filesystem paths.

## Production flow

```text
admission-bound narrator retail package approval
→ independent controlled-delivery decision
→ one controlled file transfer without submission
→ admission-bound remote-draft review
→ independent single-submission decision
→ one governed manual submission attempt
→ submitted awaiting retailer review
→ retailer-status evidence
→ listing identity verification
→ separate live-publication verification
→ publication monitoring and alerting
```

Package readiness, file transfer, remote-draft review, submission, retailer acceptance, listing identity and live publication remain distinct governed stages.
