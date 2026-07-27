# Governed ElevenLabs Narration Adapter

The ElevenLabs adapter is the first concrete provider implementation behind Storyteller Studio's provider-neutral narration boundary. It is deliberately narrower than the provider's complete product surface. The first release is designed to prove a rights-safe, reproducible and inspectable long-form narration path before broader voice sources or more variable expressive controls are enabled.

## Current scope

The adapter supports three execution modes with one explicit model policy per mode:

- `preview`;
- `calibration`;
- `production`.

The intended initial policy uses `eleven_v3` for preview and calibration and `eleven_multilingual_v2` for production. Production use of `eleven_v3` remains blocked unless the configuration carries an explicit approval flag.

The supported stored audio outputs are:

- WAV at 44,100 Hz;
- MP3 at 44,100 Hz with a governed bitrate.

FLAC and raw PCM are not admitted by this first adapter. The private object store authenticates container signatures, so headerless PCM requires a separate governed wrapping or conversion stage.

## Premade voice boundary

The initial adapter permits only voice bindings whose source kind is `premade`.

Every binding contains:

- an internal voice-profile identifier;
- the exact approved voice-profile revision;
- a provider-private voice identifier;
- licence-evidence identity;
- approved execution modes;
- explicit commercial-use approval.

Configuration rejects cloned, generated or otherwise non-premade source kinds. Provider preflight also reads the remote voice record and refuses execution when the provider no longer categorises the voice as `premade`.

This double check prevents a locally altered binding from quietly turning a stock-voice workflow into identity cloning.

## Immutable pricing evidence

Prices are not embedded as timeless constants. Each model policy carries a versioned pricing snapshot containing:

- model identifier;
- three-letter currency;
- integer micro-units per thousand characters;
- effective time;
- expiry time;
- source reference;
- immutable fingerprint.

The adapter rejects pricing that is malformed, altered, not yet effective, expired or attached to the wrong model. Estimated provider cost is calculated using integer micro-units and rounded conservatively before it enters Storyteller Studio's transactional budget reservation and settlement boundary.

## Exact manuscript text

The provider request body receives `SynthesisRequest.text` unchanged.

The adapter does not append performance objectives, subtext, notes, creative references or narrator-comparison language to the spoken text. Direction is mapped only into bounded provider settings. This keeps executable provider input aligned with the immutable manuscript segment and prevents internal direction from being spoken accidentally.

The first v3 policy does not inject automatic audio tags. Expressive tags require a separate reviewed transformation contract because they alter provider input and may change how punctuation or literal source text is interpreted.

## Deterministic candidates

Each candidate seed is derived from the governed synthesis idempotency key. That identity already binds:

- the generation job;
- source hash;
- segment;
- voice profile and revision;
- performance direction;
- pronunciation decisions;
- execution mode;
- output format and sample rate;
- candidate index.

A retry of the same production intent therefore retains the same provider seed. A different candidate index remains distinct.

## Pronunciation dictionaries

A pronunciation requiring provider-specific control must match an approved dictionary binding. The binding contains the canonical written term, approved revision, provider-private dictionary identifier and dictionary version.

The adapter rejects:

- a pronunciation with no approved binding;
- a stale pronunciation revision;
- duplicate canonical terms;
- more than three dictionaries on one request.

Dictionary identifiers stay inside worker configuration and provider requests. They are not included in ordinary API or browser projections.

## Provider preflight

Before synthesis, the adapter verifies its credential and inspects configured models and voices.

Preflight confirms:

- every configured model exists and supports text-to-speech;
- a remote model limit has not fallen below the governed local limit;
- every configured voice exists;
- every configured voice is remotely categorised as `premade`;
- the returned capability snapshot matches the adapter identity and version;
- supported format, sample-rate, privacy and feature information is fingerprinted.

The worker cannot claim production work through this adapter until preflight succeeds.

## Privacy and bounded transport

The adapter uses a server-only credential supplied through `ProviderExecutionContext`.

Requests are protected by:

- external cancellation propagation;
- bounded timeouts;
- bounded preflight JSON;
- bounded synthesis JSON;
- bounded decoded audio;
- strict base64 validation;
- sanitised HTTP status errors.

Provider response bodies are never copied into thrown errors. A failed response becomes a bounded code such as `ELEVENLABS_HTTP_429`, not an arbitrary provider message that could contain manuscript or account details.

When the approved data policy is `zero-retention-enterprise`, the request sets provider logging to disabled. This flag is only one part of the declared policy: worker startup still relies on the separately reviewed policy version and configuration evidence.

## Audio and alignment verification

WAV output must contain `RIFF` and `WAVE` signatures. MP3 output must contain an ID3 or valid MPEG frame prefix. A content-type or extension claim cannot override incompatible bytes.

Timestamp responses must contain equal-length character, start-time and end-time arrays. The joined character sequence must exactly equal the immutable request text. Timing must be finite, non-negative and ordered. Word timing is derived only after exact character alignment succeeds.

Transcript drift, punctuation drift, missing final characters, malformed timing and false audio signatures fail before artifact admission.

## Cost and provenance

A successful result records safe execution evidence including:

- input character count;
- output duration;
- provider units;
- estimated cost and currency;
- model and output policy;
- deterministic seed;
- retention and text-normalisation policy;
- direction, voice-binding, pricing and pronunciation fingerprints;
- exact-source preservation evidence;
- alignment source.

Provider request identifiers remain private provenance. Raw credentials and provider voice identifiers are not returned through public worker, queue or artifact views.

## Worker boundary

The adapter is an engine module, not an HTTP feature. The web and API runtimes must not import or instantiate it.

Worker registration remains fail-closed until all of the following are valid:

- adapter configuration;
- premade voice bindings;
- unexpired pricing evidence;
- data-policy evidence;
- provider credential binding;
- provider capability preflight;
- transactional project budget capacity.

The built-in worker registry must remain empty when configuration is absent or invalid. No queue item should be claimed merely because an API key exists.

## Next integration gate

Before enabling the adapter in the dedicated worker runtime, the repository must add:

1. a governed package export;
2. an executable adapter contract checker;
3. fail-closed environment parsing for model, voice, pricing, pronunciation and privacy policy records;
4. conditional worker registration only after complete configuration validation;
5. startup tests for absent, malformed, expired and non-premade configuration;
6. a complete green verification and build run on `main`.
