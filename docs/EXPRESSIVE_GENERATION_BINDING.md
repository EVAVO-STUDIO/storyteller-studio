# Expressive generation binding

Storyteller production now binds an approved expressive narrator or character performance directly into the persisted generation material and the worker request that reaches a voice provider.

## Production rule

A production job routed through `evavo-audio-studio` is rejected unless it carries all of the following as one fingerprinted binding:

- the exact approved narrator or character role;
- the exact pinned voice profile ID, revision and profile hash;
- the segment-scoped expressive performance plan;
- specific emotional intent and subtext;
- cadence, speaking-rate, pitch-range and dynamic-range requirements;
- an explicit prohibition on generic/default fallback voices.

Preview and calibration jobs may omit the binding. Production Audio Studio work may not.

## Worker behaviour

The normal generation material store preserves the binding privately and exposes only non-identifying fingerprints and role classifications in its public view. The generation worker uses `buildExpressiveSynthesisRequest` whenever the binding is present. It no longer silently falls back to the plain synthesis request path.

Before synthesis, the provider execution layer verifies that an expressive request is pinned to a voice-profile hash and that the selected provider advertises `style-instructions`. A provider that cannot satisfy this requirement is skipped before it receives manuscript text.

## Audio Studio contract

The Audio Studio render envelope receives:

- the exact voice-profile hash;
- a structured expressive-performance directive;
- the role and plan fingerprints;
- the emotional trajectory and subtext;
- the complete cadence envelope;
- the provider-neutral style instruction.

For expressive output, the Audio Studio artifact receipt must prove that the expected voice profile, role binding, performance plan and performance anchor were applied. It must also state that style instructions were applied and that no generic fallback voice was used. Missing or mismatched evidence blocks the take.

These gates approve neither a take nor a publication. Generated candidates still require the existing expressive review, chapter monitoring, whole-book review, mastering and release authorities.
