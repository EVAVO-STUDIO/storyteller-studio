# Governed audiobook retail sample admission

The retail sample admission boundary converts a rendered preview into durable private evidence. It independently engineers the actual MP3 before the sample can enter human playback review.

It does not approve the listening experience, add the sample to a release package, upload it or claim retailer acceptance.

## Evidence graph

A successful admission creates this exact graph:

```text
approved narrative retail MP3
  -> retail sample plan manifest
     -> sample render evidence
        -> private audiobook-retail-sample MP3
           -> independent audio-engineering evidence
```

The approved narrative track remains a parent of the plan, render and sample records. The sample MP3 is never treated as source narration and never replaces its approved parent.

For one sample, four new private artifact records are created:

1. immutable sample-plan JSON evidence;
2. immutable sample-render JSON evidence;
3. the content-addressed `audiobook-retail-sample` MP3;
4. independent engineering JSON evidence for that MP3.

Repeated execution with identical inputs is idempotent.

## Admission requirements

Before any object is written, the coordinator revalidates:

- the complete sample plan;
- the complete sample render result and returned bytes;
- render-to-plan source and range binding;
- the exact approved narrative artifact identifier, revision and fingerprint;
- the approved artifact content hash and byte count;
- the original-to-approved revision link;
- the human review fingerprint recorded by the plan;
- verified, approved and non-quarantined source state;
- current audiobook and commercial rights;
- an engineering policy compatible with the planned sample rate and bit rate;
- cancellation state.

A stale source revision, altered MP3 byte, recomputed render, expired right or another project’s source fails before partial admission.

## Independent engineering

The rendered MP3 is reopened through the existing FFprobe and FFmpeg engineering boundary. The evidence measures:

- format and codec;
- duration;
- sample rate;
- channel count;
- observed bit rate;
- RMS;
- peak and true peak;
- noise floor;
- clipped and peak samples;
- leading and trailing silence;
- policy eligibility.

The coordinator independently compares measured duration, codec, sample rate, channels and bit rate with the sample plan. A small bounded bit-rate tolerance handles container reporting without accepting a materially different encode.

The reviewed delivery profile remains versioned and external-policy-aware. The coordinator does not hard-code engineering measurements as permanent retailer truth.

## Quarantine without evidence loss

A failed sample is retained rather than deleted or silently replaced.

When engineering or range comparison fails:

- the sample MP3 is quarantined;
- its plan and render evidence remain verified;
- its independent engineering artifact remains verified;
- safe finding codes remain attached to the chain;
- `eligibleForReview` is false;
- no artifact review can approve the quarantined MP3.

A clean sample remains verified with artifact review status `pending`. It is not automatically approved.

## Immutable relationships

The chain fingerprint covers:

- plan and render evidence envelopes;
- approved source identity and rights fingerprint;
- sample artifact envelope;
- engineering artifact and evidence fingerprint;
- engineering profile version;
- expected and observed durations;
- eligibility and finding codes;
- chronology.

Structural validation checks every envelope and parent edge. A separate cross-source validator compares the chain with the original plan, render result, approved source artifact and engineering policy.

Recomputing a structurally valid fingerprint around another plan identifier cannot replace the approved source chain.

## Privacy boundary

The safe projection exposes:

- sample and book identifiers;
- plan identifier;
- fixed `RetailSample.mp3` filename;
- expected and observed durations;
- duration drift;
- verification and review states;
- engineering profile identifier and version;
- engineering and review eligibility;
- safe finding codes;
- chain fingerprint.

It omits:

- private object keys and paths;
- source, sample and engineering artifact identifiers;
- source and output content hashes;
- source review and rights identifiers;
- actor and verifier identities;
- FFmpeg command and filter fingerprints;
- raw engineering output.

Normal API and web runtimes must not receive the private object store, artifact registry, rendered bytes or admission coordinator.

## Current boundary

`eligibleForReview` means only that the exact rendered MP3:

- passed private storage and integrity verification;
- passed independent engineering;
- matches the approved sample range and output profile;
- retains current commercial audiobook rights.

It does not mean the public preview has been listened to after rendering.

The next governed layer must require an independent human to play the complete rendered sample, confirm natural beginning and ending boundaries, content continuity, clarity, absence of encoding defects and continued retail suitability, then approve the exact sample artifact revision.