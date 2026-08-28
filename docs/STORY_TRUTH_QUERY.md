# Private story-truth queries and review queue

The temporal story-truth ledger is deliberately private production data. This query layer gives authenticated operator surfaces a bounded way to inspect canonical entities, time-aware facts, event chronology, validation findings and unresolved decisions without exposing source evidence or granting write authority.

## Read projections

The query module returns purpose-built views instead of returning a ledger payload directly:

- entity views omit `privateNotesHash`;
- event views omit manuscript revisions, source ranges and excerpt hashes;
- fact views omit all evidence coordinates and hashes;
- finding views retain only the diagnostic code, severity, message and stable related identifiers;
- review items retain the unresolved identity or fact relationship but no approval actor, rationale or decision evidence.

The full ledger remains available only inside the private persistence and production-planning boundary.

## Bounded, revision-bound pagination

Entity, fact, timeline, finding and review queries are capped at 200 rows per page. Every cursor is bound to:

- the query collection;
- the exact ledger fingerprint;
- the normalised query fingerprint;
- the next offset;
- a deterministic integrity checksum.

A cursor is rejected when it is malformed, changed, used with another query, used for another collection or reused after the ledger changes. The checksum catches malformed or casually altered state but is not a signature: cursors are opaque navigation tokens, never authorization credentials.

## Temporal fact reads

Fact queries can select an exact `worldOrder`. A fact is active only when the requested position falls inside its half-open validity interval:

```text
validFromWorldOrder <= worldOrder < validUntilWorldOrder
```

Canonical facts are returned by default. Proposed, disputed or superseded facts appear only when their states are explicitly requested.

## Human review queue

The review queue deterministically surfaces:

- aliases that resolve to more than one canonical entity;
- proposed facts that have not been admitted to canon;
- disputed facts that require an explicit production decision;
- validation findings that need investigation.

Every review item states `requiresHumanDecision: true`. The query layer cannot merge identities, promote facts, resolve disputes, approve retcons, alter chronology, rewrite manuscripts, start generation, approve media or release a publication.

## Intended API boundary

A future HTTP or web adapter should mount these functions only behind the existing Storyteller authentication, request-size and no-store controls. That adapter must continue to expose read-only projections and must not accept body-supplied actor identities or approval authority.
