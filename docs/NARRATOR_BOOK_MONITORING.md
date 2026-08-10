# Whole-book narrator quality monitoring

Storyteller Studio treats objective narrator monitoring as an admission and anomaly-detection layer around human long-form listening. It does not treat acoustic measurements as a substitute for editorial judgement.

## Scope

The monitor is bound to one exact approved Storyteller narrator casting. Every chapter observation carries the exact Audio Studio profile ID, revision and profile hash through the casting fingerprint, plus the exact chapter render and source fingerprints.

A chapter observation contains only aggregate objective measurements and hashes of the private evidence that produced them. Raw manuscript text, transcripts, audio, speaker embeddings, reviewer identities and private filesystem locations are not part of the monitoring result.

## Objective chapter evidence

The monitored chapter evidence includes:

- transcript coverage and insertion ratio;
- final-word presence;
- clipped-sample count;
- unexpected speaker-change count;
- minimum narrator identity similarity;
- acoustic signature: median pitch, pitch range, speaking rate, pause ratio, energy and optional embedding distance;
- chapter duration;
- repeated cadence-template similarity;
- repeated sentence-final contour ratio;
- noise floor;
- room-tone level;
- maximum segment-seam discontinuity;
- hashes for transcript, identity, acoustic and engineering evidence.

The thresholds live in a fingerprinted monitoring policy rather than being silently hard-coded as universal truths. The production policy can therefore be reviewed and versioned alongside the Audio Studio benchmark and Storyteller calibration evidence.

## Reference binding

The objective quality reference is bound to the same exact narrator casting and voice revision. It supplies the approved acoustic anchor, room-tone reference and optional expected chapter duration together with a private evidence hash.

Storyteller reuses the existing acoustic continuity assessment for pitch, pitch range, speaking rate, pause behaviour, energy and embedding drift. This avoids maintaining a second incompatible voice-continuity score.

## Fail-closed chapter gates

The policy can require zero clipping, complete final-word evidence and no unexpected speaker changes. Transcript loss, excessive insertions, identity-similarity failure, excessive noise or rejected acoustic drift make the chapter `requires-regeneration`.

Potentially synthetic long-form patterns such as repeated cadence templates and repeated sentence-final contours are surfaced as explicit human-attention findings. Room-tone drift, seam discontinuity and material duration drift are also review findings rather than silently averaged away.

A clean chapter becomes only:

```text
eligible-for-human-review
```

It never becomes human-approved automatically.

## Exact human-review binding

The human `ChapterNarratorReview` schema is version 2 and requires the exact objective monitoring result used for that review. The review binds:

- monitoring fingerprint;
- policy fingerprint;
- reference fingerprint;
- objective-observation fingerprint;
- source fingerprint;
- render fingerprint;
- casting fingerprint and exact voice revision;
- monitoring status and continuity result;
- objective warning and finding codes;
- explicit reviewer acknowledgement of every warning;
- monitoring and review timestamps.

The human review is rejected when the monitoring evidence belongs to another project, chapter, casting, voice revision, source or render. A `requires-regeneration` result cannot be converted into an approval by adding strong subjective scores. Warning-only evidence can proceed only when the exact warning-code set is acknowledged in the sealed review.

The review timestamp must be at or after the objective monitoring timestamp. This prevents a pre-existing approval from being rebound to monitoring evidence created later.

The resulting chapter-review fingerprint seals both the human scores and the objective monitoring evidence. The existing title-narrator approval consumes those chapter-review fingerprints, so title approval cannot substitute a different chapter render after monitoring or listening.

## Whole-book monitoring

The book monitor requires every expected chapter exactly once and in the expected order. It aggregates chapter results and also compares adjacent chapter acoustic signatures, catching drift that may be modest relative to the original reference but obvious across consecutive chapters.

The result records:

- stable chapter count;
- human-attention chapter count;
- regeneration chapter count;
- maximum adjacent acoustic drift;
- average reference-continuity score;
- deduplicated finding codes;
- the exact chapter-result fingerprints used in the decision.

Any chapter that requires regeneration blocks the book monitoring result. Warning-only chapters keep the book in human-attention state. Only a complete book with no objective errors or review findings becomes `eligible-for-human-book-review`.

## Human authority boundary

Both chapter and book monitoring results explicitly retain:

```text
humanListeningApproval = false
titleNarratorApproval = false
titleReleaseAuthority = false
publicationAuthority = false
```

The monitor cannot approve narration performance, select the title narrator, approve mastering, release a title or publish anything. Those decisions remain in the existing Storyteller human-review and release-governance layers.

## Production flow

```text
exact Audio Studio voice revision
→ explicit Storyteller casting
→ casting-bound generation jobs
→ private synthesis and artifact evidence
→ objective chapter monitoring
→ regeneration or human attention where required
→ exact monitoring fingerprint bound into human chapter listening review
→ all monitored chapter-review fingerprints bound into title narrator approval
→ separate mastering and release governance
```

The intent is to catch errors, speaker drift, monotony and continuity problems early while preserving the human judgement needed to decide whether a long-form performance actually sounds natural, emotionally truthful and comfortable to listen to.
