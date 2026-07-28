# Shell-free complete audiobook rendering

The complete audiobook renderer creates an optional lossless reference WAV from an approved `AudiobookSequence`. It reuses the verified shell-free FFmpeg runner and never treats the render as a released retail package.

## Exact source order

Sources are resolved in manifest order:

1. opening credit master;
2. every mastered chapter in the approved chapter sequence;
3. closing credit master.

The filter graph uses one audio-only concat operation. It does not invent silence, fades, loudness processing or hidden format conversion.

## Private-source verification

Before FFmpeg is invoked, every resolved private source must match the manifest's:

- artifact identifier;
- content hash;
- byte count.

Private paths are never retained in evidence or public views. Every resolved source is disposed on success, validation failure, abort or runner failure.

## RIFF capacity boundary

Classic RIFF/WAV uses 32-bit chunk sizes. The renderer therefore calculates a conservative PCM byte estimate from duration, sample rate, channels and bit depth before resolving private media.

A sequence that cannot fit within the classic RIFF limit is blocked with `AUDIOBOOK_RENDER_RIFF_CAPACITY_EXCEEDED`. It is not silently truncated, wrapped incorrectly or presented as renderable.

Longer books remain valid governed sequences and proceed through chapterised retail encoding. RF64 support would require a separate reviewed output profile and explicit media validation.

## Evidence

Successful evidence records:

- exact sequence revision and fingerprint;
- ordered source snapshots;
- expected duration and conservative PCM size estimate;
- WAV output integrity and media signature;
- FFmpeg version fingerprint;
- filter and command fingerprints;
- render time.

## Privacy boundary

The public view omits private paths, source artifact identifiers, source hashes and storage references. No normal API or browser runtime can invoke the renderer.

## Current boundary

A successful reference WAV is not a retail audiobook, release package or download. Retail chapter encoding, metadata, chapter markers, independent post-render analysis and final human approval remain separate governed stages.
