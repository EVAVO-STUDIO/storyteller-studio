# Offline publication operations backup and restore

The publication operations backup CLI creates immutable, integrity-checked snapshots of the private file-backed publication state used by the evidence gateway, refresh worker and alert-delivery worker.

The workflow is deliberately offline. It detects concurrent changes but does not replace stopping mutation roles.

## Commands

Create a snapshot:

```bash
npm run publication-operations-backup -- \
  --data-dir ./storage \
  --backup-dir ./backups \
  --actor-id operator_greg \
  --application-revision "$STORYTELLER_APPLICATION_REVISION" \
  --offline-confirmed \
  --output backup-result.json
```

Verify a snapshot:

```bash
npm run publication-operations-backup-verify -- \
  --snapshot ./backups/publication_backup_... \
  --output verification-result.json
```

Restore a snapshot:

```bash
npm run publication-operations-restore -- \
  --snapshot ./backups/publication_backup_... \
  --data-dir ./restored-storage \
  --actor-id operator_greg \
  --application-revision "$STORYTELLER_APPLICATION_REVISION" \
  --offline-confirmed \
  --output restore-result.json
```

`--data-dir` may come from `STORYTELLER_DATA_DIR`.

Optional deterministic timestamps are available through:

- `--created-at` for backup;
- `--restored-at` for restore.

## Stop mutation roles first

Before backup or restore, stop:

- `publication-refresh`;
- `publication-alerts`;
- `publication-evidence-gateway`;
- any evidence-intake CLI process;
- any other process writing the same publication state.

For the one-host Compose topology:

```bash
docker compose \
  --env-file .env.publication-operations \
  -f compose.publication-operations.yml \
  stop publication-refresh publication-alerts publication-evidence-gateway
```

The CLI requires `--offline-confirmed`. This is an explicit operator assertion that writers have been stopped.

The snapshot engine also rejects active `.lock` files, atomic `.tmp` files and source changes detected between its initial and final scans. Those checks detect unsafe conditions but cannot guarantee quiescence if another writer starts after the operator confirmation.

## Source boundary

The source is always:

```text
<data-dir>/publication-operations
```

The backup directory must not contain the source, and the source must not contain the backup directory.

This prevents recursive snapshots and accidental inclusion of backup data in live publication state.

## Snapshot layout

Each snapshot is a private directory:

```text
<backup-dir>/publication_backup_<24-hex>/
  manifest.json
  data/
    entities/...
    audit/...
```

The snapshot identifier is deterministic for:

- source file-set fingerprint;
- creation time;
- private operator identity.

Repeating an identical backup request returns the already verified snapshot instead of creating a duplicate.

## Manifest

`manifest.json` contains:

- schema version;
- snapshot identifier;
- creation time;
- private operator identifier;
- exact creating application revision;
- durable publication-schema contract version and fingerprint;
- source fingerprint;
- sorted file records;
- file count and total bytes;
- complete manifest fingerprint.

Each file record binds:

- safe relative path;
- byte count;
- SHA-256 content hash;
- private snapshot file mode `0600`.

The manifest is private evidence. It is not included in the redacted command result.

## Safe file handling

Backup and verification reject:

- symbolic links;
- devices, sockets and other special files;
- active `.lock` files;
- incomplete `.tmp` files;
- path traversal or unsafe relative paths;
- malformed or oversized manifests;
- duplicate or unsorted manifest paths;
- missing, extra or changed snapshot files;
- unexpected files beside `manifest.json` and `data/`.

Snapshot directories use mode `0700`. Snapshot files and CLI output files use mode `0600`.

## Copy verification and concurrent-change detection

Backup performs these steps:

1. scan and hash every source file;
2. create the deterministic intended manifest;
3. copy into a private staging directory;
4. reopen and rehash every copied file;
5. rescan and rehash the source;
6. reject if the source file set, bytes, hashes or modes changed;
7. write and verify the manifest;
8. atomically rename the staging directory to the final snapshot identifier.

A failed backup removes its staging directory and does not publish a partial snapshot.

## Snapshot verification

Verification distrusts the backup operation.

It independently checks:

- exact root layout;
- manifest schema and fingerprint;
- sorted unique safe paths;
- expected file modes;
- exact file count and total bytes;
- every file byte count and SHA-256 hash;
- absence of extra files and links.

A snapshot should be verified:

