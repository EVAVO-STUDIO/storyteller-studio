# Governed audiobook chapter sequence

Status: executable foundation 0.2.0  
Scope: immutable ordering of approved mastered chapters before credits and book assembly

## Purpose

A collection of approved chapter files is not yet an audiobook. Storyteller Studio first creates an immutable chapter sequence that proves which exact mastered chapters belong to the book, their order, their technical compatibility and the approvals used to admit them.

The sequence is deliberately separate from opening credits, closing credits, retail encoding and release packaging.

## Admission boundary

Every sequence entry must provide:

- a verified mastered-chapter evidence chain;
- the exact mastering plan;
- an approved mastered-chapter review session;
- the linked approved artifact revision created by that review;
- current audiobook and commercial-use rights.

The approved artifact must be the immediate linked review revision of the mastered artifact captured by the chain. A different artifact, chain, review session or mastering plan is rejected.

## Chapter order and roles

Ordinals must be contiguous from one with no gaps or duplicates.

Supported roles are:

- `prologue` — optional and only at ordinal one;
- `chapter` — normal body chapter;
- `epilogue` — optional and only at the final ordinal.

Chapter identifiers and mastered artifact identifiers must be unique.

## Technical consistency

Every chapter must share:

- the same governed engineering-profile fingerprint;
- the same lossless WAV sample rate;
- the same channel layout;
- the same bit depth;
- the same rights fingerprint.

A book sequence never hides resampling, channel conversion or mixed mastering policies. Those require a separate governed correction before sequencing.

## Rights at sequencing time

Rights are checked again when the sequence is created or revised. A chapter may have been valid during mastering but become unavailable before book assembly because of expiry, deletion deadlines or a changed permitted use.

## Immutable entries

Every chapter entry retains:

- ordinal, role, chapter identifier and title;
- mastered duration;
- exact approved artifact revision, fingerprint, content hash and byte count;
- mastered-chain fingerprint;
- review-session fingerprint;
- mastering-plan fingerprint;
- entry fingerprint.

The sequence stores total duration and fingerprints the complete ordered set.

## Revision model

Changes to titles or order create a new linked sequence revision. Project, book and sequence identifiers are immutable. Stale expected revisions are rejected by the durable store.

A revised sequence does not mutate mastered audio or review evidence.

## Durable store

The file-backed store provides:

- idempotent creation for identical sequence intent;
- optimistic expected revisions;
- linked fingerprints and integrity-checked envelopes;
- bounded audit metadata;
- stale-write rejection.

Audit records contain counts, total duration and output characteristics, not chapter titles, artifact identifiers or private evidence.

## Public projection

The public view exposes:

- book title and language;
- optional series and volume details;
- output profile;
- chapter count and total duration;
- ordered public chapter identifiers, roles, titles and durations;
- sequence status, revision and fingerprint.

It omits mastered artifact identifiers, object references, content hashes, reviewer evidence and rights records.

## Current boundary

A valid sequence is `ready-for-credits`. It is not release-ready.

The next layer must create and approve opening and closing credit masters, then compose them with this sequence into a complete-book assembly plan.
