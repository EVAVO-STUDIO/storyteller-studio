# Admission-bound narrator retail publication verification

Retailer acceptance and an approved retail listing still do not prove that the correct audiobook is publicly visible, purchasable or playable. A storefront can be absent, partially rolled out, unavailable in required regions, or published with the wrong title, narrator credit, cover, eBook association or description.

The admission-bound publication layer carries the exact Audio Studio narrator and Storyteller retail lineage through public storefront observation and independent live-publication verification without creating a second publication engine.

The boundary is implemented by:

```text
packages/storyteller/src/narrator-retail-publication-admission.ts
```

It reuses the established generic controls in:

```text
packages/storyteller/src/audiobook-retail-publication-verification.ts
```

## Admission boundary

The public storefront boundary begins only from an approved `AdmittedNarratorRetailListingIdentity` whose exact retailer status is `accepted-awaiting-publication`.

The listing must still prove:

```text
narratorAdmissionComplete = true
retailerAcceptanceConfirmed = true
admittedPackageManifestBound = true
spokenNarratorCreditBound = true
listingIdentityApproved = true
publicationVerificationEligible = true
publicationConfirmed = false
liveConfirmed = false
```

Processing, changes-requested, rejected, draft or merely reviewed listing state cannot enter this stage.

## Public storefront observation

`createAdmittedNarratorRetailPublicListingObservation` records what a human actually observes on the public Audible storefront after the admitted listing has been approved.

The observation is structurally bound to the exact narrator listing through:

- project and book identity;
- Audio Studio profile admission hash;
- Storyteller admitted casting fingerprint;
- exact narrator voice revision pin;
- retailer-accepted submission and retailer-status evidence;
- admitted retail package manifest;
- approved spoken narrator credit identity;
- approved retail listing identity and approval.

The observation then records the public audiobook ASIN, public product reference hash, sample reference hash, cover reference hash, public metadata, cover identity result, eBook association and required regional page, purchase and sample observations.

Observation is evidence, not adjudication. The wrapper therefore always records:

```text
publicObservationRecorded = true
publicationVerificationComplete = false
publicationConfirmed = false
liveConfirmed = false
automaticPublicationAuthority = false
publicationAuthority = false
```

A public page that appears purchasable during observation is not allowed to become a `liveConfirmed` claim until a separate verifier reopens the full source set.

## Truthful mismatch evidence

The observation layer intentionally permits bad storefront reality to be recorded.

A human observer may truthfully record:

- a wrong narrator credit;
- a wrong title or author credit;
- a wrong publisher or description;
- cover mismatch;
- eBook association mismatch;
- missing regional product pages;
- unavailable purchase;
- missing sample;
- failed sample playback.

Those observations must not be rejected merely because they are undesirable. The later verification stage converts them into bounded findings and one of the generic publication outcomes.

## Independent publication verification

`verifyAdmittedNarratorRetailPublication` reopens the exact admission-bound observation and then delegates to `verifyAudiobookRetailPublication` with the exact underlying:

```text
approved generic listing identity
accepted generic retailer-status evidence
public storefront observation
```

The final verifier must be a human independent from the storefront observer, retailer-status observer and listing approver.

The generic publication engine remains the sole authority for deriving:

```text
not-yet-published
publication-mismatch
published-but-unavailable
published-and-live
```

The admission wrapper copies those derived outcomes but cannot override them.

## Published and live

`published-and-live` requires all of the generic controls to succeed for every required region:

- the public product page is accessible;
- title, author, narrator, publisher, language and description match the approved listing;
- cover identity matches;
- the eBook ASIN and association match;
- purchase is available;
- the sample is available;
- sample playback succeeds;
- there are zero publication findings.

Only then may the narrator-bound verification record contain:

```text
publicationVerificationComplete = true
publicationConfirmed = true
liveConfirmed = true
purchaseConfirmed = true
samplePlaybackConfirmed = true
status = published-and-live
```

This proves a bounded verified observation at a point in time. It does not grant authority to publish or mutate the retailer account.

## Authority boundary

Neither the observation nor the verification wrapper grants publication authority.

Both retain:

```text
automaticPublicationAuthority = false
publicationAuthority = false
```

`publicationAuthority` describes authority to cause publication. It is deliberately different from `publicationConfirmed` and `liveConfirmed`, which describe independently verified external state.

No worker, monitor, retry loop, API route or web page may convert observation into a live claim or use this wrapper to publish automatically.

## Zero-shot and adapted parity

Zero-shot and adapted narrator profiles use the same public verification boundary.

Adapted profiles retain their training provenance through the nested narrator admission chain. Zero-shot profiles retain `training = null`. Neither mode is reclassified as human narration at the storefront stage.

Both remain bound to the exact synthetic narration declaration and title-scoped platform authorisation that admitted the retail audiobook.

## Substitution resistance

Every narrator wrapper is fingerprinted and reopens the generic source contract.

Rehashing an outer object cannot substitute:

- another narrator profile or voice revision;
- another book or project;
- another retailer-accepted submission;
- another package manifest;
- another spoken narrator credit;
- another approved listing identity;
- another public observation;
- another generic publication verification.

A public narrator-credit mismatch is permitted as truthful observation, but it resolves to `publication-mismatch` and can never become `published-and-live` under the same evidence.

## Public privacy boundary

The narrator public projections may expose real storefront information needed by operators and customers, including:

- book identity;
- public audiobook ASIN;
- public title, author, narrator and publisher credits;
- language and description after verification;
- required regions and bounded availability state;
- publication findings;
- observation and verification times;
- narrator admission completion flags;
- outer wrapper fingerprint.

They do not expose:

- narrator profile ID or profile hash;
- profile admission hash;
- admitted casting or casting fingerprints;
- training campaign, dataset or checkpoint identity;
- private package, submission, retailer-status or listing fingerprints;
- observer, approver or verifier actor IDs;
- private product, sample or cover reference hashes;
- distributor-account identity;
- manuscript, transcript, narration audio, model weights or private paths.

## Production flow

```text
admission-bound narrator retail listing approval
→ admission-bound human public storefront observation
→ independent admission-bound publication verification
→ not-yet-published | publication-mismatch | published-but-unavailable | published-and-live
→ publication monitoring / refresh / alerting
```

Observation, verification, live availability and later monitoring remain separate governed stages.

## Output boundary

This stage proves the exact admitted narrator listing was independently compared with current public storefront evidence.

A successful `published-and-live` result proves the required public identity, purchase and sample checks succeeded at the verification time. It does not prove perpetual availability, future retailer state, publication authority, or permission for automated retailer mutation.
