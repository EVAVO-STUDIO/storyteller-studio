# Narrator mastered review and book sequence binding

A mastered audiobook chapter can be technically valid while still being the wrong narrator performance. Storyteller therefore keeps the narrator evidence chain alive after mastering instead of treating a generic approved `mastered-chapter` artifact as sufficient production proof.

The generic mastered-chapter review and book-sequence modules remain available for non-narrator audio and existing workflows. Production narrator chapters use the narrator-specific wrappers in this document.

## Governed path

```text
exact Audio Studio voice revision
→ Storyteller casting
→ chapter render
→ objective narrator monitoring
→ human chapter narrator review
→ narrator-bound mastering authorization
→ exact mastering render
→ narrator-approved mastered chapter receipt
→ narrator-bound complete mastered-chapter review
→ narrator-bound book chapter sequence
→ separate complete-book listening review
```

The new boundary uses:

```text
packages/storyteller/src/narrator-mastered-review.ts
packages/storyteller/src/narrator-book-sequence.ts
```

## Initial post-master review binding

`createNarratorMasteredReviewBinding` accepts only an untouched mastered-review session and binds it to:

- the exact Storyteller narrator casting;
- the exact pinned Audio Studio profile ID, revision and profile hash;
- the narrator mastering authorization;
- the complete `NarratorApprovedMasteredChapterReceipt`;
- the mastered artifact ID, revision, fingerprint, content hash and byte count;
- the mastered chapter chain fingerprint;
- the original human chapter narrator review fingerprint;
- the objective monitoring fingerprint;
- post-master engineering and mastering-plan evidence;
- the current post-master finding-code set.

The generic review session must be new, open, revision one and contain no review entries. This prevents earlier unbound listening decisions from being imported later as narrator-approved evidence.

## Review finding acknowledgement

Every editorial and engineering review must acknowledge the exact complete finding-code set carried by the narrator mastered receipt.

This includes warnings that may remain human-reviewable, such as prediction drift introduced by non-transparent processing. A review cannot silently ignore one finding or acknowledge a different set. Each acknowledgement is bound to the exact generic review fingerprint and decision time.

The underlying mastered review still requires:

- complete-duration listening;
- independent editorial and engineering reviewers;
- studio-headphone engineering playback;
- consumer playback for editorial review;
- all governed quality dimensions at or above the approval threshold;
- no unresolved changes-requested decision.

## Independent final approval

`createNarratorMasteredReviewApproval` accepts only the immediate approved successor of the bound ready-for-approval session.

It revalidates:

- the complete narrator mastering receipt;
- the exact review history and acknowledgements;
- the approved mastered artifact revision;
- immutable mastered audio content and byte count;
- current rights fingerprint;
- generic artifact-review fingerprint;
- final approval chronology;
- independence of the final approver from both listening roles.

This is the first post-master record allowed to state:

```text
masteredListeningApproval = true
```

It still retains:

```text
completeBookListeningApproval = false
titleNarratorApproval = false
titleReleaseAuthority = false
publicationAuthority = false
```

A technically eligible mastered receipt cannot grant human listening approval by itself.

## Narrator-bound book sequence

`createNarratorBookChapterSequence` wraps the existing deterministic `BookChapterSequence`.

It requires one exact narrator mastered-review approval for every sequence entry and verifies:

- identical project and narrator casting;
- identical pinned voice revision across the book;
- exact chapter identity and order;
- exact mastered artifact revision, fingerprint, content hash and byte count;
- exact mastered-chain fingerprint;
- exact generic mastered-review session fingerprint;
- exact mastering-plan fingerprint;
- mastered listening approval for every chapter;
- sequence creation after every chapter approval.

Missing, duplicate, reordered or substituted narrator approvals fail closed. An approval for another chapter, model revision, mastered artifact or chain cannot be attached to the sequence even if its outer JSON is rehashed.

The private narrator sequence retains every complete narrator mastered-review approval and therefore the exact `NarratorApprovedMasteredChapterReceipt` for every chapter.

## Public privacy boundary

Public projections expose only bounded operational state such as:

- chapter or book identity;
- mastered artifact ID and revision;
- chapter count and duration;
- whether narrator evidence is bound;
- whether per-chapter mastered listening is complete;
- final wrapper fingerprint.

They do not expose:

- Audio Studio profile identity or hash;
- narrator casting fingerprint;
- reviewer identities or panel composition;
- objective monitoring internals;
- narrator mastering authorization;
- private finding acknowledgements;
- source text, transcripts, audio, paths or model evidence.

## Complete-book authority remains separate

A narrator-bound sequence proves that every chapter entered the book from the exact mastered audio reviewed by independent humans under the exact narrator evidence chain.

It does not prove that the assembled book has been listened to continuously. Credits, adjacent chapter transitions, long-form fatigue, pacing across hours, global loudness continuity and the final complete-book experience still require the existing reference-master and complete-book human review path.

The narrator sequence therefore cannot grant complete-book listening approval, title release or publication authority.

## Validation and failure-order semantics

The narrator wrappers validate their embedded evidence before comparing it with the next production boundary. A forged approval may therefore be rejected by the mastered-review validator before the book-sequence validator is reached. This is intentional: the earliest specific integrity failure is preferred over a later generic mismatch.

Regression tests accept only the documented fail-closed classes for each substitution attempt. They do not require one exact error when a stronger upstream validator can reject the same forged evidence first.

The normal verification workflow checks the source contract, TypeScript compilation, the complete engine suite, protected API, private worker, CLI and workspace builds. The read-only Sentinel repeats the narrator boundary, type and artifact audits without modifying the repository. No recurring workflow is permitted to rewrite production source or push corrections automatically.

## Production rule

For production narrator audiobooks:

1. Create the generic mastered-review session from the exact mastered chain.
2. Immediately bind it with `createNarratorMasteredReviewBinding`.
3. Record every role review through `recordNarratorMasteredReview` with exact finding acknowledgements.
4. Complete the generic artifact approval.
5. Create `NarratorMasteredReviewApproval` from the immediate bound session successor and approved artifact.
6. Create the ordinary deterministic chapter sequence.
7. Wrap it with `createNarratorBookChapterSequence` and one exact narrator approval per chapter.
8. Continue into complete-book assembly and listening review.

Do not use a generic mastered approval or generic book sequence alone as production narrator evidence.
