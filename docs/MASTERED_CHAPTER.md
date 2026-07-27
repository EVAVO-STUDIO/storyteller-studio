# Governed mastered chapter evidence

Status: executable foundation 0.2.0  
Scope: preservation-first mastering output, post-master analysis and human-review admission

## Purpose

A successful mastering command is not a mastered audiobook chapter. Storyteller Studio keeps the reviewed pre-master chapter immutable and creates a separate `mastered-chapter` artifact with its own integrity, engineering and review state.

The governed evidence graph is:

```text
approved chapter-master
├─ source audio-analysis
└─ mastering plan
   └─ mastering render evidence
      └─ mastered-chapter WAV
         └─ post-master audio-analysis
```

None of these records is silently replaced by a later record.

## Admission boundary

Mastered-chapter ingestion requires:

- an approved, verified `chapter-master`;
- the exact verified source engineering artifact;
- the exact source engineering evidence fingerprint, hash, byte count and metrics captured by the mastering plan;
- the immutable mastering plan;
- mastering render evidence bound to that plan and source;
- rendered bytes matching the render evidence hash, byte count and WAV profile;
- current audiobook and commercial-use rights;
- a reviewed generation engineering profile matching the mastering plan target profile;
- a reviewed mastered-chapter comparison policy.

A mismatch blocks before a usable mastered artifact is admitted.

## Reviewed comparison policy

The comparison policy is versioned and fingerprinted. It records:

- policy identifier and version;
- review date;
- internal source reference;
- duration tolerance;
- RMS, peak, true-peak and noise-floor tolerances;
- whether transparent gain-only predictions are strict gates.

The normal public projection exposes the policy identifier, version, review date and fingerprint, but not its private source reference.

## Duration evidence

The expected mastered duration comes from the immutable source-duration field in the mastering render evidence. It is never reconstructed from the mastered output itself.

Post-master `ffprobe` duration is compared against that source duration. A drift outside the reviewed tolerance quarantines the mastered chapter.

## Predicted and observed engineering

Post-master analysis is independent of the FFmpeg mastering process. It measures the completed mastered bytes using the governed delivery profile.

For transparent gain-only mastering, observed RMS, peak, true peak and noise floor must remain within the policy tolerances of the mastering plan prediction. Prediction drift is an error.

For high-pass or limiter processing, prediction drift is retained as warning-level review evidence because those operations require measurement rather than blind trust. Final technical profile failures remain errors in all cases.

Missing true-peak observation is an error whenever the approved prediction contains true-peak evidence.

## Artifact chain

Successful ingestion creates four new governed artifacts:

1. mastering-plan JSON evidence;
2. mastering-render JSON evidence;
3. mastered-chapter WAV;
4. post-master audio-analysis JSON evidence.

The mastered WAV parents the approved source master, plan evidence and render evidence. Post-master analysis parents the mastered WAV.

Every artifact is stored privately, content-addressed, integrity-verified and revisioned.

## Quarantine behavior

The mastered WAV is quarantined when:

- post-master engineering fails the delivery profile;
- duration, sample rate or channel layout drifts;
- strict transparent prediction exceeds a reviewed tolerance;
- required true-peak evidence is absent;
- any registered byte, hash, profile or scope check fails.

Engineering evidence remains verified and available for diagnosis. Failure is not erased and is not converted into a low weighted score.

## Human review and release

A technically eligible mastered chapter remains `pending` human review. Review should occur in chapter context and should assess:

- listener fatigue;
- tonal balance and intelligibility;
- audible limiting or pumping;
- noise-floor changes;
- clipped consonants or breaths;
- silence and transition integrity;
- continuity with neighbouring chapters.

Audiobook release requires an approved `mastered-chapter`; an approved pre-master `chapter-master` alone is insufficient.

## Public projection

The public mastered-chapter view exposes bounded status and engineering summaries. It omits:

- source artifact identifiers;
- private object keys and paths;
- rights records;
- worker and verifier identities;
- policy source references;
- FFmpeg command details;
- raw engineering reports.

## Current boundary

This layer governs mastered chapter admission. It does not yet assemble complete-book masters, opening and closing credits, retail encodes, metadata packages or release ZIPs.
