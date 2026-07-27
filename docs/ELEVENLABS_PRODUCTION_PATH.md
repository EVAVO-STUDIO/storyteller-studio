# Governed ElevenLabs Production Path

Storyteller Studio now has an executable end-to-end fixture for the first concrete narration provider. The fixture uses the real worker, queue, material, budget, provider-adapter, private-object and artifact-registry implementations with a deterministic mocked ElevenLabs transport.

It proves system orchestration and governance. It does not claim that a real voice has been approved or that a real provider recording has passed human performance review.

## Proven sequence

The fixture performs this complete sequence:

1. resolve an enabled, isolated worker runtime;
2. create the durable single-host queue state;
3. create the project budget account;
4. persist immutable generation material;
5. enqueue one governed production job;
6. resolve the conditional ElevenLabs adapter;
7. resolve the server-only provider credential;
8. preflight configured models;
9. verify the remote voice category is `premade`;
10. claim the queue item under an exclusive worker lease;
11. reserve the maximum approved provider cost;
12. send the exact manuscript segment to the timestamp endpoint;
13. verify exact character alignment and audio signature;
14. ingest private audio, transcript, word-alignment and execution-report artifacts;
15. settle actual provider cost against the reservation;
16. complete the queue with governed artifact and take identifiers;
17. stop the once-mode worker when the queue is empty.

No normal HTTP route participates in this flow.

## Exact provider request

The fixture inspects the provider request before returning its deterministic response. It verifies:

- output format is `wav_44100`;
- zero-retention logging is requested by query policy;
- the method is `POST`;
- the text exactly equals `Aelwyn waited.`;
- the production model is `eleven_multilingual_v2`;
- the deterministic seed is present;
- emotional objective and subtext are not inserted into spoken text.

This is important because performance direction must influence bounded provider controls without changing the immutable manuscript segment.

## Timestamp and media evidence

The mocked response contains:

- base64-encoded WAV bytes with valid `RIFF` and `WAVE` signatures;
- one character entry for every source character;
- ordered start and end times;
- a private provider request identifier.

The adapter rejects drift before artifact admission. The test therefore exercises the same exact-source and media-signature gates as the production adapter.

The private artifact registry receives four verified artifacts:

- `audio-candidate`;
- `transcript`;
- `word-alignment`;
- `audio-analysis` containing safe execution evidence.

Every artifact remains bound to the project, generation job and manuscript segment.

## Transactional budget proof

The job carries a maximum approved cost policy of `AUD 0.10`. The project account is funded before the worker begins.

The configured production price is represented in integer micro-units per thousand characters. For the exact fourteen-character source segment, the adapter reports an estimated cost of:

```text
AUD 0.001680
```

The worker reserves before provider invocation, then commits exactly `1,680` micro-units after artifact admission and before queue completion.

The reservation becomes terminal and committed. It is not silently released, and the queue completion records the same currency and estimated cost.

## Queue completion evidence

The completed queue record contains:

- one candidate take identifier;
- four governed output artifact references;
- execution-report hash;
- actual estimated cost and currency;
- completion timestamp and fingerprint.

It does not contain:

- manuscript text;
- provider credential;
- raw provider voice identifier;
- provider request identifier;
- private object path;
- lease token or token hash;
- budget reservation identifier.

## Redacted operational result

The worker runtime result is checked against manuscript, credential, voice, provider-request and private-storage values. None may appear in the serialised operational result.

The result reports only safe aggregate facts such as:

- stopped or failed state;
- provider count;
- claimed and completed job counts;
- blocked or retrying counts;
- redacted lifecycle state.

## What the fixture does not prove

The test transport is deterministic and local. It does not prove:

- current real-provider availability;
- current commercial pricing;
- real network latency or rate limits;
- subjective narrator quality;
- character differentiation quality;
- emotional truth or long-form fatigue;
- independent speech-to-text fidelity;
- loudness, noise-floor, clipping or mastering compliance;
- approval of a particular premade voice for a particular book;
- release readiness.

Those remain separate evidence gates.

## Required next evidence

Before a real production release, Storyteller Studio still needs:

1. a reviewed and unexpired real pricing snapshot;
2. documented commercial rights for the selected premade voice;
3. successful real model and voice preflight;
4. calibration passages covering quiet prose, dialogue, long syntax and dramatic pressure;
5. human approval of narrator relationship, rhythm, restraint and character separation;
6. independent transcript alignment rather than relying only on provider alignment;
7. FFmpeg and `ffprobe` engineering analysis;
8. waveform and transcript review in the studio UI;
9. chapter assembly, room continuity and mastering;
10. explicit final release confirmation.

A technically completed provider job is therefore a verified candidate set, not a finished audiobook chapter.