- immediately after creation;
- after transfer to backup storage;
- before restore;
- during scheduled restore rehearsals.

## Restore boundary

Restore verifies the snapshot before copying.

The target publication state must be:

- absent; or
- an existing empty directory.

Restore never overwrites non-empty publication state.

The workflow copies into a sibling staging directory, verifies every restored file, removes an existing empty target when necessary, atomically renames staging into place and verifies the final restored tree again.

Restore does not start publication roles automatically.

## Restore rehearsal

A backup is not operationally proven until it has been restored into an isolated data directory and read successfully by the application stores.

Recommended rehearsal:

1. restore to a new isolated `--data-dir`;
2. run repository integrity and application preflight checks against that directory;
3. inspect monitor, evidence inbox, alert and audit counts;
4. start no external provider calls;
5. remove the isolated rehearsal state after recording the outcome.

Do not rehearse by overwriting the live named volume.

## Docker volume workflow

The current Compose deployment stores live state in the named volume:

```text
storyteller-publication-data
```

The CLI operates on filesystem paths, so a maintenance container must mount:

- the publication data volume at `/var/lib/storyteller`;
- a separate encrypted backup location at a private backup path.

Stop mutation services before running the maintenance container. Do not mount the Docker socket into the worker image.

A later deployment slice may add a dedicated maintenance profile; the current commands remain usable directly on a secured host or one-shot container.

## Encryption and retention

Snapshots contain private publication evidence, audit history, human identifiers, provider receipt hashes and internal operational state.

Store snapshots only on encrypted storage with restricted operator access. Apply a documented retention policy and secure deletion process.

The snapshot format provides integrity, not confidentiality. Hashes and permissions do not replace encryption at rest or secure transport.

## Off-host copies

A backup stored only on the same Docker host is not sufficient disaster recovery.

Maintain at least one encrypted off-host copy. After transfer, run the verification command against the received snapshot rather than trusting transport success.


## Application and durable-schema compatibility

Every new snapshot is bound to the exact 40-character lowercase Git commit SHA supplied through `--application-revision` or `STORYTELLER_APPLICATION_REVISION`.

The manifest also records a deterministic durable-schema fingerprint covering the file-store envelope, audit format, publication monitor, evidence request, evidence inbox and alert schemas plus their entity types. The snapshot identifier and manifest fingerprint include this compatibility identity.

Restore is fail closed:

- the durable-schema fingerprint must match the running code exactly;
- the creating and restoring application revisions must match by default;
- durable-schema mismatch cannot be overridden;
- a different application revision with the same durable schema requires all of `--compatibility-approved-by`, `--compatibility-evidence-hash` and `--compatibility-approved-at`, or the equivalent private environment values.

The approval is bound to the snapshot revision, target revision, durable-schema fingerprint, reviewer, evidence reference and approval time. The restore result exposes only `approved-compatible-revision` and a one-way approval fingerprint. It does not expose commit SHAs, reviewer identities or evidence hashes.

A compatibility approval is not a schema migration. When the durable-schema contract changes, implement and independently verify an explicit migration before restore support is extended.

## Redacted output

Backup, verification and restore results expose only:

- operation status;
- snapshot identifier;
- snapshot and restore timestamps;
- file count and total bytes;
- manifest fingerprint.

They omit:

- source, backup, snapshot and restore paths;
- operator identities;
- source fingerprint;
- individual paths, hashes and modes;
- file contents and private evidence.

## Audit boundary

The snapshot preserves the publication store's existing audit partitions exactly.

Backup and restore do not append an event to the publication state because doing so would mutate the source during backup or make restored state differ from the verified snapshot.

Operators should record backup and restore execution in a separate secured operations log using the redacted result and snapshot identifier.

## Rollback boundary

Restoring old data beside new application code can be unsafe when durable schemas have changed.

Before rollback:

- verify the snapshot;
- identify the application revision that created it;
- review durable schema compatibility;
- restore into isolation first;
- run full verification and preflight;
- never run old and new application revisions concurrently against one file-backed state root.

## Current boundary

This workflow provides deterministic offline snapshots, independent verification and safe restore to new or empty publication state.

It does not stop running services, prevent a writer from restarting, encrypt backups, transfer them off host, automate retention, verify external provider connectivity, create human evidence, guarantee perpetual publication availability, perform schema migrations or make file-backed persistence multi-host safe.
