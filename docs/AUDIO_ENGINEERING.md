# Independent Audio Engineering Evidence

Storyteller Studio does not allow provider metadata to certify generated audio. Every candidate that progresses toward calibration, chapter assembly or release must be inspected by an independent media toolchain and represented by immutable engineering evidence.

## Trust boundary

The engineering layer accepts a private local audio path only as an execution input. The path is never retained in the evidence record, public projection, command fingerprint, finding or error message.

The evidence is bound to:

- governed SHA-256 content hash;
- governed byte count;
- delivery-profile snapshot;
- external profile version and review date;
- tool versions;
- redacted command fingerprints;
- measured audio properties;
- technical assessment;
- immutable evidence fingerprint.

A provider response, file extension or declared MIME type cannot substitute for this inspection.

## Independent measurements

The first implementation invokes `ffprobe` and `ffmpeg` without a shell.

`ffprobe` supplies structured stream and container evidence:

- format and codec;
- duration;
- sample rate;
- channel count;
- bitrate where meaningful;
- independently observed file size.

`ffmpeg` supplies three separate analyses:

1. `astats` for RMS level, sample peak, local noise floor and peak-count evidence;
2. `loudnorm` in analysis mode for integrated loudness, loudness range and true peak;
3. `silencedetect` for bounded leading and trailing silence intervals.

These measurements remain distinct. Integrated loudness is not silently substituted for the existing RMS delivery requirement, and sample peak is not silently substituted for true peak.

## Shell-free bounded runner

`NodeAudioEngineeringRunner` uses direct process spawning with an argument array and `shell: false`.

Every command has:

- a bounded timeout;
- a combined stdout/stderr byte ceiling;
- external abort support;
- no stdin;
- no command string interpolation;
- a stable error code;
- no raw process output in the evidence record.

A missing executable, timeout, abort, excessive output, non-zero exit or malformed result fails closed.

## Versioned delivery profiles

Distributor requirements can change. Storyteller Studio therefore stores the complete delivery profile with:

- a reviewed external version identifier;
- review timestamp;
- source reference;
- immutable profile fingerprint.

The initial ACX-oriented profile checks:

- RMS range;
- maximum sample peak;
- maximum noise floor;
- sample rate;
- encoded bitrate;
- mono channel count;
- clipping;
- excessive leading or trailing silence.

The lossless production profile remains separate from a compressed distributor delivery profile. Release must re-check the current distributor rules rather than treating a historical profile as permanent truth.

## Integrity and redaction

The probed file size must match the governed byte count. A mismatch blocks the evidence even when the audio measurements otherwise pass.

The evidence stores only:

- tool executable basenames;
- first version lines and their fingerprints;
- redacted command fingerprints;
- parsed measurements;
- stable findings.

It does not store:

- absolute or relative private media paths;
- raw commands;
- raw stdout or stderr;
- provider credentials;
- provider request identifiers;
- manuscript text;
- reviewer identities;
- private object locators.

## Evidence eligibility

`assessTechnicalAudio` remains the canonical delivery-profile assessment. Independent engineering evidence adds byte-integrity validation around that assessment.

An evidence record is eligible only when no error finding remains. Warnings remain visible and reviewable; they are not silently discarded.

Engineering eligibility does not imply:

- transcript fidelity;
- narrator quality;
- emotional truth;
- continuity approval;
- rights approval;
- mastering approval;
- release approval.

Those are separate governed gates.

## Current boundary

This slice creates and verifies independent engineering evidence. It does not yet automatically attach that evidence to an `audio-analysis` artifact or make it a required dependency of calibration and chapter assembly.

The next integration must:

1. analyse bytes after private object promotion;
2. register the immutable evidence as a verified `audio-analysis` artifact;
3. bind it to the exact audio candidate;
4. require a passing analysis dependency before calibration selection;
5. reanalyse chapter masters after assembly and mastering;
6. retain before-and-after mastering evidence;
7. require a current delivery-profile snapshot at release.
