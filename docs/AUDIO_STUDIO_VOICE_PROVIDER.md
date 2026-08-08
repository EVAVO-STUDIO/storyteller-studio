# Audio Studio voice provider

Storyteller Studio directs narration. EVAVO Audio Studio owns reusable source intake, narrator consent, voice datasets, exact model installations and local synthesis execution.

The `AudioStudioVoiceAdapter` connects Storyteller's provider-neutral generation engine to the localhost EVAVO Voice Lab service without copying source recordings, model weights, training datasets or engine-specific code into this repository.

## Responsibility boundary

Storyteller Studio owns:

- immutable manuscript revisions and production segments;
- narrator and character casting;
- pronunciation, previous/next context and performance direction;
- candidate counts, idempotency, budgets and provider fallback;
- transcript fidelity, engineering and continuity checks;
- human take approval, chapter assembly, mastering and release.

Audio Studio owns:

- resumable Google Drive, HTTP and local-file ingestion, including files above 100 MB;
- content-addressed original bytes and immutable source identity;
- text, recording and performer-consent evidence;
- reference packs, diarisation, alignment and dataset preparation;
- engine registry, exact local model locks and licence evidence;
- zero-shot, designed-voice, speech-to-speech and adapted/fine-tuned routes;
- local GPU/CPU execution and receipt-bound artifacts;
- optional EVAVO Storage and Cloudflare R2 durability.

A successful Audio Studio render is only a candidate artifact. It is never represented as a reviewed take, mastered chapter or releasable audiobook.

## Worker activation

Audio Studio is disabled unless the private generation worker has all three of these:

1. an explicit enable flag;
2. a loopback Voice Lab URL;
3. a credential binding and at least one validated voice binding.

```text
STORYTELLER_AUDIO_STUDIO_ENABLED=true
STORYTELLER_AUDIO_STUDIO_BASE_URL=http://127.0.0.1:8766
STORYTELLER_WORKER_CREDENTIAL_BINDINGS={"evavo-audio-studio":"EVAVO_VOICE_SERVICE_TOKEN"}
EVAVO_VOICE_SERVICE_TOKEN=<high-entropy-local-token>
STORYTELLER_AUDIO_STUDIO_VOICE_BINDINGS=[...]
```

The binding array is keyed by `voiceProfileId`, `voiceRevision` and optional `projectId`. A project-specific binding takes precedence over a shared binding. Duplicate identities, malformed records, expired/revoked rights, unresolved source rights and missing commercial grants fail at worker startup.

Use [`examples/audio-studio-voice-bindings.example.json`](../examples/audio-studio-voice-bindings.example.json) as the non-secret shape. On PowerShell, load it without placing the JSON in source-controlled environment files:

```powershell
$env:STORYTELLER_AUDIO_STUDIO_VOICE_BINDINGS = Get-Content `
  .\examples\audio-studio-voice-bindings.example.json -Raw
```

## Rights binding

Each executable binding supplies:

- exact voice-source SHA-256;
- text and recording rights bases;
- performer identity and consent basis;
- immutable evidence references;
- allowed operations;
- separate commercial and public-distribution grants;
- manuscript synthesis and commercial-use evidence;
- exact Audio Studio engine key;
- an immutable reference-manifest locator for authorised clones.

The adapter rejects `unknown` text or recording rights. An authorised clone requires `self`, `written_consent` or `contract` performer consent, a reference manifest and evidence. Commercial production additionally requires the `commercial_use` operation plus commercial grants for both the voice source and manuscript.

An audiobook that has merely been purchased or uploaded is not thereby authorised for narrator cloning. Such a source remains analysis-only until its rights record is complete.

## Transport and response hardening

- Worker activation requires plain HTTP on `localhost`, `127.0.0.1` or `::1` only.
- The reusable adapter may support a future remote HTTPS service, but the zero-cost worker route remains local-only.
- Credentials in URLs, URL query strings and fragments are rejected.
- Bearer values are sent only in request headers and are not copied into manifests or provenance.
- Redirects, browser credentials and referrers are disabled.
- JSON envelopes and audio artifacts are streamed through explicit byte ceilings.
- Declared oversized responses fail before download; chunked oversized responses are cancelled while reading.
- Status and artifact URLs must remain on the exact configured origin.
- Job ID, request ID, engine key and engine-lock evidence must correlate.
- Exactly one audio artifact must be unambiguous for a Storyteller candidate.
- Receipt byte count, SHA-256 and content type must match downloaded bytes.
- A service that trains on customer data, omits consent requirements or lacks `local-runtime` capability is rejected.

Default ceilings are 2 MiB per JSON envelope and 256 MiB per candidate audio artifact. They may be reduced or deliberately increased up to the governed absolute limits:

```text
STORYTELLER_AUDIO_STUDIO_MAX_ENVELOPE_BYTES=2097152
STORYTELLER_AUDIO_STUDIO_MAX_ARTIFACT_BYTES=268435456
STORYTELLER_AUDIO_STUDIO_PREFLIGHT_TIMEOUT_MS=15000
STORYTELLER_AUDIO_STUDIO_POLL_INTERVAL_MS=125
STORYTELLER_AUDIO_STUDIO_MAXIMUM_POLL_INTERVAL_MS=1000
STORYTELLER_AUDIO_STUDIO_HEALTH_CACHE_MS=30000
```

These limits apply to one generated candidate, not the original audiobook source. Large source media remains in Audio Studio/EVAVO Storage and never passes through the Storyteller worker or a Vercel/Cloudflare request body.

## Natural performance rather than monotone TTS

Storyteller preserves the complete `PerformanceDirection` with previous and next context. Audio Studio receives:

- scene objective and subtext;
- narrative distance;
- pace, intensity, warmth, restraint and clarity;
- intentional pauses;
- approved pronunciation entries;
- character/voice profile revision;
- candidate index and deterministic identifiers.

The system can therefore compare several governed execution routes instead of assuming one model is universally best:

- designed or licensed stock voices for fast previews;
- zero-shot reference-conditioned synthesis for auditions;
- authorised speaker adaptation or fine-tuning for long-form consistency;
- speech-to-speech/performance transfer when a licensed human guide performance is available;
- human narration imported into the same engineering, assembly and release pipeline.

No model setting can guarantee that output will sound human. Important passages still require multiple candidates, transcript checks, continuity review and blind human listening at scene and chapter scale.

## Runtime sequence

1. Resolve the exact approved Storyteller voice binding.
2. Validate rights, consent, active dates and intended commercial use before network access.
3. Inspect the authenticated Voice Lab capability snapshot.
4. Submit one deterministic `evavo_voice_render_request_v1`.
5. Poll the durable local job until `completed` or `failed`.
6. Verify engine and engine-lock correlation.
7. Stream the exact receipt-bound audio artifact through the byte cap.
8. Verify content type, byte count and SHA-256.
9. Return the candidate through Storyteller's provider-neutral interface.
10. Run transcript, engineering, performance, continuity and human-review gates.

## Failure and fallback

A missing profile binding, credential, local engine lock, rights grant, Voice Lab service, valid response or artifact becomes an ordinary failed provider attempt. Storyteller may try another explicitly configured provider according to the job's fallback list. It never converts a failed or merely generated local candidate into an approved take.

## Release boundary

Successful synthesis does not establish:

- transcript fidelity;
- emotional quality or naturalness;
- character continuity;
- audiobook engineering compliance;
- human listening approval;
- retail delivery compliance;
- public release authority.

Those remain separate, evidence-backed Storyteller transitions.
