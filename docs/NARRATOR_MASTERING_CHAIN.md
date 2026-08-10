# Narrator-bound mastering chain

Storyteller Studio treats an approved narrator performance as an exact evidence chain, not as a reusable label attached to any later audio file.

The generic mastering engine remains available for non-narrator media and established workflows. Production audiobook narration uses the narrator-specific mastering wrapper so the exact monitored and human-reviewed chapter cannot be replaced between listening approval and mastering.

## Why a separate narrator boundary exists

A generic chapter master can prove that audio bytes are verified, reviewed and technically eligible. That is necessary, but it does not by itself prove that those bytes are the same narrator performance covered by:

- the approved Audio Studio voice profile;
- the exact Storyteller casting;
- the objective transcript, identity, acoustic and engineering monitor;
- the human chapter listening review;
- the reviewed chapter render and assembly plan.

Without an additional binding, a technically valid chapter master or mastering plan could be substituted after narrator review. The narrator mastering chain makes that substitution visible and fail-closed.

## Evidence chain

The governed narrator mastering path is:

```text
exact Audio Studio voice revision
→ explicit Storyteller casting
→ chapter assembly plan
→ exact chapter render evidence and bytes
→ objective chapter monitoring
→ exact human chapter narrator review
→ narrator mastering authorization
→ narrator-approved mastering plan
→ narrator-approved mastering render receipt
→ mastered chapter artifact chain
→ narrator-approved mastered chapter receipt
→ separate full mastered-chapter listening review
```

The narrator mastering authorization binds:

- project and chapter identity;
- casting fingerprint and pinned voice profile ID, revision and hash;
- assembly plan ID and fingerprint;
- exact chapter-render fingerprint, command fingerprint, output hash and byte count;
- exact approved chapter-master artifact ID, revision, fingerprint, hash and byte count;
- exact post-render engineering artifact and evidence fingerprints;
- chapter narrator review fingerprint;
- objective monitoring, policy, reference and observation fingerprints;
- human reviewer-panel fingerprint;
- manuscript-source hash and rights fingerprint;
- authorization actor and chronology.

## Source and chronology checks

Before mastering is authorised, Storyteller revalidates that:

- the human review covers the same chapter-render fingerprint;
- the approved chapter-master bytes match the reviewed render output exactly;
- the chapter-master generation request matches the render command fingerprint;
- the engineering artifact is a verified child of that chapter master;
- the engineering evidence measures those exact bytes;
- sample rate and channel layout match the reviewed render;
- rights remain consistent;
- the human review happened after rendering;
- mastering authorization happened after human review.

A changed artifact revision, altered fingerprint, different render, new engineering result or recomputed outer hash cannot silently replace the approved source.

## Narrator-approved mastering plan

`createNarratorApprovedMasteringPlan` wraps the existing preservation-first mastering planner. The underlying mastering operations and predictions still use the normal Storyteller mastering contract, but the wrapper additionally seals:

- narrator mastering authorization fingerprint;
- exact chapter narrator review fingerprint;
- exact objective monitoring fingerprint;
- exact approved source-master and engineering snapshots.

The source artifacts are reopened and revalidated before the plan is created. A stale approval cannot be reused after the source master or engineering evidence changes.

## Render receipt

`renderNarratorApprovedMasteringPlan` delegates audio processing to the established shell-free, bounded mastering renderer and then creates a narrator-specific receipt.

The receipt binds:

- authorization fingerprint;
- chapter review and objective monitor fingerprints;
- exact mastering plan ID and fingerprint;
- full mastering-render evidence;
- exact output SHA-256 and byte count;
- render timestamp.

Changing the plan, source, operations, predicted metrics, output bytes or render evidence invalidates the receipt.

## Mastered chapter receipt

`ingestNarratorApprovedMasteredChapter` delegates private storage, post-master engineering and mastering-comparison checks to the existing mastered-chapter implementation. It then creates a final narrator receipt that carries the approved narrator evidence through the complete mastering chain.

The receipt binds:

- project, chapter and mastering plan identity;
- narrator authorization fingerprint;
- chapter narrator review fingerprint;
- objective monitoring fingerprint;
- narrator-approved mastering-plan fingerprint;
- mastering-render receipt fingerprint;
- complete mastered-chapter chain fingerprint;
- exact mastered artifact revision, fingerprint, content hash and byte count;
- post-master engineering fingerprint;
- review eligibility and finding codes.

The mastering-plan and mastering-render evidence artifacts are also reopened through their stored content hashes and byte counts before the narrator receipt is accepted.

## Public privacy boundary

The narrator mastered public view exposes only bounded operational state:

- chapter and plan identity;
- mastered artifact ID and revision;
- whether narrator evidence is bound;
- whether the result is eligible for human mastered-chapter review;
- finding codes;
- final receipt fingerprint.

It does not expose:

- Audio Studio profile ID or profile hash;
- casting fingerprint;
- reviewer identities or reviewer-panel fingerprint;
- objective monitoring internals;
- private paths, transcripts or audio;
- model or provider secrets.

## Human authority boundary

The chain can prove that the mastered output descends from the exact monitored and human-approved narrator performance. It cannot decide that the mastered result still sounds good.

Every narrator mastering record therefore retains:

```text
masteredListeningApproval = false
titleReleaseAuthority = false
publicationAuthority = false
```

The mastered bytes still require the existing complete human mastered-chapter review. Book sequencing, complete-book listening, retail packaging, release and publication remain separate governed decisions.

## Failure examples

The chain rejects, among other cases:

- a chapter review created for another render;
- an approved chapter master whose bytes do not match the reviewed render;
- a replaced source-master revision;
- changed post-render engineering evidence;
- a mastering plan created before authorization;
- a render produced from another plan or source;
- altered mastering output bytes;
- a mastered artifact chain that does not match the approved plan and render receipt;
- a recomputed receipt containing different review or monitoring fingerprints.

## Production rule

For production narrator chapters, use:

```text
createNarratorMasteringAuthorization
createNarratorApprovedMasteringPlan
renderNarratorApprovedMasteringPlan
ingestNarratorApprovedMasteredChapter
```

Do not call the generic mastering path directly after narrator chapter approval. The generic functions remain the internal processing implementation and the route for non-narrator assets; the narrator wrapper is the production admission boundary that preserves performance identity.
