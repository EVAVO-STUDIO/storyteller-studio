# Governed audiobook credit-take review

Status: executable private foundation 0.2.0  
Scope: selecting one generated opening or closing credit take

## Purpose

Passing transcript and engineering checks makes a credit take reviewable, not approved.

Opening and closing credits establish the listener's first and final impression of the audiobook. Storyteller Studio therefore requires independent editorial and engineering review of the complete candidate before one take can be selected and explicitly approved.

## Candidate set

A review session accepts between two and eight candidates. Every candidate must:

- be classified as the same opening or closing credit role;
- belong to the same project, book, generation plan and approved script revision;
- use the same narrator voice revision and production calibration lock;
- use the same reviewed engineering profile and version;
- have exact transcript and final-word evidence;
- remain independently engineering-eligible;
- bind the engineering evidence to the candidate's audio hash and byte count.

Candidates or audio artifacts cannot be duplicated inside one session.

## Independent roles

The required roles are:

- `editorial` — wording, pronunciation, diction, pacing, tone and listener-facing clarity;
- `engineering` — boundary cleanliness, technical comfort and consistency with the approved narrator sound.

The latest editorial and engineering approval for a selected candidate must come from different people. System, worker, automation and bot identities cannot review, select or approve.

## Complete listening

Each reviewer must listen to the full candidate, allowing only a small timing tolerance for measured duration differences.

Editorial review requires consumer headphones or speakers. Engineering review requires studio headphones. Together, these contexts prevent approval based on one flattering monitoring environment.

## Score dimensions

Every review scores the candidate from one to five for:

- wording fidelity;
- pronunciation;
- diction;
- pacing;
- tone;
- boundary cleanliness;
- technical comfort;
- narrator consistency.

Every dimension must score at least four for the candidate to become selectable.

A `changes-requested` decision requires notes and prevents selection until a later review replaces it with an acceptable decision.

## Selection and approval

Selection occurs only after both independent roles approve the same candidate with sufficient scores. The selection stores the exact latest review-set fingerprint.

A later change to either selected review makes the selection stale rather than silently changing the evidence underneath it.

Approval then requires:

- an existing non-stale selection;
- an explicit final-confirmation identifier;
- a human approver;
- explicit `humanConfirmation: true`;
- a revisioned approval fingerprint.

Approval does not automatically master, assemble or release the credit audio.

## Durable state

The private session stores:

- complete eligible take records and engineering evidence;
- measured candidate durations;
- every review revision;
- selected candidate and review-set fingerprint;
- final approval;
- revision and previous-fingerprint chain;
- complete session fingerprint.

The file-backed store provides optimistic revisions and redacted audit metadata. A production database must retain the same semantics.

## Public and audit boundary

The bounded public projection may expose:

- book and credit role;
- candidate and reviewed-candidate counts;
- selected take identifier;
- latest selected decisions;
- playback contexts;
- selected score averages;
- status, readiness, revision and fingerprint.

It omits:

- approved credit text;
- audio and evidence artifact identifiers;
- content hashes and private storage;
- provider, model and calibration-session identity;
- rights evidence;
- reviewer, selector and approver identities;
- review notes;
- private engineering command evidence.

## Current boundary

This workflow selects and approves one generated credit take. The selected audio must still be assembled and, where required, mastered and remeasured as a governed opening or closing credit master before it can enter the complete-book release graph.
