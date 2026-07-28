# Governed ACX retail track rendering

The retail track renderer converts one approved, lossless audiobook reference master into the exact MP3 files described by a governed ACX track plan.

It is a private production boundary. It does not upload files, create a release package, claim distributor acceptance or replace the approved reference WAV.

## Admission boundary

Rendering requires a structurally valid track plan whose state is `ready-for-encoding`.

A blocked plan is rejected before private source resolution, FFmpeg version inspection or output allocation. This preserves the earlier planning decisions around duration drift, sample-rate conversion and sections that require a governed split.

The private resolver must return the exact approved reference-master snapshot bound into the plan:

- artifact identifier;
- artifact revision;
- artifact fingerprint;
- content hash;
- byte count.

Any mismatch fails before the renderer is invoked. The absolute private path is transient runtime state and is never retained in render evidence or public projections.

## One source resolution

The approved reference master is resolved once for the complete batch.

Tracks are rendered sequentially in plan order. This avoids opening the same private object for every chapter, limits peak memory and preserves deterministic failure position. The resolver is disposed on success, source mismatch, abort, encoder failure, invalid media and output-limit failure.

A disposal failure does not replace the primary render result. Private-source cleanup remains safe to retry through retention maintenance.

## Exact extraction ranges

Every track uses the exact range already approved in the track plan:

- `sourceStartMs`;
- `durationMs`;
- derived `sourceEndMs`.

FFmpeg receives an audio filter equivalent to:

```text
atrim=start=<approved start>:duration=<approved duration>,
asetpts=PTS-STARTPTS,
aformat=sample_rates=44100:channel_layouts=<mono or stereo>
```

The renderer does not infer boundaries, redistribute drift, trim silence, join sections, create secondary headings or alter track order.

The output evidence records the exact range and the fingerprint of the filter used for that track.

## Shell-free FFmpeg execution

The production runner invokes FFmpeg with an argument array and `shell: false`.

Execution is bounded by:

- an abort signal;
- a per-track timeout;
- a process-output limit;
- a per-track encoded-byte limit;
- a complete-batch byte limit;
- a private temporary directory;
- unconditional temporary-directory cleanup.

Raw FFmpeg stderr is not copied into domain errors. Failures become stable governance codes.

## CBR MP3 intent

The renderer uses the approved book-wide output profile:

- MP3 container and codec;
- `libmp3lame` encoder;
- constant bit-rate intent;
- reviewed 192, 256 or 320 kbps bit rate;
- 44.1 kHz sample rate;
- consistent mono or stereo layout.

The command uses the fixed bit-rate option and does not use quality-based VBR options.

Metadata is stripped. ID3v1, ID3v2 and Xing writing are disabled by this first deterministic production profile. File names remain the ASCII-safe semantic names created by the approved plan.

## Preflight output bounds

Before private source resolution, the renderer estimates each track’s maximum CBR payload from:

```text
duration × bit rate ÷ 8 + bounded container overhead
```

A configured per-track ceiling below that estimate fails before source access or FFmpeg work.

Actual output bytes are checked again after every render. The batch stops when either the per-track or total output ceiling is exceeded.

## Media identity

A returned byte array is not accepted merely because the file name ends in `.mp3`.

Every output must be detected as:

- MIME type `audio/mpeg`;
- format `mp3`;
- MPEG audio signature.

A WAV response, text response, empty response or unsupported binary is rejected.

This is container-level admission. Independent FFprobe and FFmpeg analysis remains required before any rendered track can become a release artifact.

## Immutable evidence

The batch evidence binds:

- exact track-plan identifier and fingerprint;
- exact reference-master snapshot;
- exact track order;
- semantic file name;
- role;
- approved source range;
- expected duration;
- approved output profile;
- encoded content hash and byte count;
- media signature;
- filter fingerprint;
- shell-free command fingerprint;
- FFmpeg executable name and version fingerprint;
- render time.

Every track and the complete batch have independent fingerprints.

A result validator rehashes the returned bytes and checks them against the corresponding output evidence. A separate cross-source validator binds the evidence back to the complete approved track plan. Recomputing hashes around a changed source range, track fingerprint or file assignment cannot make the output belong to another plan.

## Privacy boundary

The public view exposes:

- render and plan identifiers;
- plan fingerprint;
- safe file names and semantic roles;
- expected durations;
- approved output settings;
- encoded output hashes and sizes;
- MPEG media signatures;
- tool-version fingerprint;
- batch fingerprint.

It omits:

- private filesystem paths;
- reference artifact identifier and revision;
- reference artifact and content fingerprints;
- exact source start and end offsets;
- source component artifacts;
- review identities;
- narration-authorisation evidence;
- raw FFmpeg commands and diagnostics.

Normal web and API runtimes do not receive the private resolver, runner or render controls.

## Current boundary

A successful result is governed encoded media in memory plus immutable render evidence. It is not yet a verified retail artifact.

The next production layers must:

1. ingest each MP3 into private content-addressed storage;
2. create a distinct governed retail-track artifact record;
3. run FFprobe against every stored MP3;
4. verify codec, constant bit rate, 44.1 kHz and channel consistency;
5. compare observed duration with the approved source range;
6. inspect beginning and ending room tone;
7. reject clipping, excessive peak, RMS or noise-floor drift;
8. retain source-range-to-output provenance;
9. require human playback review of every encoded track and boundary;
10. build a separate sample-selection and explicit-content review;
11. validate metadata, cover art, checksums and package structure;
12. require explicit final release confirmation.

The approved lossless reference master remains immutable throughout this process. Encoded MP3 files are derived distribution artifacts and never become the editorial master.
