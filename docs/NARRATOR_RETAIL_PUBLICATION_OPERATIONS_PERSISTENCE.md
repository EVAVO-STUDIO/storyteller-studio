# Narrator retail publication operations persistence

## Purpose

This boundary makes the admission-bound narrator publication operations durable
without weakening the exact narrator, listing, retailer and Audible product
lineage established by the publication-operation domain layer.

The persisted state remains private. It is intended for a private worker or CLI
that has already obtained a valid
`AdmittedNarratorRetailPublicationOperation`. The normal web application and
protected API do not receive these mutation controls.

## Persistence boundary

The store persists two private entity classes:

- the current `AdmittedNarratorRetailPublicationMonitor`; and
- one revisioned write-ahead intent for every proposed admitted publication
  operation.

The current monitor is the single authoritative head for one admitted narrator
publication chain. A write-ahead intent contains the exact operation that wants
to advance that head.

The operation still comes from the existing admission-bound domain functions.
Persistence does not create publication evidence, infer a narrator, fabricate a
refresh, mark evidence stale early or decide that an incident is actionable.

## Genesis monitor

`createMonitor` accepts only an initial admitted narrator monitor whose generic
monitor revision is `1` and has no previous fingerprint.

The complete admitted monitor is validated before it enters storage. The store
therefore retains the exact:

- project and book;
- Audio Studio narrator profile pin;
- profile admission and adapted or zero-shot provenance;
- admitted casting;
- approved retail listing;
- accepted retailer-status evidence;
- Audible audiobook ASIN;
- required regions;
- initial publication verification; and
- generic monitor fingerprint and revision.

Creating the exact same genesis monitor again is idempotent. Reusing the same
monitor identifier for a different valid narrator lineage fails closed.

## Write-ahead reservation

`prepareOperation` creates an
`AdmittedNarratorRetailPublicationOperationIntent` before the current monitor is
mutated.

The prepared intent binds:

- the exact admitted operation fingerprint;
- the current admitted and generic monitor fingerprints;
- the expected generic monitor revision;
- the target admitted and generic monitor fingerprints;
- the target generic monitor revision;
- the preparing private actor; and
- the preparation time.

A prepared intent has revision `1`, status `prepared`,
`writeAheadReserved: true` and `monitorMutationCommitted: false`.

Preparation reopens the stored monitor and requires it to equal the operation's
`previousMonitor`. A stale caller cannot reserve an operation against a monitor
that has already advanced.

Preparing the exact same operation again returns the existing intent. Another
worker may therefore discover and resume the same reservation without creating
a duplicate operation.

## Optimistic monitor commit

`commitOperation` advances the current admitted monitor only when the stored
head still equals the intent's expected revision and fingerprints.

The replacement monitor must be exactly the operation's validated target:

- target revision equals expected revision plus one;
- the target generic monitor points to the previous generic fingerprint;
- the admitted narrator lineage remains unchanged;
- the operation's evidence acknowledgement remains exact;
- any incident remains bound to the resulting transition; and
- all automatic authority flags remain false.

The underlying `FileProjectStore` lock and expected-revision replacement prevent
two competing intents from both becoming the monitor head. One may commit. A
second operation prepared from the same old head becomes a visible conflict and
cannot fork the narrator publication chain.

## Interruption recovery

The commit sequence is deliberately recoverable rather than pretending two file
replacements are one database transaction.

The order is:

1. persist the prepared intent;
2. replace the current monitor using its exact expected revision; and
3. revise the intent to status `committed`.

An interruption can therefore leave the monitor at the target revision while
the intent still says `prepared`.

`inspectIntent` distinguishes:

- `ready`: the intent is prepared and the monitor is still the expected head;
- `monitor-applied-intent-pending`: the monitor is already the exact target but
  intent finalisation is incomplete;
- `committed`: both monitor and intent agree on the committed target; and
- `conflict`: neither exact expected nor exact target state is present.

Retrying `commitOperation` in the
`monitor-applied-intent-pending` state does not advance the monitor again. It
revalidates the exact target and finalises the existing intent. This provides a
deterministic restart path after interruption.

A conflicting monitor is never repaired, rolled back or overwritten
automatically.

## Intent revision chain

A committed intent has revision `2` and retains the prepared intent fingerprint
as `previousFingerprint`.

It also records:

- the committing private actor;
- the commit time;
- `monitorMutationCommitted: true`; and
- the unchanged exact admitted operation.

