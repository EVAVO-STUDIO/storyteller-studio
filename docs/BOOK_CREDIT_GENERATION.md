# Calibrated audiobook credit generation

Status: executable foundation 0.2.0  
Scope: private preparation of approved opening and closing credit narration

## Purpose

Approved credit wording must use the same governed production path as manuscript narration. Storyteller Studio does not expose a separate text-to-speech shortcut for opening or closing credits.

The preparation layer derives one immutable bundle containing:

- approved credit script;
- deterministic production job;
- exact private generation material;
- approved production calibration binding;
- rights and cost posture;
- immutable preparation fingerprint.

## Approved-script boundary

Preparation accepts only a fully approved credit script with a valid review and final confirmation chain.

The private preparation record retains the complete approved script so persisted validation can recheck:

- exact text and text hash;
- policy and metadata fingerprints;
- editorial and rights reviews;
- approval fingerprint;
- script revision and status.

Normal public and audit surfaces expose only the script identifier, revision, text hash and word count.

## Deterministic credit segment

The generation segment identifier is derived from:

- script identifier;
- script revision;
- exact text hash;
- credit kind.

A changed script therefore becomes a different immutable generation intent rather than silently reusing an earlier job.

## Calibrated production lock

Credit production requires an approved production calibration lock for the same project. The resulting job has exactly one provider route: the provider approved by that lock.

The material voice profile and revision must match the calibration lock. The mode is always `production`.

Provider, model, calibration-session and selected-take identities stay private.

## Exact worker material

The material store receives the exact approved script text and its immutable source hash. It also records:

- performance direction;
- canonical pronunciations;
- WAV, FLAC or MP3 output intent;
- sample rate;
- current rights evidence;
- audiobook and commercial-use posture;
- optional cost ceiling.

The credit preparation record never mutates the script or inserts provider prompts into spoken text.

## Deterministic cache key

The cache key covers:

- approved script and approval fingerprints;
- calibration lock fingerprint;
- candidate count;
- performance direction;
- pronunciation decisions;
- rights and cost policy;
- output format and sample rate.

Any material production change produces a new cache key.

## Durable preparation

Preparation writes three idempotent records:

1. exact generation material;
2. production calibration binding;
3. book-credit generation plan.

Validation occurs before persistence. A retry after a partial file-store interruption can safely converge on the same records because every store is idempotent for identical intent and rejects conflicting reuse.

Production database implementations should persist these records transactionally.

## Privacy boundary

Public projections omit:

- credit text;
- policy metadata and review details;
- provider and model identity;
- calibration session and take references;
- rights-record identifiers;
- cost ceilings;
- pronunciation details.

Audit events omit spoken text and provider/calibration identities. They retain safe job, segment, candidate-count and script-hash evidence.

## Current boundary

A prepared credit job is ready for the existing private queue and calibrated worker. Preparation does not synthesise, choose, master or approve credit audio.
