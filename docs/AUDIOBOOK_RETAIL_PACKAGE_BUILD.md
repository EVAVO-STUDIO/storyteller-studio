# Governed audiobook retail package build

The retail package builder materialises one approved package manifest into a private directory containing the exact approved MP3 files and one canonical machine-readable manifest.

It does not release, upload, submit, publish or claim retailer acceptance.

## Admission boundary

The builder accepts only an immutable `AudiobookRetailPackageManifest` whose status is:

```text
ready-for-package-build
```

That manifest already binds:

- the exact approved opening credit;
- every exact approved narrative track;
- the exact approved closing credit;
- the exact approved retail sample;
- their approved artifact revisions and fingerprints;
- the current distributor policy;
- the commercial audiobook rights fingerprint;
- the track and sample human-review approvals.

The package builder does not choose files or repair an incomplete manifest.

## Private source resolution

Approved artifacts are resolved through a private media resolver. Every resolved source must match the package manifest on:

- artifact identifier;
- artifact revision;
- artifact fingerprint;
- human-review fingerprint;
- SHA-256 content hash;
- immutable byte count.

The resolver returns a private absolute path only to the builder. That path is not stored in build evidence or public projections and is disposed on every success and failure path.

## Filesystem controls

The builder is shell-free and uses only bounded filesystem operations.

It creates:

```text
private root/
  staging/
  packages/
    retail_package_<fingerprint>/
      0001OpeningCredits.mp3
      ...
      000NClosingCredits.mp3
      RetailSample.mp3
      package-manifest.json
```

Controls include:

- path-containment checks;
- ASCII-safe governed filenames;
- no subdirectories inside a package;
- regular-file-only admission;
- symbolic-link rejection;
- exclusive private manifest creation;
- directory mode `0700`;
- media and manifest mode `0600`;
- bounded per-package media bytes;
- temporary staging directories;
- atomic directory promotion;
- deterministic content-addressed package identity.

## Copy verification

Every source MP3 is independently reopened before copying. The builder verifies:

- MPEG audio signature;
- `audio/mpeg` media type;
- MP3 format;
- SHA-256 content hash;
- byte count.

Every copied output is then reopened and checked against both the private source and the immutable package manifest snapshot.

A file that changes while being read, is replaced by another media type, is truncated or is substituted with another approved-looking artifact is rejected.

## Canonical package manifest

The private `package-manifest.json` records the exact package identity and exact file order, including:

- package, project and book scope;
- distributor;
- source package-manifest identity and fingerprint;
- file ordinals, roles and names;
- expected and observed durations;
- immutable content hashes and byte counts;
- source artifact and review fingerprints;
- package creation time;
- its own immutable fingerprint.

The JSON file is private production evidence. It is not a retailer metadata file and is not uploaded by this stage.

## Idempotency and collision handling

The final directory name is derived from the approved package manifest and exact file evidence.

A retry with identical approved inputs reuses the same final directory only after reopening and revalidating every entry and the canonical manifest. A changed or unexpected file prevents reuse.

The builder never silently overwrites an existing package directory.

## Output boundary

Successful build evidence ends at:

```text
ready-for-independent-inspection
```

The safe projection exposes file names, roles, durations, byte counts and aggregate state. It omits:

- private package and source paths;
- project identity;
- rights identity;
- source artifact identifiers;
- source and output hashes;
- review fingerprints;
- canonical manifest contents.

The next stage must independently reopen the private package directory, reject unexpected entries, recompute all hashes and verify the canonical manifest before any final human package review or release decision.