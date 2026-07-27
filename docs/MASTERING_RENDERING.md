# Governed Mastering Rendering

Mastering rendering executes an approved preservation-first mastering plan against the exact approved chapter master. It is a private production operation and is not exposed through the normal browser or HTTP API.

## Reused execution boundary

The mastering renderer composes over the already verified `NodeChapterRenderRunner` rather than maintaining a second process-control implementation. The shared runner provides:

- shell-free FFmpeg execution;
- bounded process output;
- bounded execution time;
- abort propagation;
- private filter-script files;
- private temporary WAV output;
- guaranteed temporary-directory cleanup;
- explicit sample rate, channel count and PCM bit depth.

## Source admission

Before resolving private bytes, the renderer revalidates the complete mastering plan and the exact source engineering evidence.

The evidence must match:

- the plan’s engineering-evidence fingerprint;
- the chapter-master content hash;
- the chapter-master byte count;
- the immutable source metrics stored by the plan.

The private source resolver must then return the exact artifact identity, content hash and byte count stored in the plan. A resolved source is owned immediately and disposed even when validation fails.

## Deterministic filters

Operations are translated in plan order.

### High-pass

The initial mapping uses one or more FFmpeg high-pass sections:

- 6 dB/octave: one one-pole section;
- 12 dB/octave: one two-pole section;
- 18 dB/octave: one one-pole plus one two-pole section;
- 24 dB/octave: two two-pole sections.

### Gain

Gain uses the explicit approved decibel value with double-precision processing.

### True-peak limiter

The limiter path oversamples to 192 kHz, applies the approved ceiling with automatic level compensation disabled, restores the approved output rate and uses latency compensation.

The renderer calculates required limiter reduction from the measured pre-master peak and any approved gain. It blocks when that reduction exceeds the plan’s maximum.

A high-pass filter followed by a limiter is blocked with `MASTERING_RENDER_LIMITER_REDUCTION_REQUIRES_INTERMEDIATE_MEASUREMENT`. The high-pass can change peak structure, so the renderer does not pretend the later limiter reduction can be bounded without measuring the intermediate result.

## Immutable evidence

Successful rendering records:

- plan identity and fingerprint;
- exact source artifact snapshot;
- source engineering fingerprint and duration;
- lossless output profile;
- output content hash, byte count and WAV signature;
- ordered operation kinds;
- operation, prediction, filter and command fingerprints;
- safe FFmpeg executable name and version fingerprint;
- render time and one canonical evidence fingerprint.

Raw filters, private paths, source identifiers and tool output are omitted from the public projection.

## Failure posture

The renderer fails closed for:

- stale or altered engineering evidence;
- private-source scope or integrity drift;
- unsupported output media;
- excessive limiter reduction;
- limiter reduction that needs intermediate measurement;
- timeout, abort or process failure;
- malformed or tampered render evidence.

Provider, source and process error messages are not copied into stable operational findings.

## Current boundary

Rendering creates mastered WAV bytes and immutable render evidence. It does not yet register a mastered artifact, perform independent post-master analysis, compare predicted and observed metrics, request human mastering approval or build a release package.
