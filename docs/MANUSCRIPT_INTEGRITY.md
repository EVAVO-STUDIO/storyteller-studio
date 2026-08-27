# Manuscript Integrity and Resumable Intake

Storyteller Studio treats the manuscript as immutable source material. A valid final word is not enough evidence that the middle of a long book survived import, chunking, retries and segmentation. This module adds a bounded, deterministic integrity layer before performance planning or provider generation begins.

## Guarantees

`packages/storyteller/src/manuscript-integrity.ts` provides three separate guarantees, while `manuscript-pipeline.ts` binds those guarantees to Storyteller’s normal segmenter:

1. **Whole-source identity** — the exact UTF-8 manuscript is pinned by SHA-256, byte length, UTF-16 code-unit length and Unicode code-point count.
2. **Resumable intake** — deterministic chunks are chained in order and can be accepted out of order through a hash-only checkpoint. Interrupted intake resumes without representing a partial book as complete.
3. **Complete production coverage** — every word-like source span and every non-whitespace source code unit must belong to a valid, exact source segment. A missing middle passage fails even when the final word is present.

These states remain distinct. A valid manifest does not prove all chunks were accepted. A complete checkpoint does not prove production segments cover the source. A coverage report does not approve narration, mastering or release.

## Deterministic manifest

`createManuscriptIntegrityManifest()` walks the source at Unicode code-point boundaries and creates contiguous chunks near a configured UTF-8 byte target. It never cuts a JavaScript surrogate pair. Each descriptor records:

- code-unit and byte ranges;
- code-unit, byte and code-point counts;
- SHA-256 content hash;
- a chain hash bound to the previous descriptor and exact range.

The manifest root and fingerprint therefore detect deletion, insertion, substitution, reordering, duplicated chunks and changed boundaries. Chunking is an intake concern only. Provider synthesis should continue to use the performance-aware production segments and provider limits already governed elsewhere in the engine.

## Preferred intake entry point

Use `segmentManuscriptWithIntegrity` from `@evavo/storyteller-engine/manuscript-pipeline` for production intake. It creates and re-verifies the whole-source manifest, runs the existing deterministic Storyteller segmenter, audits every returned immutable span, and throws before performance planning when any word or non-whitespace range is missing.

The lower-level integrity functions remain separately exported for streamed imports, repair tools and storage gateways that need resumable chunk admission before segmentation.

## Resumable checkpoint

`createManuscriptIngestCheckpoint()` creates an empty acceptance map for one exact manifest. `acceptVerifiedManuscriptChunk()` then:

- validates the checkpoint and manifest lineage;
- verifies code-unit length, UTF-8 byte length and content hash;
- accepts chunks in any order;
- remains idempotent for an already accepted identical chunk;
- advances revision, accepted byte count and the next missing index;
- declares completion only when every manifest chunk is present.

The checkpoint stores hashes, counts, lineage and timestamps. It does not store manuscript text. Raw manuscript chunks remain inside the private source-storage boundary.

## Segment coverage audit

`auditManuscriptSegmentCoverage()` independently validates the production segmentation result. It rejects:

- invalid or duplicated segment identifiers;
- duplicated or decreasing ordinals;
- source-order drift;
- cross-revision source hashes;
- text that does not exactly equal its immutable source slice;
- overlapping spans;
- missing non-whitespace ranges;
- partially covered or completely missing words;
- an uncovered final word.

Separator whitespace may be omitted by paragraph-oriented production segmentation without losing words. Set `requireWhitespaceCoverage: true` for byte-for-byte span coverage. The report always exposes both exact-source coverage and non-whitespace/word coverage so callers cannot confuse the two modes.

Word boundaries use `Intl.Segmenter` when the runtime provides it and fall back to a bounded Unicode letter/number expression. The report records the runtime Unicode version and segmentation mode as evidence because word-boundary behaviour can evolve with Unicode data. Integrity chunk identity itself does not depend on those word boundaries.

## Bounded failure evidence

Malformed or hostile input must not create unbounded logs. Detailed mismatch findings are capped, with a final aggregate finding recording omitted details. Public projections should expose only counts, status and fingerprints. Manuscript text, missing words and private source paths must remain private.

## Required production order

1. Persist or receive the immutable source inside private storage.
2. Create and retain the integrity manifest.
3. Accept every exact chunk through a checkpoint or an equivalent transactional store.
4. Reconstruct or stream the verified source.
5. Segment the source into stable production units.
6. Run the complete segment coverage audit.
7. Block performance planning and generation unless the report is valid.
8. Retain manifest, checkpoint and coverage fingerprints with downstream provenance.

## Migration boundary

The current checkpoint is a provider-neutral value object. A distributed deployment should persist it with optimistic concurrency in PostgreSQL or another transactional store. The same manifest fingerprint, chunk hashes and completion rules must remain authoritative; queue completion must never be inferred from upload attempts or object listings alone.

## Standards and runtime references

- Unicode Standard Annex #29, Unicode Text Segmentation: `https://www.unicode.org/reports/tr29/`
- Node.js `node:crypto` hashing API: `https://nodejs.org/api/crypto.html`
- Node.js internationalisation API: `https://nodejs.org/api/intl.html`
