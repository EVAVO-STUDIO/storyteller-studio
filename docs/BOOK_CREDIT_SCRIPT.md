# Governed audiobook credit scripts

Status: executable foundation 0.2.0  
Scope: exact opening and closing credit wording before narration generation

## Purpose

Opening and closing credits are rights-bearing production text. They must not be invented by a voice provider, silently normalised, or treated as an informal prompt.

Storyteller Studio renders credits from a reviewed, versioned policy and exact approved metadata. Credit text is then reviewed independently before any audio is generated.

## Versioned credit policy

A policy records:

- policy identifier and version;
- language tag;
- review date;
- private policy source reference;
- maximum rendered word count;
- standalone opening and closing templates;
- series opening and closing templates;
- required semantic tokens;
- immutable fingerprints.

Retailer or distributor wording can change. A policy update creates a new version rather than silently changing previously approved scripts.

## Semantic templates

Supported placeholders are:

- title;
- series title;
- volume number;
- author credit;
- narrator credit;
- copyright notice;
- production credit.

Opening templates must include title, author and narrator credits. Closing templates must also include the copyright notice. Series templates must include series title and volume number.

Unknown tokens, duplicate templates and unresolved placeholders are rejected.

## Exact rendering

Human-approved metadata is inserted without paraphrasing. Punctuation, Unicode names and wording are preserved.

The rendered script stores:

- exact text;
- text hash;
- word count;
- metadata fingerprint;
- policy identifier, version and fingerprint;
- revision and linked fingerprints.

## Editorial and rights review

Two independent human roles are required:

1. **Editorial** — title, author and narrator credits are exact and pronunciations are confirmed.
2. **Rights** — copyright wording, credit entitlements and commercial use are confirmed.

An approval decision is invalid when its required semantic checks are missing. Workers, systems, automation and bots cannot review or finally approve credit scripts.

`changes-requested` requires notes and remains part of the immutable review history. A later role review may supersede the earlier decision.

## Final confirmation

When the latest editorial and rights decisions approve, the script becomes `ready-for-approval`. Explicit human confirmation then records the approving actor, confirmation identifier and approval time.

Approval does not generate audio and does not release anything.

## Durable store

The file-backed store provides idempotent creation, optimistic revisions, linked fingerprints, integrity-checked envelopes and stale-write rejection.

Audit events contain kind, status, word count and review count. They omit credit text, reviewer identities, notes and confirmation identifiers.

## Public projection

The public view exposes script identity, book identity, kind, project kind, policy identity, text hash, word count, latest role decisions, status, revision and fingerprint.

It omits exact text, policy source references, metadata, reviewer identities, notes and final approval details.

## Current boundary

An approved script is ready for governed narration calibration and generation. It is not yet a mastered opening or closing credit artifact.
