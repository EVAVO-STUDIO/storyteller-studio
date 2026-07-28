# Governed audiobook retail track admission

The retail track admission boundary converts a verified in-memory MP3 render into durable private artifacts. It does not approve the listening experience, build a release package, upload files or claim retailer acceptance.

## Evidence chain

Every admitted retail file is bound to this exact chain:

```text
approved whole-book reference master
  -> governed retail track plan
  -> shell-free range render evidence
  -> private audiobook-retail-track MP3
  -> independent FFprobe and FFmpeg engineering
  -> quarantine or human-review eligibility
```

The coordinator receives the complete ready track plan, the matching render result, the exact approved reference-master artifact and a reviewed engineering policy. It revalidates all four before any artifact is admitted.

## Durable private artifacts

A successful three-file book creates eight governed artifact records:

1. one immutable retail-track plan manifest;
2. one immutable render-evidence manifest;
3. one private `audiobook-retail-track` MP3 per planned file;
4. one independent audio-engineering artifact per MP3.

The plan and render manifests are stored as private JSON evidence. MP3 bytes are stored content-addressed through the existing private object store. The artifact registry verifies hashes, byte counts and media signatures after promotion.

Repeated execution with identical inputs is idempotent. It does not create duplicate logical artifacts or replace existing bytes.

## Exact source and artifact binding

The coordinator rejects:

- a blocked or partial track plan;
- render evidence from another plan;
- altered rendered bytes;
- another reference-master identifier, revision, fingerprint, content hash or size;
- an unverified, unapproved or quarantined reference master;
- a reference master outside the exact project and book;
- expired, non-commercial or non-audiobook rights;
- an engineering policy whose minimum sample rate or bit rate cannot admit the approved output;
- an aborted operation.

Each MP3 artifact parents both the render evidence and the approved reference master. Each engineering artifact directly parents the MP3 it measured. The source content hash on every MP3 remains the approved reference-master content hash.

## Independent engineering

Every encoded file is reopened through the existing engineering boundary. The evidence independently measures:

- media format and codec;
- duration;
- sample rate;
- channel count;
- observed bit rate;
- RMS level;
- peak and true peak;
- noise floor and clipping;
- leading and trailing silence.

The coordinator also compares the measured duration, codec, sample rate, channels and bit rate against the exact planned file.

A small bit-rate observation tolerance accounts for container reporting while still rejecting a materially different encode. Duration tolerance is bounded and explicit.

## Quarantine without evidence loss

A technically failed file is not deleted and is not silently retried into an approved state.

Instead:

- the MP3 artifact is quarantined;
- its engineering artifact remains verified;
- exact safe finding codes remain on the track chain;
- unaffected files retain their own eligibility;
- the whole chain is not eligible for review until every file passes.

This preserves the failed output and its measurements for diagnosis without making it reviewable or releasable.

## Human-review boundary

An eligible encoded track still has artifact review status `pending`.

`eligibleForReview` means only that:

- private bytes passed storage and integrity verification;
- independent engineering passed;
- planned and observed output relationships match;
- current rights remain valid.

It does not mean the file has been listened to, approved, packaged, released or accepted by ACX or Audible.

The next domain must require complete human playback review of every MP3, including credits, chapter headings, beginnings, endings, transitions, silence and sustained-listening quality.

## Tamper resistance

Track and chain fingerprints cover the complete evidence graph. Structural validation checks every stored envelope, artifact relationship, duration, eligibility state and aggregate count.

Cross-source validation separately compares the chain with the original track plan, render result and approved reference artifact. Recomputing a fingerprint around another valid-looking plan identifier cannot replace the approved source.

## Privacy boundary

The safe projection exposes:

- plan and book identifiers;
- engineering profile version;
- file names, roles and durations;
- verification, review and engineering eligibility states;
- safe finding codes;
- aggregate output bytes;
- chain fingerprint.

It omits:

- private object keys and paths;
- reference-master identity and hashes;
- MP3 artifact identifiers and hashes;
- engineering-artifact identifiers;
- render commands and filter fingerprints;
- worker and verifier identities;
- rights-record identifiers;
- evidence parent identifiers.

Normal web and API runtimes do not receive the coordinator, private bytes, artifact registry or cross-source validator.

## Current boundary

This layer ends at private, independently measured MP3 artifacts that are either quarantined or eligible for human review.

It does not create a retail sample, metadata, cover art, package manifest, delivery directory, upload request or release confirmation. Those remain separate governed stages.