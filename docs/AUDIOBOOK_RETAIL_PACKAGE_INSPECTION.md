# Independent audiobook retail package inspection

Package construction and package inspection are separate trust boundaries.

The builder creates a private directory. The inspector distrusts that result, independently reopens the directory, recomputes all hashes and verifies the canonical manifest before the package can enter final human review.

## Required inputs

Inspection requires:

- the exact governed package-manifest domain record;
- the exact successful package-build evidence;
- the private package directory created for that build;
- an inspection time at or after package construction.

Build evidence must already be in:

```text
ready-for-independent-inspection
```

The private path must be absolute, must identify the exact package ID and must remain under a `packages` directory.

## Directory distrust

The inspector lists the package directory and requires exactly:

- every governed audiobook-track MP3;
- the governed retail-sample MP3;
- `package-manifest.json`.

It rejects:

- missing entries;
- extra entries;
- subdirectories;
- symbolic links;
- non-regular files;
- alternate filenames;
- group-readable or world-readable directories and files.

The directory and all files must remain owner-private.

## Independent media observation

Every MP3 is reopened without trusting builder memory. The inspector independently recomputes:

- SHA-256 content hash;
- byte count;
- MPEG audio signature;
- private permission state.

Observed bytes must match both the build evidence and the original approved artifact snapshot contained in the governed package manifest.

A copied file that is truncated, replaced, mutated or exposed through broader permissions cannot pass.

## Canonical manifest inspection

The inspector reparses the private `package-manifest.json` and verifies:

- schema version;
- exact package, project and book identity;
- exact distributor;
- exact source package-manifest identity and fingerprint;
- exact ordered media-file list;
- exact roles, filenames and durations;
- exact source artifact and review fingerprints;
- exact output hashes and byte counts;
- exact aggregate counts and sizes;
- exact construction timestamp;
- canonical manifest fingerprint;
- canonical file hash and byte count recorded by the builder.

Recomputing a valid fingerprint around a semantically different manifest does not make it acceptable.

## Persisted inspection evidence

A successful inspection creates an immutable revision-one entity:

```text
audiobook-retail-package-inspection
```

The evidence records safe immutable observations and ends at:

```text
ready-for-final-package-review
```

Identical retries are idempotent. Reusing an inspection identifier for different evidence is rejected.

Audit metadata contains aggregate status, file counts, total package bytes and permission booleans only. It does not contain private paths, source artifact identities, rights identifiers, content hashes or canonical manifest contents.

## Public boundary

The public projection exposes:

- book identifier;
- distributor;
- filenames, roles and durations;
- file and package byte counts;
- permission-verification booleans;
- inspection time, revision and fingerprint;
- `ready-for-final-package-review` status.

It omits:

- private package paths;
- project and package identities;
- source build and package-manifest identities;
- source artifact identifiers and fingerprints;
- rights records;
- media and canonical content hashes;
- canonical manifest contents.

## Honest completion boundary

Inspection is not human approval, release, upload, submission or retailer acceptance.

The next stage must require final editorial and engineering review of the exact inspected package, followed by a separate human release decision.