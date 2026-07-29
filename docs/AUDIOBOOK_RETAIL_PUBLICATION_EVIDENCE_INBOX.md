# Governed audiobook retail publication verification evidence inbox

The publication evidence inbox is the private gateway-side boundary between an independent human-governed publication-verification workflow and the publication refresh worker.

It stores only complete valid `AudiobookRetailPublicationVerification` objects. Raw retailer pages, browser sessions, screenshots, account credentials and automated claims are not evidence inbox items.

## Exact refresh request

A refresh request is created from one persisted publication monitor revision.

Its deterministic request fingerprint binds:

- monitor identifier;
- monitor revision;
- monitor fingerprint;
- latest verification fingerprint;
- next refresh deadline.

The request also records project, book, approved listing identity, required regions, last verification time and request time.

Advancing the monitor creates a different request fingerprint. Evidence submitted for an earlier revision cannot silently satisfy the later request.

## Shared request fingerprint

`audiobookRetailPublicationRefreshRequestFingerprint` is the canonical fingerprint function for both:

- the private refresh-runtime client request; and
- gateway-side evidence inbox matching.

This removes duplicate request-fingerprint logic and prevents the two private boundaries from drifting.

## Complete evidence admission

`submitAudiobookRetailPublicationEvidence` accepts only a complete verification that:

- passes the publication-verification integrity contract;
- matches the exact project and book;
- matches the approved listing identity and fingerprint;
- matches the exact required-region set;
- is later than the monitor’s current verification;
- is different from the current verification fingerprint;
- has not expired when received;
- is not future-dated;
- is accompanied by a one-way source-reference hash.

The source-reference hash may identify a private intake receipt or governed evidence envelope. Raw URLs, HTML, images and response bodies are not stored.

## Deterministic inbox identity

An inbox item identity is derived from:

- refresh request fingerprint; and
- complete verification fingerprint.

Repeated submission of the same evidence for the same request is idempotent. Another verification or request cannot silently reuse the item identifier.

## Available evidence

A revision-one item is `available`.

`findCurrentForRequest` returns the newest current available verification for the exact request fingerprint, ordered by:

1. latest verification time;
2. latest receipt time;
3. stable item identifier.

Acknowledged and expired items are excluded.

The presence of an available item does not prove the monitor has consumed it.

## Proven-consumption acknowledgement

Evidence may be acknowledged only when a later persisted monitor revision proves that it consumed the exact verification.

Acknowledgement requires:

- the same monitor, project, book and listing identity;
- a monitor revision later than the request revision;
- the exact verification fingerprint as the monitor’s latest entry;
- the exact verification time as the monitor’s `lastVerifiedAt`;
- an acknowledgement time after both evidence receipt and monitor update.

A served HTTP response, successful network request or provider receipt is not sufficient. This avoids false acknowledgement after ambiguous delivery or client failure.

Acknowledgement creates revision two and preserves the original request, verification and receipt provenance.

## Revision and concurrency safety

The inbox store uses the existing revisioned project store.

Creation is idempotent for an identical item fingerprint. Saving acknowledgement requires:

- the exact current revision;
- the previous inbox-item fingerprint;
- a permitted audit action.

A stale writer receives a conflict rather than overwriting newer state.

## Persistence and audit

The durable entity type is:

```text
audiobook-retail-publication-evidence-inbox
```

Aggregate audit metadata records:

- inbox status;
- verification status;
- expected monitor revision;
- required-region count;
- acknowledgement state.

Audit metadata omits:

- request and verification fingerprints;
- source-reference hashes;
- public-product reference hashes;
- human observer and verifier identities;
- receiver and acknowledger identities;
- raw retailer evidence.

## Public projection

The safe projection exposes:

- item, book and monitor identifiers;
- expected monitor revision;
- required regions;
- verification status and time;
- observation expiry;
- inbox status;
- receipt and acknowledgement times;
- revision and item fingerprint.

It omits the complete private verification object, request fingerprint, monitor fingerprint, source-reference hash, human identities and product-reference hashes.

## Private application boundary

Evidence request creation, submission, lookup and acknowledgement are private engine controls.

Normal web and protected API runtimes must not import or invoke:

- `createAudiobookRetailPublicationEvidenceRequest`;
- `submitAudiobookRetailPublicationEvidence`;
- `acknowledgeAudiobookRetailPublicationEvidence`;
- `FileAudiobookRetailPublicationEvidenceInboxStore`;
- evidence-selection controls.

A later isolated gateway process may use this store to answer the private publication-refresh runtime.

## Output boundary

An `available` item means complete current human-governed verification is waiting for one exact monitor request.

An `acknowledged` item means a later persisted monitor revision proves that it consumed that exact verification.

Neither state proves perpetual publication availability. The inbox does not scrape retailer pages, create human evidence, expose an execution API, send notification email or replace independent publication verification.
