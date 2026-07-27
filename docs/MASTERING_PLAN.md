# Preservation-First Mastering Plans

Storyteller Studio treats mastering as a governed engineering decision after chapter assembly, rendering, independent post-render measurement and human chapter approval.

Mastering is not a generic enhancement preset. The default decision order remains:

```text
Preserve
→ transparent correction
→ bounded local repair
→ explicit reconstruction
→ reject
```

## Admission boundary

A mastering plan can only reference:

- a verified `chapter-master` artifact;
- an approved human chapter review;
- a verified post-render `audio-analysis` artifact;
- an engineering artifact that directly parents the exact chapter master;
- matching project, chapter, job, take, rights and content hashes;
- an immutable reviewed delivery-profile snapshot.

The plan stores exact artifact revisions, fingerprints, content hashes and byte counts. It also stores the source engineering metrics required to recompute every predicted result after persistence.

## Allowed operations

The initial mastering contract intentionally permits only:

1. a bounded high-pass filter from 20 Hz to 120 Hz;
2. one bounded gain adjustment from -12 dB to +12 dB;
3. one bounded true-peak limiter with no more than 3 dB permitted reduction.

Operations must appear in that order and each operation kind may appear at most once.

The first contract does not silently introduce:

- denoising;
- broadband compression;
- multiband processing;
- automatic equalisation curves;
- widening;
- synthetic room tone;
- silence trimming;
- enhancement presets;
- source reconstruction.

Those require separate evidence and explicit policy before they can enter the production graph.

## Transparent gain proposal

The proposal engine calculates one common bounded gain window across:

- minimum and maximum RMS;
- sample peak;
- true peak;
- noise floor;
- the global ±12 dB operation bound.

The noise floor moves with gain. A chapter cannot be raised into the RMS range by pretending its background noise remains unchanged.

A transparent proposal blocks when:

- no common gain window exists;
- clipped samples require repair;
- sample-rate conversion is required;
- channel conversion is required;
- the predicted result still violates the target profile.

A blocked proposal contains finding codes and no speculative corrective chain.

## Immutable prediction

A mastering plan stores:

- source-master snapshot;
- source-engineering artifact snapshot;
- source engineering metrics;
- source evidence and profile fingerprints;
- target profile;
- ordered operations;
- predicted metrics;
- predicted technical assessment;
- rationale, actor and creation time;
- one canonical fingerprint.

Persisted-plan validation recomputes predicted metrics from the stored source metrics and operations. Recomputing a plan fingerprint around altered source measurements cannot make the altered plan valid.

## Mandatory remeasurement

Predicted eligibility is not mastering approval.

Every plan records `requiresPostRenderMeasurement: true`. The future mastering renderer must produce new bytes, register a separate mastered artifact, rerun independent engineering and compare predicted versus observed measurements.

## Public projection

The public view contains only:

- plan and chapter identifiers;
- target profile identifier and version;
- operation kinds;
- predicted metrics and finding codes;
- prediction eligibility;
- creation time and plan fingerprint.

It omits:

- private artifact identifiers;
- rights evidence;
- content hashes;
- engineering source references;
- actor identity;
- private paths;
- raw process configuration.

## Current boundary

This slice creates and validates mastering decisions. It does not yet execute FFmpeg mastering, register mastered chapter bytes, compare observed post-master evidence or approve a release package.
