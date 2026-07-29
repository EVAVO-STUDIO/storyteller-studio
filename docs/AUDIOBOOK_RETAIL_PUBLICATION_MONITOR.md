# Governed audiobook retail publication monitoring

A `published-and-live` verification is a truthful observation at a specific time. It is not a permanent guarantee. The publication monitor preserves each immutable verification, detects changes in public availability and expires stale live claims without rewriting historical evidence.

## Admission boundary

A monitor begins from one valid audiobook retail publication verification:

```text
immutable publication verification
  + exact approved listing identity
  + exact required region set
  + bounded refresh interval
  -> active publication monitor
```

Every later refresh must contain a newer immutable verification for the same project, book, distributor, listing identity and region set.

The monitor does not scrape Audible, open a browser, use retailer credentials or generate publication evidence. It consumes evidence created through the governed publication-verification boundary.

## Immutable refresh history

Each monitor entry retains:

- publication-verification identity and fingerprint;
- listing-identity identity and fingerprint;
- public-observation fingerprint;
- required region set;
- truthful publication-verification outcome;
- derived health;
- publication, live, purchase and sample-playback confirmations;
- safe finding codes;
- verification time;
- public-observation expiry.

Entries are append-only and strictly chronological. Duplicate verification fingerprints and out-of-order evidence are rejected.

A refresh therefore creates a new historical fact rather than mutating the evidence that supported an earlier state.

## Health model

### `healthy-live`

The latest verification is `published-and-live`.

The approved listing identity is publicly accessible, purchasable and sample-playable in every required region, with no identity mismatch.

### `degraded`

The latest verification is `published-but-unavailable`.

The public identity matches, but one or more required regions have missing page access, purchase availability or successful sample playback.

### `unavailable`

The latest verification is `not-yet-published`.

No required-region page was accessible at the latest verification.

### `mismatch`

The latest verification is `publication-mismatch`.

A public page exists, but its metadata, cover or eBook association differs from the approved listing identity.

### `stale`

The monitor has passed its refresh deadline without a newer verification.

A stale monitor must not be presented as current evidence that the audiobook remains live, purchasable or sample-playable.

## Transition model

The monitor records immutable transitions:

- `initialized` for the first verification;
- `refresh` when health is unchanged;
- `state-change` when one non-live health changes to another;
- `regression` when `healthy-live` changes to any non-live health;
- `recovery` when any non-live or stale health returns to `healthy-live`;
- `stale` when the refresh deadline passes.

Regression and recovery are derived from evidence. They are not manually assigned labels.

## Freshness and expiry

Refresh intervals are explicit and bounded from one hour to seven days.

The next refresh deadline is the earlier of:

- latest verification time plus the configured refresh interval;
- latest public-observation expiry.

This prevents a monitor from remaining current beyond the evidence it summarizes.

Marking a monitor stale adds:

`AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_REFRESH_OVERDUE`

A later valid verification may recover the monitor. The stale transition remains in history.

## Exact scope binding

A refresh is rejected when it changes:

- project;
- book;
- distributor;
- approved listing-identity identity or fingerprint;
- required region set.

A structurally valid verification for another listing cannot be inserted by recomputing a fingerprint.

## Persistence and audit

Publication monitors are revisioned entities. Creation is idempotent for an identical fingerprint. Every update requires the exact current revision and previous monitor fingerprint.

Aggregate audit metadata records:

- current health;
- latest verification status;
- entry and transition counts;
- latest transition kind;
- finding count;
- required region count;
- refresh interval;
- whether refresh is due.

It omits verification identities, listing identities, observation fingerprints, transition evidence fingerprints and private source evidence.

## Public projection

The safe public projection exposes:

- monitor and book identifiers;
- required regions;
- refresh interval;
- entry and transition counts;
- current health;
- latest verification outcome and findings;
- last verification and observation-expiry times;
- next refresh deadline and whether refresh is due;
- latest transition summary;
- revision and monitor fingerprint.

It omits:

- project identity;
- listing-identity identity and fingerprint;
- publication-verification identities and fingerprints;
- observation fingerprints;
- transition evidence fingerprints;
- source records and private retailer evidence.

## Alerting boundary

The monitor is suitable as the governed state consumed by a scheduler or alerting service.

An external worker may periodically obtain a new public observation, create a new publication verification and append it to the monitor. The monitor itself does not browse, schedule work, send notifications or silently create evidence.

Alerts should be triggered from persisted transitions such as `regression`, `mismatch`, `unavailable` or `stale`, not from an unverified browser result.

## Output boundary

`healthy-live` means the latest non-stale verification remains `published-and-live` within the configured freshness window.

It does not guarantee future availability. A later regression, retailer change, regional outage, metadata drift, purchase restriction or playback failure must produce new immutable evidence and a new monitor transition.
