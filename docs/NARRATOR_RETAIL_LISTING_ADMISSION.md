# Admission-bound narrator retail listing identity

Retailer acceptance is not a public listing and it is not publication.

The retailer-status boundary proves that one exact admitted narrator submission was accepted for the retailer's next publication stage. The public listing boundary must still prove that the title, author, narrator credit, cover, eBook association and rights all describe that same admitted audiobook.

The admission-bound listing layer is implemented by:

```text
packages/storyteller/src/narrator-retail-listing-admission.ts
```

It composes the existing generic listing controls in:

```text
packages/storyteller/src/audiobook-retail-listing-policy.ts
packages/storyteller/src/audiobook-retail-listing-identity.ts
```

The wrapper does not replace policy review, cover evidence, eBook evidence, independent listing review or final publisher approval. It adds the narrator and submission lineage that the generic public-listing system deliberately does not know about.

## Retailer acceptance is mandatory

`createAdmittedNarratorRetailListingIdentity` only accepts an `AdmittedNarratorRetailerStatusEvidence` whose normalized retailer state is:

```text
accepted-awaiting-publication
```

The admitted retailer evidence must still prove:

```text
retailerAcceptanceConfirmed = true
resubmissionRequired = false
publicationConfirmed = false
liveConfirmed = false
```

`processing`, `changes-requested` and `rejected` evidence cannot create a narrator-bound retail listing identity.

## Exact admitted package binding

The listing source set must use the exact package manifest that already passed:

```text
narrator admission
→ whole-book listening approval
→ retail track engineering and listening
→ retail sample safety and listening
→ private package build and inspection
→ package review
→ controlled delivery
→ remote-draft review
→ single-submission decision
→ submission receipt
→ retailer acceptance evidence
```

The wrapper reopens that nested chain and requires the listing manifest to match the admitted manifest by project, book, manifest identity, manifest fingerprint, media-file count and total media bytes.

A manifest from another title or another narrator chain fails closed.

## Spoken narrator credit binding

Production and listing review are separate governance moments. They do not need to reuse the same historical credit-policy record.

They do need to describe the same words that listeners actually hear.

The wrapper therefore binds the listing credit validation to the exact admitted audiobook by requiring:

```text
opening listing metadata fingerprint
    = admitted opening spoken-credit metadata fingerprint
opening listing text hash
    = admitted opening spoken-credit text hash

closing listing metadata fingerprint
    = admitted closing spoken-credit metadata fingerprint
closing listing text hash
    = admitted closing spoken-credit text hash
```

The generic listing layer then reconstructs the current validation scripts from the supplied canonical credit metadata and current credit policy. This means a current listing review can use a current policy while still proving that its narrator name, author name, title and other canonical credit metadata are exactly the metadata that generated the spoken credits in the admitted audiobook.

Changing `narratorCredit` and rehashing the public-listing object is therefore insufficient. Revalidation against the exact admitted spoken-credit hashes fails.

## Current listing evidence

The generic listing layer still requires current, independently governed evidence for:

- retail listing policy;
- canonical title and descriptive metadata;
- approved opening and closing credit validation scripts;
- audiobook commercial rights;
- compliant square retail cover and cover rights;
- current Amazon eBook availability and association.

The narrator wrapper preserves those generic source objects internally so every later wrapper assertion can reopen `assertAudiobookRetailListingIdentityMatchesSources` rather than trusting a detached snapshot.

## Independent listing review

`recordAdmittedNarratorRetailListingReview` preserves the generic three-role review model:

```text
editorial
rights
merchandising
```

The generic controls continue to require distinct human reviewers and role-specific checks. A changes-requested decision keeps the listing out of approval until the relevant role is reviewed cleanly again.

The narrator wrapper does not grant publication authority during review.

## Independent publisher approval

`approveAdmittedNarratorRetailListingIdentity` revalidates the entire stored listing source set against the admitted narrator chain and then delegates to the generic publisher approval.

Successful state is:

```text
status = approved-for-publication-verification
listingIdentityApproved = true
publicationVerificationEligible = true
publicationConfirmed = false
liveConfirmed = false
automaticPublicationAuthority = false
publicationAuthority = false
```

This is permission to proceed to a separate publication-verification stage. It is not a claim that Audible has published the title, that a product page exists, that purchase is enabled, or that the retail sample plays.

## Zero-shot and adapted parity

Zero-shot and adapted Audio Studio narrator profiles use the same listing boundary.

For zero-shot profiles, the nested profile admission continues to contain:

```text
training = null
```

For adapted profiles, the full admitted training provenance remains nested in the upstream narrator chain.

Both remain synthetic narration. Both retain the same title-scoped platform-authorisation evidence. Neither mode becomes human narration because its public narrator credit is exposed on a listing.

## Substitution resistance

The narrator-bound listing assertion reopens both sides of the boundary:

1. the complete admitted narrator retailer-status chain; and
2. the complete generic listing source contract.

Rehashing an outer wrapper cannot substitute:

- another project or book;
- another admitted narrator profile or casting;
- another approved retail package manifest;
- another accepted retailer submission;
- another narrator name in canonical listing metadata;
- different spoken opening or closing credit text;
- another cover or eBook evidence set;
- publication or live state.

Any such change breaks either the exact narrator lineage, the generic source reconstruction, or the narrator wrapper fingerprint.

## Public privacy boundary

`admittedNarratorRetailListingIdentityPublicView` exposes intended public retail information and bounded state:

- book identity;
- distributor;
- display title;
- author credit;
- narrator credit;
- publisher name;
- language;
- listing review count;
- narrator admission and platform-authorisation presence;
- retailer acceptance presence;
- listing approval and publication-verification eligibility;
- publication and live flags fixed to false;
- timestamp and wrapper fingerprint.

It does not expose:

- narrator profile ID, revision or profile hash;
- profile admission, casting or training fingerprints;
- model artifacts, datasets or checkpoints;
- retailer status reference hashes or raw status text hashes;
- submission receipts or retailer submission references;
- distributor-account evidence;
- package manifest fingerprint;
- credit-script evidence fingerprints;
- cover artifact identity, storage or rights fingerprints;
- eBook evidence identity;
- reviewer, approver, observer or operator identities.

## Production flow

```text
admission-bound narrator retail submission
→ independent retailer-status evidence
→ accepted awaiting publication
→ admission-bound retail listing identity
→ editorial + rights + merchandising review
→ independent listing approval
→ approved for publication verification
→ separate public listing observation
→ separate live-publication verification
→ publication monitoring and alerting
```

Retailer acceptance, listing identity, public observation, publication verification, live availability, purchase availability and sample playback remain distinct governed facts.
