# Governed audiobook retail publication verification

Retailer acceptance, public publication, purchase availability and successful sample playback are separate facts. The publication-verification boundary records them independently and permits a `published-and-live` state only when all required evidence is current, source-bound and independently confirmed.

## Admission boundary

Publication verification requires:

```text
approved canonical retail listing identity
  + retailer status accepted-awaiting-publication
  + current independently observed Audible product page
  + exact public metadata comparison
  + cover identity comparison
  + linked eBook identity comparison
  + product-page checks in every required region
  + purchase availability in every required region
  + retail sample availability in every required region
  + successful sample playback in every required region
  + independent human publication verifier
  -> publication verification result
```

A structurally valid object cannot replace any of these sources. The verification fingerprint binds the approved listing, retailer status and public observation.

## Accepted is not published

The retailer-status stage ends at `accepted-awaiting-publication`. That state proves only that an independent human observed external acceptance evidence for the submitted package.

It explicitly records:

- publication not confirmed;
- live availability not confirmed;
- no assumption of purchase availability;
- no assumption of sample playback.

Publication verification cannot begin from `processing`, `changes-requested` or `rejected` retailer status.

## Public listing observation

The public observation records the externally visible:

- Audible audiobook ASIN;
- one-way public-product reference hash;
- one-way sample reference hash;
- one-way cover reference hash;
- display title;
- author credit;
- narrator credit;
- publisher name;
- language;
- description;
- cover identity match;
- linked Amazon eBook ASIN and association match;
- per-region page, purchase and sample state.

The observer must be human. Observation evidence expires within seven days so that a stale page snapshot cannot support a current live claim.

Credentials, cookies, raw URLs, page HTML and account sessions are not stored.

## Regional evidence

Every required region has its own immutable observation containing:

- two-letter region code;
- product-page accessibility;
- purchase availability;
- sample availability;
- successful sample playback.

The caller explicitly supplies the required region set. A missing region is a blocking finding. A page cannot claim purchase or sample availability when the page itself is inaccessible. Successful playback cannot be claimed unless the sample and page are both available.

## Exact public identity comparison

The public observation is compared with the approved listing identity for:

- display title;
- author credit;
- narrator credit;
- publisher name;
- language tag;
- description;
- cover identity;
- linked eBook ASIN.

Any mismatch produces `publication-mismatch`, even when the product page is accessible and purchasable.

This prevents a different edition, contributor, cover, description or eBook association from being treated as the approved audiobook merely because a public Audible page exists.

## Four truthful outcomes

### `not-yet-published`

None of the required regional product pages are accessible.

Retailer acceptance remains true, but publication, live availability, purchase and sample playback remain false.

### `publication-mismatch`

At least one required product page is accessible, but public metadata, cover identity or eBook association differs from the approved listing identity.

Publication is observed, but the approved audiobook identity is not confirmed live.

### `published-but-unavailable`

The public identity matches, but one or more required regions are missing, inaccessible, not purchasable, missing a sample or unable to play the sample successfully.

Publication is confirmed, but live availability remains false.

### `published-and-live`

Every required region has:

- an accessible product page;
- purchase availability;
- a present sample;
- successful sample playback.

All public metadata, cover and eBook identity fields match the approved listing. No findings remain.

Only this outcome sets publication, live, purchase and sample-playback confirmation to true.

## Independent verification

The publication verifier must be human and independent from:

- the public-page observer;
- the retailer-status observer;
- the final listing-identity approver.

Worker, bot, automated and system identities are rejected.

Verification must occur after the public observation and while that observation is still current.

## Findings

Findings identify exact mismatches or unavailable regions, including:

- title, author, narrator, publisher, language or description mismatch;
- cover mismatch;
- eBook mismatch;
- missing required region;
- unavailable regional page;
- unavailable regional purchase;
- unavailable regional sample;
- failed regional sample playback.

A `published-and-live` record is invalid if it contains any finding.

## Persistence and audit

Publication verification is immutable revision-one evidence. Identical repeated writes are idempotent; reusing an identifier for another observation or source set is rejected.

Aggregate audit metadata records:

- status;
- required and observed region counts;
- finding count;
- retailer acceptance;
- publication confirmation;
- live confirmation;
- purchase confirmation;
- sample-playback confirmation.

It omits product-reference hashes, source identities, internal fingerprints and human identities.

## Public projection

The safe public projection exposes the public listing metadata, Audible ASIN, required regional availability results, finding codes, observation time, verification time and truthful outcome.

It omits:

- project and internal package identifiers;
- listing-identity and retailer-status identifiers and fingerprints;
- observation identity and fingerprint;
- product, sample and cover reference hashes;
- observer and verifier identities;
- approval fingerprints;
- credentials, raw URLs, HTML and private paths.

## Output boundary

`published-and-live` is the first state that truthfully confirms the approved audiobook identity is publicly published, purchasable and sample-playable in every required region.

It does not prove perpetual availability. Publication evidence expires with its public observation and should be refreshed whenever regional availability, metadata, cover, price, sample playback or retailer status materially changes.

A later refresh creates new immutable evidence rather than rewriting the historical verification that supported an earlier live state.
