# Governed Chapter Master

A rendered WAV is not a finished or releasable audiobook chapter. Storyteller Studio converts each render into a governed evidence chain and independently analyses the result before it can enter human chapter review.

## Evidence graph

The first chapter-master chain is:

```text
approved assembly plan
→ verified assembly-manifest artifact
→ verified render-evidence artifact
→ verified chapter-master WAV
→ verified post-render audio-analysis artifact
```

This graph scales to long chapters because the assembly manifest contains the exact source-artifact snapshots. The chapter master needs one direct render-evidence parent instead of thousands of flat parent references.

## Pre-ingestion validation

Before any artifact is created, the coordinator revalidates:

- complete assembly-plan integrity;
- complete render-evidence integrity;
- plan identifier and fingerprint;
- expected rendered duration;
- exact ordered source artifact identifiers, fingerprints, hashes and sizes;
- rendered byte hash and byte count;
- output format, sample rate, channel count and bit depth;
- audiobook and commercial rights;
- matching rights fingerprint for every selected take;
- rights expiry and deletion requirements;
- operation cancellation.

A mismatched render or rights snapshot leaves the registry untouched.

## Evidence artifacts

The assembly plan and render evidence are retained as immutable JSON `audio-analysis` artifacts. Their schema checks distinguish them from provider execution evidence and engineering measurements.

The chapter master is stored as a review-required `chapter-master` artifact with:

- private object storage;
- immutable SHA-256 content hash;
- exact byte count and RIFF/WAVE signature;
- assembly and render provenance;
- project, chapter and master-production scope;
- rights snapshot;
- pending human review.

## Post-render engineering

The master bytes are independently analysed again under a reviewed engineering profile. This reanalysis is separate from the source-take evidence because rendering itself can introduce:

- duration drift;
- clipping;
- level changes;
- channel changes;
- sample-rate changes;
- noise or silence changes;
- malformed output.

The coordinator compares observed duration, sample rate and channels with the approved assembly output. The immutable chain stores expected duration, observed duration and absolute drift.

## Quarantine behavior

If post-render engineering or comparison fails:

- the assembly and render evidence remain verified;
- the post-render engineering artifact remains verified and reviewable;
- the chapter master is revised to `quarantined`;
- exact finding codes are retained;
- the master cannot enter human approval or release.

Failed evidence is not deleted or disguised as a transient renderer error.

## Idempotency and privacy

Identical plan, render, rights and engineering evidence reuse the same content-addressed objects and stable artifact identities.

Public chapter-master state reports only:

- plan and master identities;
- safe chapter identity;
- revisions and statuses;
- engineering profile identity and version;
- expected and observed duration;
- duration drift;
- safe finding codes;
- immutable chain fingerprint.

It omits manuscript hashes, rights evidence, source takes, assembly and render artifact identities, actors, tool paths, temporary directories, raw process output and private object locators.

## Current boundary

An eligible chapter master is ready for human chapter review, not release.

The next stage must:

1. provide waveform, transcript and contextual chapter playback;
2. record explicit human chapter approval or requested changes;
3. create a separate mastering plan for approved masters;
4. retain pre-master and post-master evidence;
5. analyse the mastered output under a current distributor profile;
6. validate opening and closing room, chapter naming and metadata;
7. package only explicitly approved chapter masters;
8. require final release confirmation and current rights evidence.