Rehashing an outer intent cannot change the expected revision, target revision,
monitor fingerprints, narrator operation or authority flags. Each layer is
revalidated independently.

## Durable evidence and incidents

The admitted operation embedded in a committed intent retains the exact domain
record produced before persistence.

For evidence refreshes this includes:

- the admission-bound evidence request;
- the complete admitted publication verification;
- the generic evidence inbox item;
- the acknowledged inbox revision;
- the previous and resulting admitted monitors; and
- any admission-bound incident created from the resulting transition.

For stale operations it retains the governed stale transition and its
admission-bound stale-evidence incident without inventing another verification.

The committed intent is therefore durable evidence that one exact operation
advanced one exact monitor head. It does not claim that an email alert was sent
or that a later incident resolution was persisted.

## Prepared intent discovery

`listPreparedIntentIds` returns prepared reservations in deterministic
preparation-time and identifier order with a bounded result limit.

A private coordinator can use this list after restart to inspect each intent and
resume only the exact recoverable state. The list does not execute operations,
contact a retailer, send notifications or repair conflicts.

## Audit evidence

Every successful store transition appends bounded private audit metadata.

Monitor audit events record only operational state such as:

- monitor revision;
- current health;
- verification and transition counts;
- latest transition kind;
- whether an incident is required; and
- false remediation, republish and publication authority.

Intent audit events record only:

- operation kind;
- intent status;
- expected and target revisions;
- target health;
- evidence acknowledgement state;
- incident creation state; and
- false automatic authority.

Audit metadata does not contain narrator profile hashes, casting fingerprints,
recipient routes, email addresses, retailer credentials, raw storefront URLs or
raw publication evidence.

## Adapted and zero-shot provenance

The persistence layer stores and revalidates the complete admitted monitor and
operation. Adapted and zero-shot narrators therefore use the same durable
protocol without becoming interchangeable.

An adapted narrator retains its training campaign, dataset, checkpoint,
capability and model-tree lineage through the profile admission already nested
in the admitted verification chain. A zero-shot narrator retains the explicit
absence of training provenance.

A valid operation for one mode cannot advance the stored monitor for the other.

## Authority boundary

Persistence grants no operational or publication authority.

Every intent permanently keeps these flags false:

- `automaticRefreshAuthority`;
- `automaticRemediationAuthority`;
- `automaticRepublishAuthority`; and
- `publicationAuthority`.

A durable evidence request does not authorize acquisition. A prepared intent
does not authorize an arbitrary process to commit it. A committed mismatch does
not authorize listing edits. A stale incident does not authorize republishing.

Private actor authentication, job leasing and execution policy remain separate
runtime responsibilities.

## Private runtime boundary

The store is not available to normal browser or protected API code.

A future private coordinator may combine it with:

- the governed evidence gateway;
- bounded provider timeouts;
- worker leases and shutdown handling;
- persisted admitted incident delivery;
- human acknowledgement and recovery workflows; and
- private readiness and backup checks.

That coordinator must use the write-ahead and optimistic-revision contract. It
must not bypass it by replacing monitor files directly.

## Public projection

`admittedNarratorRetailPublicationOperationIntentPublicView` exposes only a
bounded operational projection:

- book identity;
- Audible marketplace and ASIN;
- intended display title and narrator credit;
- operation kind;
- expected and target monitor revisions;
- target health and transition kind;
- prepared or committed status;
- evidence acknowledgement and incident creation state; and
- the permanent false authority flags.

It omits:

- project identifiers;
- monitor identifiers and fingerprints;
- narrator profile identifiers and hashes;
- profile admission and casting fingerprints;
- training evidence;
- private actor identities;
- evidence request and inbox identifiers;
- source reference hashes;
- recipient route hashes;
- provider credentials;
- public product, sample and cover reference hashes; and
- complete nested publication evidence.

## One-host boundary

This implementation uses the existing file-backed `FileProjectStore` locking
and atomic replacement model. It is suitable for one coordinated host sharing
one local state root.

It is not a multi-host transactional database, distributed consensus system or
replacement for PostgreSQL when independent hosts must mutate the same monitor.
A multi-host deployment must move the same expected-revision and write-ahead
contract into a transactional shared store.

## Output boundary

A committed intent proves that one exact admitted publication operation advanced
one exact persisted monitor revision and that the write-ahead record was
finalised.

It does not prove that evidence was acquired from a network, that a retailer
accepted a correction, that an alert reached a recipient, that a human reviewed
the incident, that a listing was republished or that future storefront
availability will remain healthy.

It does not guarantee future availability.
