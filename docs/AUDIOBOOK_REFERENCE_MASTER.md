# Governed audiobook reference master

The reference-master boundary turns an approved complete-audiobook sequence and its shell-free render evidence into a private, independently measured WAV that can enter whole-book listening review.

It does not treat a successful FFmpeg process as an approved book. Rendering, storage verification, independent engineering, human listening review, retail encoding and release remain separate decisions.

## Evidence graph

The governed graph is:

```text
approved audiobook sequence
  -> immutable sequence-manifest artifact
  -> immutable render-evidence artifact
  -> private audiobook-reference-master WAV
  -> independent post-render audio-analysis artifact
```

Every node is project-, job-, segment- and take-scoped. The reference WAV directly parents the approved sequence and render evidence. The engineering artifact directly parents the exact stored WAV and records the same content hash and byte count.

## Admission

Ingestion revalidates the complete sequence, exact component order, render source snapshots, rendered-byte hash and size, output format, sample rate, channel count, bit depth, rights fingerprint and reviewed engineering-profile fingerprint before artifact admission.

The complete-book bytes must be WAV and remain in private content-addressed storage. A reference master cannot be represented by a transcript, JSON report, provider response or chapter artifact relabelled under a new name.

## Independent engineering

Post-render analysis runs through the existing bounded FFprobe and FFmpeg engineering boundary. The resulting evidence retains tool versions, command fingerprints, probe observations, technical measurements, silence observations, reviewed profile evidence and safe finding codes.

The reference-master comparison also checks expected versus observed complete-book duration, sample rate, channel layout and PCM bit depth. These checks are independent of the renderer's own evidence.

## Quarantine rather than overwrite

A technically ineligible render or a complete-book duration/profile mismatch does not replace or erase evidence. The WAV is quarantined, the analysis artifact remains verified and auditable, and the chain reports the exact safe finding codes.

The approved component masters are never overwritten. Corrective work must create a new governed sequence or render intent rather than mutating the failed reference bytes.

## Human review boundary

An eligible reference master begins with human review pending. Engineering eligibility only permits listening review; it does not approve performance continuity, opening and closing transitions, chapter order, pacing, credits, silence shape or sustained whole-book listenability.

A later review domain must bind an explicit human decision to the exact reference artifact revision before retail encoding can begin.

## Idempotency

Artifact identifiers derive from immutable sequence, render and content evidence. Retrying identical production intent reuses the same content-addressed bytes and the same four artifact envelopes. A changed sequence, render command, output hash or engineering evidence cannot silently redefine an existing identity.

## Privacy boundary

The public projection contains safe status, profile, duration and fingerprint data. It omits private object keys, containers, version locators, executable paths, temporary paths, source component identifiers, parent artifact identifiers, rights evidence, actor identities and raw command details.

Normal web and API runtimes do not receive the ingestion function. The boundary belongs to private production infrastructure and cannot be invoked from a public route.

## Current boundary

This layer creates a governed whole-book listening reference. It is not a released retail audiobook and it is not yet a distributor package.

Still required after reference-master ingestion:

1. dedicated whole-book human listening review and revision history;
2. approved encoding profiles for each distributor target;
3. metadata, cover, chapter-marker and credit verification;
4. encoded-file engineering and exact source-to-encode provenance;
5. release-package assembly, checksum manifest and explicit final confirmation.
