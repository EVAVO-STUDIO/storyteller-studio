# Governed Chapter Assembly

Storyteller Studio treats chapter assembly as an immutable editorial decision record, not as a loose playlist and not as an automatic concatenation of provider files.

## Admission boundary

A take can enter a chapter assembly plan only when the complete evidence chain is valid:

- the audio candidate is verified;
- at least two objectively eligible takes were compared through a governed narration take-review session;
- the exact selected take has matched-panel blind editorial and engineering review;
- the selected take is top-rated or tied under the current review set;
- the audio candidate is the exact approved artifact revision created by that session;
- its transcript artifact is verified and directly parents the audio candidate;
- its independent `audio-analysis` artifact is verified and directly parents the same audio candidate;
- the engineering evidence is eligible under its reviewed delivery profile;
- the transcript artifact, engineering artifact and engineering-evidence fingerprint are the exact chain stored for the selected take;
- project, job, segment and take scope match;
- generation-request hashes match;
- manuscript-source binding matches;
- engineering content hash and byte count match the audio candidate;
- rights fingerprints match and remain usable;
- audiobook and commercial use are approved.

A provider result, filename, single-candidate approval, stale review set or calibration selection cannot bypass this boundary.

## Immutable edit decisions

Every chapter segment records:

- exact source ordering and source offsets;
- selected take and artifact revisions;
- narration take-review session, selection, approval and performance-context fingerprints;
- content hashes and byte counts;
- transcript and engineering artifact revisions;
- engineering evidence and profile fingerprints;
- generation-request hash;
- rights fingerprint;
- source duration;
- start and end trims;
- fade-in and fade-out duration;
- directed gap before and after;
- deterministic timeline start and end;
- segment fingerprint.

The chapter plan records the output format, sample rate, channel count and bit depth. The first profile supports lossless WAV assembly only. It does not silently resample or change channel layout while planning.

## Timeline policy

The first assembly model uses non-overlapping segments and explicit gaps. It does not introduce crossfades between spoken takes, synthetic room tone or automatic silence removal.

This restraint is deliberate. Long-form narration depends on breath, phrase endings, paragraph shape and chapter rhythm. An automatic editor must not trim those decisions merely because a waveform appears quiet.

Each plan has bounded trim, fade and gap limits. Trims cannot consume a take. Fades cannot exceed the remaining rendered duration. Source ranges must be ordered and cannot overlap. Segment ordinals are contiguous.

## Continuity and duplication controls

A plan rejects:

- repeated manuscript segments;
- repeated takes;
- repeated audio artifacts;
- missing, stale or mismatched narration take-review decisions;
- out-of-order or overlapping source ranges;
- engineering evidence from another take;
- transcript evidence from another take;
- mismatched rights or generation intent;
- expired rights or required deletion dates;
- sample-rate or channel drift;
- tampered artifact, evidence, segment, policy or plan fingerprints.

The private plan preserves the exact artifact graph. The public projection reports only safe chapter-level counts, duration, output profile, policy version and fingerprint.

## Current boundary

This slice creates a validated assembly plan. It does not yet render a chapter master.

The next production stage must:

1. resolve each private audio object by its immutable artifact reference;
2. re-check artifact revisions and hashes immediately before rendering;
3. create a shell-free bounded FFmpeg render job from the approved plan;
4. retain the exact filter and edit manifest without private paths;
5. ingest the lossless chapter master as a governed artifact;
6. independently analyse the rendered master;
7. compare source-candidate and master evidence;
8. require human chapter review before mastering or release;
9. keep room tone and any repair assets as explicit governed parents;
10. prevent release until a current distributor profile and final human confirmation are present.
