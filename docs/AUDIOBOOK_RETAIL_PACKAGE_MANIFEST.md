# Governed audiobook retail package manifest

The retail package manifest is the immutable planning boundary between approved media and package assembly.

It does not copy files, create a directory, write a distributor manifest, upload media, release an artifact or claim retailer acceptance.

## Admission chain

A manifest can be created only from:

```text
ready retail track plan
  -> approved complete-track playback review
  -> exact approved retail track artifact revisions

approved retail sample plan
  -> approved post-render sample playback review
  -> exact approved retail sample artifact revision

current matching retail policy and commercial audiobook rights
  -> immutable package manifest
```

Every approved media artifact must remain verified, approved, non-quarantined and unreleased. Rights are rechecked at manifest creation time.

## Exact media set

The media list contains:

1. the opening-credit MP3;
2. every approved narrative MP3 in track-plan order;
3. the closing-credit MP3;
4. `RetailSample.mp3` as the final media file.

The manifest rejects:

- a missing track;
- an extra track;
- a reordered artifact array;
- a substituted artifact revision;
- duplicate filenames;
- duplicate artifact identifiers;
- a sample placed among audiobook tracks;
- a missing opening or closing credit;
- non-ASCII-safe MP3 filenames;
- another project, book, plan, review session or policy;
- expired rights or policy evidence;
- creation before any required approval.

## Approved artifact snapshots

Each media entry binds:

- immutable ordinal;
- media kind and audiobook role;
- safe filename;
- expected and observed duration;
- approved artifact identifier and revision;
- approved artifact fingerprint;
- SHA-256 content hash;
- byte count;
- human-review fingerprint;
- source relationship fingerprint.

An approved artifact must be exactly one revision after the verified pending-review snapshot captured by its review session. Its previous fingerprint must match that snapshot, and its final fingerprint and review fingerprint must match the session approval.

## Policy and rights

The track plan and sample plan must carry the same:

- distributor;
- policy identifier;
- external policy version;
- policy review date;
- policy expiry;
- policy fingerprint.

All media artifacts must share one rights fingerprint and continue to permit commercial audiobook use. A manifest cannot be created at or after policy or rights expiry.

This preserves the repository’s rule that distributor requirements are versioned external evidence rather than permanent hard-coded facts.

## Immutable aggregates

The manifest recomputes and stores:

- audiobook track count;
- total media-file count;
- total observed audiobook-track duration;
- observed sample duration;
- total media bytes.

Structural validation independently recomputes those values from the media list. The sample must be the only final `retail-sample` entry.

## Structural and cross-source validation

The structural validator checks schema, identities, hashes, chronology, file order, role order, uniqueness, durations, aggregate values and the complete manifest fingerprint.

The cross-source validator rebuilds the manifest from the original track plan, approved track review, exact approved track artifacts, sample plan, approved sample review and exact approved sample artifact. A recomputed structurally valid manifest cannot silently point at another source set.

## Persistence and audit privacy

The manifest is immutable at revision one. Its file-backed store supports:

- idempotent create for identical content;
- conflicting identifier rejection;
- integrity-checked reads;
- append-only audit evidence.

The public projection includes safe filenames, media roles, durations, byte counts, aggregate totals, policy version and manifest fingerprint.

Public and audit projections omit:

- artifact identifiers, revisions and hashes;
- review session and approval identities;
- rights identifiers and fingerprint;
- human actor identities;
- source relationship fingerprints;
- private object locations.

Normal web and API runtimes must not receive approved artifact records, manifest creation controls or package-building paths.

## Current boundary

`ready-for-package-build` means the complete approved media set has been frozen into one source-bound manifest.

It does not mean any media has been copied into a delivery directory.

The next layer must resolve every exact approved artifact from private storage, write a deterministic private package directory, generate a canonical `package-manifest.json`, fsync and atomically publish the directory, then emit immutable build evidence. A later independent inspector must reopen every file and recompute every hash before human package review.