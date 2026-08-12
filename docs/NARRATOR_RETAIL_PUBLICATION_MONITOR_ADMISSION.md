# Narrator Retail Publication Monitor Admission

## Admission boundary

This contract carries the exact narrator-bound live retail publication verification
into ongoing storefront monitoring without weakening the existing generic publication
monitor.

The generic monitor remains authoritative for chronological evidence history,
health classification, refresh deadlines, regressions, recoveries and staleness.
The narrator admission layer adds provenance that the generic monitor deliberately
does not know about: the selected narrator profile admission, admitted casting,
exact voice revision, admitted listing wrapper, retailer acceptance chain and
original Audible public product identity.

Monitoring is not publishing. It cannot repair, republish or mutate a retailer
listing.

## Initial live proof

Narrator monitoring starts only from an admitted publication verification whose
truthful outcome is `published-and-live`.

The initial verification must prove:

- publication is confirmed;
- live availability is confirmed;
- purchase availability is confirmed in every required region;
- sample playback is confirmed in every required region; and
- there are no publication findings.

A `not-yet-published`, `publication-mismatch` or
`published-but-unavailable` verification cannot initialize this post-publication
monitor.

This makes every later non-healthy state a genuine regression from a previously
verified live narrator publication.

## Exact narrator lineage

Every refresh must reopen the same:

- project and book;
- narrator profile admission hash;
- admitted casting fingerprint;
- casting fingerprint;
- exact pinned voice profile and revision;
- total narrator production job count;
- admitted retail listing wrapper;
- generic approved listing identity;
- retailer-status evidence chain; and
- Audible audiobook ASIN.

A different title, replacement narrator, replacement admitted listing or different
public audiobook ASIN is not a refresh. It is a different publication identity and
fails closed.

## Immutable verification history

`verifications` stores every narrator-bound publication verification admitted into
the monitor.

The array is parallel to the generic monitor's immutable `entries` history. Every
entry must reopen the exact narrator verification that produced it, including:

- verification id and fingerprint;
- listing identity id and fingerprint;
- public observation fingerprint;
- required regions;
- truthful publication status;
- publication/live/purchase/sample flags;
- finding codes;
- verification time; and
- observation expiry.

Stale transitions do not invent a verification. They add a generic monitor
transition while leaving the narrator verification count unchanged.

This prevents an intermediate degradation or mismatch from being omitted later.

## Health and transitions

The generic health model remains authoritative:

- `published-and-live` becomes `healthy-live`;
- `published-but-unavailable` becomes `degraded`;
- `publication-mismatch` becomes `mismatch`;
- `not-yet-published` becomes `unavailable`; and
- overdue evidence becomes `stale`.

The generic transition model also remains authoritative:

- `initialized`;
- `refresh`;
- `state-change`;
- `regression`;
- `recovery`; and
- `stale`.

The narrator layer records those outcomes without inventing a second health model.

## Narrator and metadata drift

A later storefront observation may truthfully show a different narrator credit.

That observation and its publication verification remain valid evidence of public
reality. When admitted to the existing monitor, the health becomes `mismatch` and
the transition from a healthy live publication becomes `regression`.

The monitor still retains the original admitted narrator listing and voice lineage.
It does not accept the drifted public narrator text as a replacement narrator
identity.

## Purchase and sample degradation

A product page may remain published while purchase availability or sample playback
fails in one or more required regions.

The generic verification truthfully produces `published-but-unavailable`, which
the monitor records as `degraded`.

A later exact, healthy verification for the same narrator listing may produce a
`recovery` transition back to `healthy-live`.

Recovery does not rewrite or remove the degraded evidence.

## Freshness and stale evidence

The generic monitor calculates the next refresh deadline from both its configured
refresh interval and the underlying public observation expiry.

When evidence becomes overdue, the narrator monitor may be marked stale.

Staleness:

- does not create another narrator verification;
- does not claim that the listing disappeared;
- does not claim the audiobook remains live;
- means the last verified evidence is no longer fresh enough to rely on as current.

The public projection exposes `staleEvidence` separately from the most recent
verified publication flags.

## Public product identity

The original Audible audiobook ASIN is pinned when the monitor begins.

A later otherwise healthy verification for another ASIN cannot enter the same
narrator monitor. This closes the gap where a different public product page could
otherwise be treated as a refresh of the admitted audiobook.

## Authority boundary

The monitor always keeps:

- `automaticRemediationAuthority: false`;
- `automaticRepublishAuthority: false`; and
- `publicationAuthority: false`.

A regression can inform later alerting or human remediation, but the monitoring
contract cannot automatically edit retailer metadata, replace narration, resubmit
a title or republish anything.

## Public projection

The public monitor view may expose bounded operational state:

- book id;
- Audible audiobook ASIN;
- canonical display title and narrator credit;
- required regions;
- refresh interval;
- verification and transition counts;
- current health;
- latest verification outcome and findings;
- latest verified publication/live/purchase/sample flags;
- stale state;
- next refresh deadline;
- narrator-lineage completeness flags; and
- the narrator monitor fingerprint.

It does not expose:

- project id;
- narrator profile ids or hashes;
- casting fingerprints;
- voice hashes;
- admitted listing fingerprints;
- generic monitor ids or listing fingerprints;
- verification ids or fingerprints;
- observation fingerprints;
- public-product, sample or cover reference hashes; or
- human actor identities.

## Alerting boundary

This tranche stops at narrator-bound monitoring.

The existing generic alert and refresh workers can classify and deliver generic
publication incidents. A later admission layer must bind those operations to this
narrator monitor before they are treated as narrator-specific automated lifecycle
events.

In particular, an alert is not permission to remediate or republish.

## Output boundary

The output proves that ongoing publication health remains attached to the exact
narrator and public audiobook identity that originally passed live verification.

It does not guarantee future availability.

It does not perform storefront scraping, refresh scheduling, alert delivery,
retailer mutation, remediation or republication by itself.
