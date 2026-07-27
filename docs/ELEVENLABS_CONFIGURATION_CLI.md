# Offline ElevenLabs Configuration CLI

Storyteller Studio provides two provider-configuration commands that run without a provider credential and without network access:

```text
elevenlabs-pricing
elevenlabs-validate
```

They exist to prevent operators from hand-calculating pricing fingerprints or learning about malformed provider policy only after a production worker starts.

## Pricing snapshots

Create one immutable pricing record with:

```powershell
npm run storyteller -- elevenlabs-pricing `
  --model eleven_multilingual_v2 `
  --currency AUD `
  --micros-per-thousand 120000 `
  --effective-from 2026-07-01T00:00:00.000Z `
  --expires-at 2026-08-31T00:00:00.000Z `
  --source-reference elevenlabs-pricing-2026-07 `
  --output pricing.json
```

The command validates:

- a supported model identifier;
- a three-letter uppercase currency;
- positive integer micro-units per thousand characters;
- parseable effective and expiry timestamps;
- expiry after effective time;
- a bounded source reference.

It returns the canonical pricing record and its SHA-256 fingerprint. The fingerprint covers every pricing field. Changing the model, currency, rate, effective window or source reference changes the fingerprint.

Pricing is intentionally expiring evidence. A valid historical snapshot is not automatically valid for a later production date.

## Complete configuration validation

Validate an assembled provider configuration with:

```powershell
npm run storyteller -- elevenlabs-validate `
  --input elevenlabs.json `
  --validation-at 2026-07-27T00:00:00.000Z `
  --output elevenlabs-summary.json
```

The configuration document contains the same non-secret records used by the dedicated worker:

- adapter version;
- preview, calibration and production model policies;
- pricing snapshots created by `elevenlabs-pricing`;
- premade voice bindings and exact internal revisions;
- optional pronunciation dictionary bindings;
- retention and training policy evidence;
- text-normalisation policy;
- output bitrate;
- bounded response and preflight limits;
- explicit v3 production approval state.

Validation constructs the real `ElevenLabsNarrationAdapter` with a network-prohibited transport. It therefore exercises the production constructor and all local governance checks without reading an API key, contacting ElevenLabs or synthesising audio.

## Redacted summary

Successful validation returns a safe summary containing:

- provider and adapter version;
- validation time;
- model identifiers, modes and input limits;
- pricing currencies, effective windows, expiry windows and fingerprints;
- voice-binding and dictionary counts;
- whether every voice binding is premade;
- count of commercially approved voice bindings;
- retention and training posture;
- bounded output controls;
- complete configuration fingerprint.

The summary omits:

- provider voice identifiers;
- internal voice-profile identifiers;
- licence-evidence identifiers;
- pronunciation dictionary and version identifiers;
- pricing source references and raw rates;
- provider credentials and credential-variable names.

The complete configuration fingerprint still changes when any governed private identifier or policy value changes.

## Output safety

Both commands write JSON to standard output unless `--output` is supplied.

An existing output file is not overwritten. Use `--force` only after intentionally reviewing the target path. This prevents a new pricing window or configuration summary from silently replacing approved evidence.

## Failure behaviour

The commands fail closed for:

- missing required flags;
- non-integer pricing rates;
- malformed JSON;
- missing model, voice or data-policy arrays;
- altered or expired pricing fingerprints;
- duplicated or unsupported model policies;
- cloned or generated voice source kinds;
- stale pronunciation revisions;
- unsupported formats, rates or text-normalisation modes;
- unapproved v3 production;
- unsafe response or timeout limits.

The CLI emits bounded error codes. It does not include credentials, provider response bodies or manuscript content because neither command performs provider execution.

## Relationship to worker startup

Offline validation does not enable the worker and does not prove that remote models or voices still exist.

Worker startup adds separate live gates:

1. the worker runtime must be enabled;
2. ElevenLabs must be enabled;
3. the server credential binding must resolve;
4. configured models must remain available;
5. remote model limits must satisfy local policy;
6. every remote voice category must still be `premade`;
7. the project must have budget capacity before any provider invocation.

The CLI removes avoidable local configuration errors before deployment. It does not weaken provider preflight, rights review, budget reservation, artifact verification or human performance approval.
