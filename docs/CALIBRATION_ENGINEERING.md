# Engineering-Backed Calibration Admission

Storyteller Studio does not permit a calibration candidate to enter human review merely because an audio file exists. The exact take must be backed by one coherent, verified evidence chain.

## Required evidence chain

`admitEngineeringBackedCalibrationCandidate` requires:

1. a verified `audio-candidate` artifact;
2. a verified transcript or transcript-assessment artifact;
3. a verified `audio-analysis` artifact;
4. immutable independent engineering evidence represented by that analysis artifact;
5. one exact project, job, segment and take scope across the chain;
6. direct parent links from transcript and analysis evidence to the audio candidate;
7. matching rights fingerprints;
8. matching candidate artifact references;
9. a passing engineering assessment;
10. monotonic creation and measurement chronology.

Only after those checks succeed does the workflow call `addCalibrationCandidate`.

## Artifact integrity

All supplied artifact records are revalidated through `assertArtifactRecord` before their status or relationships are trusted. A caller cannot alter a fingerprint, verification state, content hash, parent list, rights snapshot or timestamp while retaining a superficially plausible object.

The admission layer also rejects:

- pending, quarantined or rejected artifacts;
- verified artifacts with unresolved error findings;
- the wrong artifact kind;
- a transcript or analysis record from another project, job, segment or take;
- evidence that does not directly parent the selected audio candidate;
- candidate artifact identifiers that do not match the supplied records;
- a voice revision outside the calibration session;
- engineering evidence whose content hash or byte count differs from the audio candidate;
- an analysis artifact whose source hash does not identify the candidate audio;
- a rights snapshot that changes within the evidence chain;
- an ineligible engineering assessment;
- a candidate that already carries unresolved finding codes;
- evidence created before its source or a candidate created before its evidence.

## Technical failure remains evidence

A failed engineering assessment may still be stored as a valid, verified `audio-analysis` artifact. The record proves what was measured and why the take failed.

That distinction is important:

```text
valid evidence artifact != eligible audio candidate
```

The evidence remains inspectable and auditable, but calibration admission stays blocked.

## Redacted operational view

The existing calibration public projection reports aggregate readiness and finding codes only. It does not reveal:

- audio candidate identifiers;
- transcript or analysis artifact identifiers;
- provider or model identity;
- capability fingerprints;
- generation request hashes;
- voice profile identity;
- manuscript text;
- reviewer or approver identity;
- private storage locations.

## Current boundary

This module provides one strict admission API alongside the lower-level `addCalibrationCandidate` domain operation. Existing internal fixtures may still use the lower-level operation while exercising unrelated calibration rules.

Production review services and worker-created calibration candidates must use the engineering-backed admission path. A later cleanup can narrow direct lower-level mutation access further once every internal workflow has migrated.

The next production integration is to make the private generation worker create one independent engineering artifact for every candidate and to block queue completion when required engineering evidence is missing or ineligible.
