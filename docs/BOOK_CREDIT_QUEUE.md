# Calibrated audiobook credit queue admission

Status: executable private foundation 0.2.0  
Scope: approved opening and closing credit generation

## Purpose

An approved credit script is not automatically executable work. Storyteller Studio first creates and persists one calibrated generation plan, its exact private worker material and its production calibration binding. Only that complete prepared bundle may enter the durable generation queue.

This prevents opening and closing credits from becoming a smaller, less-governed text-to-speech path.

## Admission order

The private preparation and queue sequence is:

1. approve exact credit wording through independent editorial and rights review;
2. derive a deterministic generation job;
3. persist the complete approved script inside the private generation plan;
4. persist exact worker material containing the approved text;
5. persist the approved production calibration binding;
6. validate all three integrity-checked store envelopes;
7. enqueue the exact job through the normal durable generation queue;
8. allow the normal private worker to claim and resolve that material and calibration.

A queue item is never created first and completed with governance evidence later.

## Envelope validation

Queue admission revalidates:

- store schema and entity type;
- entity identifier and revision;
- payload content hash;
- complete envelope hash;
- plan, material and calibration fingerprints;
- project, job and segment scope;
- job cache key and candidate count;
- exact approved script text and immutable source hash;
- queue job and idempotency key.

A caller cannot construct a plausible JavaScript object and have it treated as persisted evidence.

## Idempotency

The queue entity is derived from the generation job identifier. Repeating admission for the same exact plan returns the existing durable queue envelope. A changed script, direction, pronunciation, calibration, rights snapshot, candidate count, format or sample rate changes the job cache key and cannot silently reuse incompatible queued work.

Admission may also be repeated after a worker has claimed the item. The safe receipt reports the current queue status without exposing the lease token or token hash.

## Worker compatibility

The credit queue uses the existing `FileGenerationQueue`, `FileGenerationMaterialStore` and `FileGenerationCalibrationBindingStore` contracts.

A claimed credit job therefore resolves:

- the exact approved credit text;
- the immutable source hash;
- the approved narrator voice revision;
- the production provider route;
- canonical pronunciations;
- rights and cost policy;
- the approved production calibration lock.

No special credit provider adapter or public synthesis endpoint exists.

## Privacy boundary

The public queue receipt may expose bounded operational state such as:

- plan, book, job and queue identifiers;
- opening or closing role;
- queue status and revision;
- priority and maximum attempts;
- availability and enqueue time;
- receipt fingerprint.

It omits:

- credit text;
- narrator and voice-profile identity;
- provider and model identity;
- calibration session and reference takes;
- pronunciation details;
- rights evidence;
- cost ceilings;
- private store hashes;
- lease tokens and worker identifiers.

## Current boundary

This module prepares and admits credit work to the private queue. It does not expose worker claim operations, provider credentials, audio bytes, artifact storage locations, approvals or release controls through the normal web or API surface.

The generated credit audio must still pass the same independent artifact, engineering, human-review, mastering and release gates as other audiobook audio.
