# Governed Chapter Rendering

Chapter rendering converts one approved immutable assembly plan into a lossless candidate master. It is a private production operation and is not exposed through the normal web or API runtime.

## Source resolution

Every source audio artifact is resolved through a private `ChapterSourceResolver` immediately before rendering. The resolver must return:

- the exact artifact identifier;
- a private local path;
- independently observed SHA-256 content hash;
- independently observed byte count;
- an explicit cleanup function.

The renderer compares those values with the assembly snapshot before inspecting FFmpeg or creating output. Source mismatch stops the operation. Cleanup runs for every resolved source even when rendering, output validation or cancellation fails.

## Deterministic edit graph

`buildChapterFilterScript` derives the FFmpeg graph only from the approved assembly plan.

The initial graph supports:

- bounded start and end trims;
- reset presentation timestamps;
- bounded fade-in and fade-out;
- deterministic timeline delay;
- explicit digital silence for directed gaps;
- non-overlapping summation;
- fixed output sample rate, channel count and PCM bit depth.

It does not invent crossfades, room tone, compression, equalisation or loudness processing. Those decisions require separate evidence and approval.

## Shell-free bounded execution

`NodeChapterRenderRunner` invokes FFmpeg with an argument array and `shell: false`.

It creates a private temporary directory containing:

- one filter script;
- one lossless output file.

The process uses:

- no stdin;
- bounded timeout;
- bounded process output;
- bounded rendered-file size;
- external abort propagation;
- stable error codes;
- recursive cleanup after completion or failure.

Private source, filter and output paths are never retained in render evidence.

## Render evidence

Successful rendering produces immutable evidence containing:

- assembly plan identifier and fingerprint;
- exact source artifact fingerprints, content hashes and sizes;
- expected chapter duration;
- WAV output profile;
- output content hash, byte count and media signature;
- FFmpeg executable basename and version fingerprint;
- path-redacted filter and command fingerprints;
- render timestamp;
- complete evidence fingerprint.

The public projection omits source artifact identifiers, takes, rights, manuscript hashes, private paths, filter text and raw process output.

## Output validation

A successful process exit is not enough. The output must:

- be non-empty;
- remain under the configured byte ceiling;
- have a recognised RIFF/WAVE media signature;
- match the planned format;
- produce immutable output evidence.

The rendered bytes are still not a released chapter. They must be ingested as a governed `chapter-master` artifact, independently reanalysed, reviewed in context and mastered under a current release profile.

## Current boundary

This slice renders and validates private bytes but does not yet register the chapter master.

The next stage must:

1. ingest the rendered WAV with every approved source artifact as a governed parent;
2. attach the assembly and render evidence fingerprints;
3. analyse the rendered master independently;
4. compare expected and observed duration;
5. detect level, silence, clipping or channel changes introduced by rendering;
6. require human chapter review;
7. create a separate mastering plan rather than modifying the assembly silently;
8. preserve pre-master and post-master evidence;
9. block distributor packaging until the chapter master and release evidence are current.
