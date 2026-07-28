# Governed audiobook reference-master review

A technically eligible complete-book WAV is not automatically an approved audiobook. The reference-master review boundary requires qualified humans to listen to the exact governed reference artifact as one continuous book, evaluate every component and transition, and explicitly approve that exact artifact revision before distributor-specific encoding can begin.

This workflow is separate from chapter review. A chapter can be individually acceptable while the assembled book still contains a wrong chapter order, repeated or missing material, incorrect credits, abrupt boundaries, tonal drift, tiring narration, inconsistent silence, or a complete-book technical defect.

## Admission boundary

A review session can only be created from an eligible `audiobook-reference-master` chain whose:

- sequence, render and post-render engineering evidence are valid;
- reference WAV is verified, private and not quarantined;
- artifact review remains pending;
- project, book, sequence revision and sequence fingerprint agree;
- observed duration remains within the governed reference-master tolerance;
- rights fingerprint matches the approved audiobook sequence.

The session locks the exact reference-artifact identifier, revision, fingerprint, content hash and byte count. A different render, revised sequence, replacement credit, changed chapter or altered engineering result requires a new reference chain and a new review decision.

## Whole-book coverage

Each role must confirm a complete listen of the reference master. The recorded duration must cover the whole book within the narrow review tolerance.

Every review also records and validates:

- the complete sequence component count;
- the complete chapter count;
- every opening-credit, chapter and closing-credit component;
- every boundary between adjacent components;
- the exact reference-master revision under review.

A spot check, sampled listen or collection of chapter approvals cannot satisfy this gate.

## Independent roles

Two independent roles must submit current decisions:

- **Editorial review** assesses narrative continuity, sustained listenability, chapter order and labelling, credit accuracy, pacing, transitions and the experience of the assembled book.
- **Engineering review** assesses tonal and loudness consistency, silence shape, boundary integrity, clicks, clipping, noise changes, encoding precursors and other complete-book technical defects.

One person cannot provide both current role decisions. Automation, workers, bots and system identities cannot review or approve the book.

## Playback coverage

The current approval policy requires aggregate listening through:

- studio headphones;
- consumer headphones;
- speakers.

Editorial review must include a consumer context. Engineering review must include studio headphones. Mobile-device playback can be added as further evidence, but it does not replace the required three-context set.

## Quality model

Each current role review scores the whole book from one to five for:

- narrative continuity;
- sustained listenability;
- chapter order and labelling;
- credit accuracy;
- transition integrity;
- silence and boundary integrity;
- tonal and loudness consistency;
- freedom from technical defects.

Every dimension must score at least four before the session can become ready for final approval. An impressive opening or a technically compliant average cannot conceal a weak chapter transition, repeated cadence, incorrect credit or isolated defect later in the book.

## Structured findings and re-review

A `changes-requested` decision requires both human notes and one or more stable finding codes. Examples include a transition click, wrong chapter order, credit wording problem, repeated passage, level jump or tiring sustained performance.

An approval decision cannot retain unresolved finding codes. A later review for the same role supersedes its earlier role decision but preserves the complete revision history. The book remains blocked until the latest editorial and engineering reviews both approve, all scores clear the threshold, all required playback contexts are represented and no current findings remain.

## Third-person final confirmation

Two successful role reviews make the session `ready-for-approval`; they do not approve the artifact by themselves.

A third independent human must provide:

- an explicit final-confirmation identifier;
- a human-confirmation flag;
- their actor identity;
- an approval timestamp.

The final approver cannot be either current role reviewer. Approval records the reviewer-set fingerprint, exact artifact-review event, resulting approved artifact revision and resulting artifact fingerprint.

## Rights revalidation

Commercial audiobook rights are checked again at final approval. Approval fails when:

- audiobook use is absent;
- commercial use is not approved;
- the rights fingerprint no longer matches the sequence;
- rights have expired;
- the retention or deletion boundary has already been reached.

A technically and editorially excellent reference cannot proceed on stale rights evidence.

## Durable review state

The file-backed review store provides:

- create-once idempotency;
- optimistic expected-revision checks;
- previous-fingerprint revision chaining;
- integrity validation on every read;
- bounded audit metadata;
- stale-write rejection.

Audit entries contain safe operational counts and status only. They do not include reviewer identities, notes, finding codes, chain hashes, media hashes or private storage details.

## Privacy boundary

The public projection exposes safe readiness information such as status, counts, playback contexts, aggregate scores, current finding codes, dates and the reference artifact revision.

It omits:

- reviewer and approver identities;
- reviewer notes;
- final-confirmation identifiers;
- rights records;
- source and content hashes;
- chain and parent-artifact details;
- object-store locations;
- executable and temporary paths.

The mutation functions remain outside normal web and API runtimes. Public routes cannot create reviews, submit decisions or approve a reference master.

## Current boundary

An approved reference master is eligible to enter governed retail-encoding preparation. It is not a released retail audiobook and it is not yet a distributor package.

The next production layers still need to provide:

1. versioned distributor-specific encoding profiles;
2. deterministic lossless-to-delivery encoding without repeated transcoding;
3. independent engineering of every encoded output;
4. title, author, narrator, copyright, cover and chapter-marker validation;
5. source-to-encode provenance and checksum manifests;
6. distributor package assembly;
7. explicit final release confirmation.

The approved lossless reference WAV remains immutable. Retail encodes are derived artifacts and never overwrite the reviewed reference master.
