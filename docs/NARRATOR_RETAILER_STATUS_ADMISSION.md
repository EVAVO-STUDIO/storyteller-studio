# Admission-bound narrator retailer-status evidence

A successful Storyteller retail submission proves only that one exact approved narrator package was submitted and accepted by the distributor for processing. It does not prove that retailer processing is still underway, that changes were requested, that the title was accepted, that a listing exists, or that the listing is live.

The admission-bound retailer-status layer carries the exact Audio Studio narrator admission and Storyteller submission lineage into the existing retailer-status evidence contract without creating a second status engine.

The boundary is implemented by:

```text
packages/storyteller/src/narrator-retail-status-admission.ts
```

It reuses:

```text
packages/storyteller/src/audiobook-retailer-status-evidence.ts
```

The wrapper fixes the generic source set from one exact `AdmittedNarratorRetailSubmissionAttempt`, creates the generic evidence through that source set, and then reopens every nested identity and fingerprint before the narrator-specific admission record is accepted.

## Exact submission lineage

`createAdmittedNarratorRetailerStatusEvidence` accepts only a completed narrator submission with:

```text
status = submitted-awaiting-retailer-review
submissionComplete = true
retailerReviewEligible = true
submissionInitiated = true
retailerAcceptanceClaimed = false
listingPublished = false
```

The generic status evidence is created from the exact:

- technical submission attempt and immutable package identity;
- submission receipt and retailer submission reference hash;
- independent submission decision;
- approved remote-draft review;
- current distributor-account evidence;
- media-file count, package size and file-set fingerprint.

The caller cannot provide a different submission decision, review, account, package fingerprint, acceptance flag, publication flag or live flag through the narrator wrapper.

## Independent human retailer-status observation

The underlying generic contract remains authoritative for status observation.

It requires one human observer who is independent from the manual submission operator, submission authority and distributor-account verifier. Bot, worker, automation and system identities are rejected.

The observation records only hashed external retailer evidence:

```text
externalStatusReferenceHash
externalStatusTextHash
```

The narrator wrapper does not expose the raw external retailer page, message, account reference or human identity.

## Normalised retailer states

The admitted layer preserves the generic four-state model:

```text
processing
changes-requested
accepted-awaiting-publication
rejected
```

`processing` proves that a current retailer observation still reports processing. It does not prove acceptance.

`changes-requested` requires bounded issue codes and sets:

```text
resubmissionRequired = true
automaticResubmissionAuthority = false
```

A required resubmission is evidence that new work is needed. It does not permit a background retry or reuse of the consumed one-attempt submission decision.

`rejected` requires bounded issue codes but does not manufacture a retry right.

`accepted-awaiting-publication` is the only state that sets:

```text
retailerAcceptanceConfirmed = true
```

Even then the admitted record remains:

```text
publicationConfirmed = false
liveConfirmed = false
retailerAcceptanceAuthority = false
publicationAuthority = false
```

Retailer acceptance is therefore evidence for a later publication-verification chain, not a publication claim.

## Derived acceptance, not caller authority

The narrator wrapper does not accept a caller-selected `retailerAcceptanceConfirmed` value.

It derives the generic acceptance boolean solely from the normalised retailer status:

```text
accepted-awaiting-publication -> true
all other statuses             -> false
```

Likewise, the wrapper always supplies:

```text
publicationConfirmed = false
liveConfirmed = false
```

This prevents an apparently valid narrator wrapper from being used to smuggle storefront or live-publication claims into the retailer-status stage.

## Zero-shot and adapted parity

Zero-shot and adapted Audio Studio narrator profiles use exactly the same retailer-status boundary.

An adapted narrator keeps its training provenance through the nested profile admission, casting, whole-book approval, retail package, delivery and submission chain.

A zero-shot narrator retains:

```text
training = null
```

No training campaign is invented for zero-shot production and neither profile mode is reclassified as human performance.

Both modes retain:

```text
syntheticNarrationDeclared = true
platformAuthorisationBound = true
```

The retailer-status observation does not relax the title-scoped Audible or ACX synthetic-narration authorisation established earlier in the chain.

## Substitution resistance

`assertAdmittedNarratorRetailerStatusEvidence` reopens both the admitted submission wrapper and the generic status-evidence source contract.

Rehashing the outer narrator record cannot substitute:

- another project or book;
- another narrator profile or casting;
- another approved package or file set;
- another delivery attempt;
- another remote-draft review;
- another submission decision;
- another submission attempt or receipt;
- another retailer submission reference;
- another distributor account;
- another generic retailer-status observation.

The wrapper additionally checks the generic package identity against the exact submitted package and checks the generic receipt identity against the exact completed submission receipt.

## Authority boundary

Retailer status is observational evidence. It is not release automation.

Every admitted retailer-status record keeps:

```text
automaticResubmissionAuthority = false
retailerAcceptanceAuthority = false
publicationAuthority = false
```

A `changes-requested` observation may cause a new governed remediation and submission sequence to be prepared, but it cannot replay the already consumed submission decision.

An `accepted-awaiting-publication` observation may become one input to the separate publication-verification contract, but it cannot prove a listing identity, public product page, purchase availability, sample playback or live publication by itself.

## Public privacy boundary

`admittedNarratorRetailerStatusEvidencePublicView` exposes only bounded operational state:

- book identity;
- distributor;
- normalised retailer status;
- bounded issue codes;
- production-job count;
- narrator-admission and synthetic-authorisation presence;
- submission and retailer-review completion;
- acceptance, resubmission, publication and live flags;
- observation time;
- the narrator wrapper fingerprint.

It does not expose:

- project identity;
- profile ID, revision or profile hash;
- casting fingerprints;
- training data, checkpoints or engine locks;
- package or file-set fingerprints;
- submission attempt, decision or review identity;
- submission receipt hash;
- retailer submission reference hash;
- distributor-account evidence identity;
- external retailer status hashes;
- observer identity;
- manuscript text, transcripts, narration audio, model weights or private filesystem paths.

## Production flow

```text
admission-bound narrator retail package approval
-> independent controlled-delivery decision
-> one controlled file transfer without submission
-> admission-bound remote-draft review
-> independent single-submission decision
-> one governed manual submission attempt
-> submitted awaiting retailer review
-> admission-bound retailer-status evidence
-> listing identity review and approval
-> separate live-publication verification
-> publication monitoring and alerting
```

Submission, retailer processing, retailer acceptance, listing identity, publication verification and live monitoring remain distinct governed stages.
