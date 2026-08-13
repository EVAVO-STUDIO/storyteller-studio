# Expressive cast continuity

Storyteller’s expressive performance layer already governs the quality of one
narrator or character performance. This contract governs how those approved
performances are assigned across a complete book.

It solves a different failure mode from synthesis quality. A take can sound
natural in isolation and still be wrong for the book when dialogue is routed to
the narrator, two characters collapse onto one generic voice, a character is
silently recast in a later scene, or the same emotional and cadence template is
reused until every line sounds mechanically similar.

## Canonical model

An `ExpressiveCastContinuityPlan` binds one immutable book source to:

- One exact narrator assignment.
- A bounded registry of approved narrator and character role bindings.
- An ordered route for every spoken segment.
- The exact expressive generation binding and performance direction used by
  that segment.
- A private performance beat that explains how the line should turn.
- Append-only revision lineage.

The plan does not contain an automatic casting engine. Casting remains an
explicit governed decision. The plan records and verifies those decisions so a
normal generation worker can use the existing `ExpressiveGenerationBinding`
without inventing another voice or performance path.

## Narration and dialogue routing

Every route declares one of three spoken forms:

- `narration`
- `dialogue`
- `internal-monologue`

Narration must use the registered narrator assignment. Dialogue and internal
monologue must use a registered character assignment. A segment can have only
one route, each route has one deterministic position, and the first use of a
role must match its registered introduction chapter and scene.

The resolved route can be passed directly into the existing generation
material:

```ts
const route = expressiveCastRouteForSegment(plan, segmentId);

assertExpressiveCastRouteMaterial(plan, segmentId, {
  text,
  immutableSourceHash,
  voiceProfileId: route.generation.role.voice.profileId,
  voiceRevision: route.generation.role.voice.revision,
  voiceProfileHash: route.generation.role.voice.profileHash,
  direction: route.direction,
  expressivePerformance: route.generation,
});
```

The existing worker then builds its normal expressive synthesis requests. This
module does not duplicate provider selection, Audio Studio execution, artifact
ingest, review, mastering, or publication logic.

## Exact long-form identity

A role registration retains the approved:

- Role and character identity.
- Voice profile identifier, revision, and hash.
- Voice strategy.
- Engine key.
- Performance anchor.
- Rights fingerprint.
- Approval evidence.

Every route must carry that exact registered role binding. Rehashing an outer
route or generation object cannot hide a replacement voice.

Dedicated character voices cannot collapse onto the same exact voice identity.
A single performer may carry several characters through
`performance-variation`, but each character still requires a distinct
performance anchor.

## Emotional and cadence variation

Emotion can and should change from scene to scene. Voice identity cannot.

Each route carries a specific performance beat plus the expressive plan’s
emotion, emotional trajectory, subtext, cadence, pitch range, dynamic range,
phrase variation, and pause variation.

Generic beats such as `neutral`, `default`, `read naturally`, or `same as
before` are rejected. The same role may reuse one performance template twice,
which allows a deliberate sustained beat, but a third consecutive reuse fails
with `EXPRESSIVE_CAST_CADENCE_TEMPLATE_OVERUSE`. This protects long-form
listening from repeated sentence shapes and generic machine-like delivery
without forcing arbitrary voice changes.

## Append-only revisions

A continuity plan is immutable once fingerprinted. A revision must:

- Advance exactly one revision.
- Point to the previous fingerprint.
- Preserve the original creation time.
- Preserve the exact project, book, source, and narrator assignment.
- Retain every established role.
- Retain every existing route as an unchanged prefix.
- Append only later routes.
- Use a later update time.

A revised plan cannot silently remove a role, rewrite an approved line, insert a
new route before recorded work, or recast a character. A legitimate recast
requires a separate explicit casting and continuity decision; this contract
does not manufacture that authority.

## Privacy

The private plan contains voice pins, character names, performance anchors,
subtext, text hashes, directions, and line-level performance beats.

Its public view exposes only:

- Project and book identifiers.
- Revision and plan fingerprint.
- Role, character, chapter, scene, and route counts.
- The fail-closed authority policy.

It omits voice identifiers and hashes, character names, performance anchors,
line text, source hashes, text hashes, subtext, directions, approval actors, and
performance beats.

## Authority

The following values are permanently false:

```text
genericFallbackAllowed
automaticRecastAuthority
automaticPerformanceRewriteAuthority
titleReleaseAuthority
publicationAuthority
```

A valid plan proves continuity and routing only. It does not approve a take,
chapter, title, retail submission, or publication.
