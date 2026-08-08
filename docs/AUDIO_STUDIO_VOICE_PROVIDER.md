# Audio Studio voice provider

Storyteller Studio directs narration. Audio Studio owns reusable source intake, narrator consent, local model installations and synthesis execution.

The `AudioStudioVoiceAdapter` connects Storyteller's existing provider-neutral generation engine to the localhost-only EVAVO Voice Lab service without transferring those responsibilities into this repository.

## Boundary

Storyteller continues to own:

- immutable manuscript segmentation;
- narrator and character casting;
- pronunciation and performance direction;
- candidate counts, idempotency and provider fallback;
- transcript fidelity, engineering and continuity checks;
- human take approval, chapter assembly, mastering and release.

Audio Studio owns:

- large source transport and immutable source identity;
- exact text, recording and performer-consent evidence;
- reference packs and dataset preparation;
- engine registry, local installation locks and offline execution;
- generated artifact hashes and source-side provenance.

A successful Audio Studio render is only a candidate artifact. It is never represented as a reviewed take, mastered chapter or releasable audiobook.

## Registration

```ts
import {
  createAudioStudioVoiceAdapter,
  type AudioStudioVoiceBinding,
} from "@evavo/storyteller-engine/audio-studio-adapter";
import { ProviderAdapterRegistry } from "@evavo/storyteller-engine/provider-adapter";

const adapter = createAudioStudioVoiceAdapter({
  baseUrl: process.env.EVAVO_AUDIO_STUDIO_VOICE_URL
    ?? "http://127.0.0.1:8766",
  resolveBinding: async (request): Promise<AudioStudioVoiceBinding> => {
    const approved = await voiceProfileStore.readApprovedAudioStudioBinding(
      request.voiceProfileId,
      request.voiceRevision,
      request.projectId,
    );
    return approved;
  },
});

const providers = new ProviderAdapterRegistry([adapter]);
```

The existing server-side credential resolver should return `EVAVO_AUDIO_STUDIO_VOICE_TOKEN` for provider ID `evavo-audio-studio`. A non-empty local credential remains required by Storyteller's provider execution contract even when the Voice Lab service has been deliberately configured without token enforcement.

## Rights binding

`resolveBinding` is the only place that turns approved Storyteller records into an executable Audio Studio voice binding. It supplies:

- exact voice source SHA-256;
- text and recording rights bases;
- performer identity and consent basis;
- immutable evidence references;
- allowed operations;
- separate commercial and public-distribution grants;
- manuscript synthesis and commercial-use evidence;
- exact Audio Studio engine key and optional reference manifest.

The adapter checks the essential rights fields before making a network request. Audio Studio independently validates the complete rights record again before accepting a job and before executing a locked engine.

## Transport and security

- Plain HTTP is allowed only for `localhost`, `127.0.0.1` or `::1`.
- Remote service URLs require HTTPS.
- Credentials in URLs, URL query strings and URL fragments are rejected.
- Bearer credentials are sent only in request headers and are not copied into render manifests.
- Redirects and cross-origin status or artifact URLs are rejected before credentials can be forwarded.
- Request and poll calls share the Storyteller timeout and abort signal.
- Job IDs and request IDs must correlate before an artifact is accepted.
- Artifact byte count, SHA-256 and audio content type must match the Audio Studio receipt.

## Performance direction

The adapter preserves Storyteller's full `PerformanceDirection` plus `previousContext` and `nextContext` metadata. This is essential for natural long-form delivery: the local engine receives scene objective, subtext, pace, intensity, warmth, restraint, clarity, pauses and approved pronunciations rather than isolated undecorated sentences.

## Runtime sequence

1. Inspect and cache the Audio Studio capability snapshot.
2. Resolve the approved voice and manuscript rights binding.
3. Submit one deterministic `evavo_voice_render_request_v1`.
4. Poll the durable job until `completed` or `failed`.
5. Fetch the exact receipt-bound candidate artifact.
6. Return the bytes and provenance through Storyteller's standard provider adapter.
7. Run the existing candidate take, transcript, engineering, continuity and human-review gates.
