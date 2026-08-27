# Canonical story truth and continuity ledger

Storyteller Studio treats long-form narrative truth as private, revisioned production data rather than a prompt summary. The ledger preserves canonical entities, aliases, world events, temporal facts, contradictions, evidence and approved retcons across a book or series.

This layer sits after lossless manuscript intake and before performance, illustration or generation planning. A model may propose entities or facts, but a proposal does not become canon merely because it was generated confidently.

## Design principles

### Immutable evidence first

Every source-backed event or fact points to an exact immutable manuscript revision through:

- book and manuscript revision identifiers;
- the complete manuscript SHA-256 hash;
- an exact UTF-16 source range;
- a SHA-256 hash of the supporting excerpt;
- optional stable chapter and segment identifiers.

The ledger never substitutes a free-form summary for source evidence. Public projections and audit records expose only bounded counts, states and fingerprints, not character names, aliases, predicates, fact values, source excerpts or private notes.

### Separate entity and event graphs

Canonical entities retain identity across changing names, titles and descriptions. Events remain separate nodes with participants, roles, locations, causal edges, narrative order and world order.

This avoids collapsing every mention into a timeless entity record. A character may move, age, change allegiance, learn something or lose an object without rewriting the earlier state that was true at another point in the story.

### Narrative order is not world order

Each event carries both:

- `narrativeOrder`, describing where the event is disclosed in a particular book; and
- `worldOrder`, describing its canonical position in story time.

Flashbacks, framed testimony, prolepsis and delayed revelation can therefore be represented without pretending that reading order and chronology are identical.

### Time-aware atomic facts

Facts use half-open validity intervals: `[validFromWorldOrder, validUntilWorldOrder)`. Two single-valued canonical facts with the same subject and predicate may differ when their intervals do not overlap. Incompatible canonical facts over an overlapping interval are errors.

Multi-valued facts can coexist, but asserting and denying the same membership over the same interval remains a contradiction.

### Explicit truth states and authority

A fact is one of:

- `canonical` — admitted production truth;
- `proposed` — machine or human proposal awaiting review;
- `disputed` — intentionally retained uncertainty or conflicting testimony;
- `superseded` — prior canon changed through an approved retcon.

Authority is tracked separately as source evidence, approved canon, author note or derived inference. Queries return canonical truth by default and include disputed or proposed material only when explicitly requested.

### Controlled retcons

A retcon is append-only. It must identify:

- every fact being superseded;
- every replacement fact, when replacements exist;
- a meaningful rationale;
- the approving actor and time;
- a hash of the decision evidence.

The prior ledger fingerprint remains linked through `previousFingerprint`. Silent mutation of an earlier canonical fact is rejected.

### No silent identity merge

Alias resolution returns `resolved`, `ambiguous` or `not-found`. Multiple characters may legitimately share a title or nickname, but the system will not silently collapse them into one identity. Ambiguous aliases are retained as visible review findings.

## Persistence boundary

`FileStoryTruthStore` persists verified ledgers in the existing private `story-bible` namespace with optimistic revisions and hash-chained envelopes. Storage audit metadata contains only counts, revision numbers and fingerprints.

The file implementation is intended for local, single-host production and deterministic tests. The ledger model is independent of that driver and can move to transactional storage without changing the truth contract.

## Research basis

The implementation follows current narrative-consistency research rather than relying on embedding similarity alone:

- **FactTrack: Time-Aware World State Tracking in Story Outlines** (NAACL 2025) motivates atomic facts with explicit validity intervals and contradiction checks.
- **Respecting Temporal-Causal Consistency: Entity-Event Knowledge Graph for Retrieval-Augmented Generation** (EACL 2026) motivates distinct entity and event graphs joined through participants and causal relations.
- **Lost in Stories: Consistency Bugs in Long Story Generation by LLMs** (ACL Findings 2026) identifies factual and temporal consistency as major long-form failure classes and grounds checks in explicit textual evidence.

References:

- https://aclanthology.org/2025.naacl-long.144/
- https://aclanthology.org/2026.eacl-long.90/
- https://aclanthology.org/2026.findings-acl.410/

## Authority boundary

The ledger can detect, retain and present contradictions. It does not grant a model automatic authority to:

- merge entities;
- promote proposals into canon;
- resolve disputed testimony;
- change chronology;
- approve a retcon;
- rewrite manuscript text;
- approve narration, artwork, release or publication.
