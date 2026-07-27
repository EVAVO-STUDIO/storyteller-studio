# Mastered chapter human review

Status: executable foundation 0.2.0  
Scope: full-chapter editorial and engineering acceptance before audiobook release

## Purpose

Technical eligibility is necessary but not sufficient for an audiobook chapter. A mastered file can satisfy measured delivery limits while still sounding tiring, overly processed, unclear, tonally inconsistent or disconnected from neighbouring chapters.

Storyteller Studio therefore requires a durable human review session bound to the exact mastered artifact and mastered evidence chain.

## Exact evidence binding

A review session snapshots:

- mastered artifact identifier, revision, fingerprint, content hash and byte count;
- mastered evidence-chain fingerprint;
- chapter identifier;
- observed full-chapter duration;
- required review roles;
- every review and final approval revision.

A different mastered artifact, revised artifact record or changed evidence chain cannot reuse the session.

## Required roles

Every chapter requires two independent human reviews:

1. **Editorial review** — listener relationship, clarity, performance continuity, fatigue and narrative flow.
2. **Engineering review** — tonal balance, dynamics, noise consistency, breath and consonant integrity, silence and transition integrity.

The latest editorial and engineering reviews must come from different human reviewers.

Identifiers associated with workers, automation, systems or bots cannot submit or finally approve a review.

## Full-chapter listening

A review is accepted only when its listened duration covers the complete mastered chapter within a small measurement tolerance. Short samples cannot approve a long-form chapter.

Editorial review must include consumer headphones or speakers. Engineering review must include studio headphones.

## Review dimensions

Each role scores the following dimensions from one to five:

- listener comfort;
- intelligibility;
- tonal balance;
- dynamic naturalness;
- noise consistency;
- breath and consonant integrity;
- silence and transition integrity;
- continuity with neighbouring chapters.

An approval decision does not make the session ready when any latest score is below four.

## Changes requested and re-review

`changes-requested` requires written notes. It does not destroy earlier evidence.

After a corrected mastered artifact is created, a new session is required because the artifact fingerprint changes. When the artifact is unchanged and the reviewer is reassessing the same evidence, a later role review may supersede the earlier role decision while preserving the complete history.

## Final confirmation

Two role approvals make a session `ready-for-approval`. A separate explicit human confirmation then:

- records a final confirmation identifier;
- records the approving actor and time;
- creates a linked mastered-artifact review revision;
- changes the session to `approved`;
- fingerprints the complete approval evidence.

The operation never releases the audiobook. Release remains a separate dependency-graph decision.

## Durable store

The file-backed review store provides:

- idempotent creation for identical sessions;
- optimistic expected revisions;
- linked previous fingerprints;
- integrity-checked project-store envelopes;
- bounded audit metadata;
- rejection of stale writes.

Audit events expose status and counts, not reviewer identities or private review notes.

A production multi-user deployment should preserve these semantics inside a transactional database. Approval of the review session and approval of the mastered artifact should occur in one database transaction.

## Public projection

The public review view exposes:

- session and mastered-artifact identifiers;
- artifact revision;
- duration;
- required roles;
- latest role decisions;
- playback-context coverage;
- score averages;
- status and readiness;
- revision and fingerprint.

It omits reviewer identities, notes, final confirmation identifiers and final approver identity.

## Current boundary

This workflow approves individual mastered chapters. It does not yet approve complete-book order, opening and closing credits, retail encodes, metadata or release packages.
