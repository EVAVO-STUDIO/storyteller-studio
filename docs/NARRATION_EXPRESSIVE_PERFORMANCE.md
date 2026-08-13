# Expressive narration and character performance

## Purpose

Storyteller treats natural, emotionally truthful narration as a governed production requirement rather than a prompt preference. This boundary sits between approved voice casting/performance direction and synthesis. It makes narrator and character identity, emotional intent, cadence, provider capability and listening-review thresholds explicit and fingerprinted before audio is allowed to continue into the existing chapter monitoring and mastering chain.

The contract does not claim that synthetic speech can be guaranteed to be indistinguishable from a human performance. Instead, production fails closed when the observed result is generic, emotionally flat, repetitive, identity-unstable or audibly synthetic according to the configured evidence and blind listening review.

## Voice roles

Every performed role is an `ExpressiveVoiceRoleBinding` pinned to an exact voice profile ID, revision and profile hash. A role is either the book narrator or a named character.

Character work supports two intentional strategies:

- `dedicated-voice`: the character owns a distinct approved voice identity and cannot silently collapse onto another dedicated character voice;
- `performance-variation`: multiple characters may deliberately share one underlying narrator voice, but every character retains a distinct performance anchor so emotional or stylistic modulation cannot erase who is speaking.

The role binding also pins the engine, source-rights evidence, approval identity and timestamp. Emotion may change from scene to scene. The underlying approved voice identity, engine and performance anchor may not drift without a new governed binding.

Generic/default fallback is permanently disabled at the role layer.

## Expressive performance plan

Each synthesis segment may receive an `ExpressivePerformancePlan` bound to the exact role and the existing `PerformanceDirection`. The plan records:

- primary and optional secondary emotion;
- emotional trajectory and bounded intensity;
- scene-specific subtext intent;
- cadence profile and speaking-rate band;
- phrase-length and pause variation;
- minimum pitch variation and dynamic range;
- maximum repetitive cadence-template similarity;
- maximum repeated sentence-final contour ratio;
- exact role voice and performance anchor;
- mandatory blind comparative review; and
- immutable quality thresholds.

Generic labels such as `neutral`, `natural`, `default` or `read naturally` are rejected because they do not provide actionable performance intent.

Cadence policy also fails closed if phrase and pause variation are effectively flat or if the policy allows excessive cadence/template repetition.

## Provider-neutral synthesis

`buildExpressiveSynthesisRequest` wraps the existing deterministic provider-neutral synthesis request. It preserves all existing source, pronunciation, natural-narration and voice-pin controls, then adds the expressive-plan and role-binding fingerprints to both request metadata and the idempotency key.

The metadata includes a concise style instruction plus structured fields for emotion, subtext, cadence, role identity, performance anchor and the no-fallback rule. Audio Studio already forwards synthesis metadata to its render service, so these instructions travel through the existing provider boundary without creating a Storyteller-specific voice backend.

`assertProviderSupportsExpressivePerformance` requires the provider capability snapshot to advertise `style-instructions` and enough input capacity for the segment. An expressive production route that cannot carry style instructions is not considered capable merely because it can return speech audio.

A future provider may implement the same contract with native controls, prompt/style instructions, speech-to-speech direction or another governed mechanism. The quality decision remains provider-neutral and evidence-based.

## Character ensemble safety

`assertExpressiveRoleEnsemble` validates the whole cast before production:

- all roles belong to one project;
- role IDs are unique;
- character IDs are unique;
- dedicated character voices cannot collapse onto one exact voice identity; and
- character performance anchors cannot collapse across roles.

This gives Storyteller a first-class representation of "this line belongs to this character" without changing the existing narrator retail lineage.

## Review and anti-generic quality gates

`ExpressivePerformanceObservation` records the evidence needed to decide whether a generated take actually delivered the plan. It includes six human listening dimensions:

- naturalness;
- emotional truth;
- cadence;
- role fidelity;
- identity stability; and
- sustained listenability.

It also carries objective/engineering observations for speaking rate, pitch range, dynamic range, cadence-template similarity, sentence-final contour repetition and unexpected speaker changes.

Production approval requires at least three distinct blind reviewers and the following fixed minimum scores:

| Dimension | Minimum |
| --- | ---: |
| Naturalness | 4.25 / 5 |
| Emotional truth | 4.25 / 5 |
| Cadence | 4.20 / 5 |
| Role fidelity | 4.25 / 5 |
| Identity stability | 4.50 / 5 |
| Sustained listenability | 4.25 / 5 |

In addition, the observed cadence must remain inside the planned speaking-rate band, pitch/dynamic variation must meet the plan, repetitive cadence/contours must remain below the plan limits, and there must be zero unexpected speaker changes.

Any fallback voice, generic-delivery flag or synthetic-artifact flag forces `requires-regeneration`. High subjective scores cannot override those fail-closed conditions.

The approved outcome is intentionally named `approved-for-chapter-monitoring`. It is not title approval, mastering approval, release approval or publication authority. The existing narrator chapter monitor still independently checks transcript fidelity, identity continuity, cadence-template repetition, sentence-final contour repetition, room tone, seams and other book-level objective evidence.

## Naturalness without false guarantees

The system never encodes a claim that generated speech is "never AI sounding". That is not a property software can truthfully guarantee across every text, voice and engine.

Instead it encodes the operational requirement the product actually needs:

1. provide specific emotional and subtext direction;
2. require varied, scene-appropriate cadence rather than a flat template;
3. preserve exact narrator/character identity;
4. require providers capable of carrying expressive direction;
5. generate multiple candidates;
6. use blind comparative listening review;
7. measure repetitive cadence and synthetic artefacts; and
8. regenerate rather than ship a take that sounds generic, synthetic, emotionally false or tiring.

This makes "human-quality" an evidence-backed acceptance process instead of a marketing assertion.

## Authority boundary

Expressive role bindings, plans and reviews permanently grant no title-release or publication authority. They do not bypass narrator casting, profile admission, chapter monitoring, mastering, retail review or publication verification.

The boundary also does not authorize cloning, training or commercial use. Existing Audio Studio rights and consent controls remain authoritative for every voice profile used by a role.
