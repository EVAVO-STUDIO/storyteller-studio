# Docker maintenance profile for publication operations

The `maintenance` Compose profile runs the verified publication backup, snapshot verification and restore commands inside the same reviewed worker image as the publication operations services.

Maintenance containers have no network access. They do not start or stop mutation roles automatically.

## Services

The profile defines three one-shot services:

- `publication-backup`;
- `publication-backup-verify`;
- `publication-restore`.

Every service uses:

- `profiles: [maintenance]`;
- `restart: "no"`;
- `network_mode: none`;
- the unprivileged worker image;
- a read-only root filesystem;
- dropped Linux capabilities;
- `no-new-privileges`.

## Named volumes

The topology uses two separately selectable named volumes:

```text
STORYTELLER_PUBLICATION_DATA_VOLUME
STORYTELLER_PUBLICATION_BACKUP_VOLUME
```

Defaults are:

```text
storyteller-publication-data
storyteller-publication-backups
```

The backup service mounts:

- publication data read-only;
- publication backups read-write.

The verification service mounts only publication backups, read-only.

The restore service mounts:

- the selected publication data volume read-write;
- publication backups read-only.

## Required maintenance inputs

Set these private values in `.env.publication-operations`:

```text
STORYTELLER_PUBLICATION_MAINTENANCE_ACTOR_ID
STORYTELLER_PUBLICATION_BACKUP_SNAPSHOT_ID
```

The actor identifier is stored privately in the backup manifest. The snapshot identifier is used only by verification and restore.

`STORYTELLER_APPLICATION_REVISION` must be the exact lowercase 40-character Git commit SHA used to build the maintenance image. Backup binds it into the private manifest. Restore requires the same revision unless a separately reviewed same-schema compatibility approval is supplied through the private compatibility environment fields.

Do not place a filesystem path in `STORYTELLER_PUBLICATION_BACKUP_SNAPSHOT_ID`. Use the exact `publication_backup_<24-hex>` identifier returned by the backup command.

## Stop mutation roles

Before backup or restore:

```bash
docker compose \
  --env-file .env.publication-operations \
  -f compose.publication-operations.yml \
  stop publication-refresh publication-alerts publication-evidence-gateway
```

Confirm they are stopped:

```bash
docker compose \
  --env-file .env.publication-operations \
  -f compose.publication-operations.yml \
  ps
```

Do not run evidence intake against the same state while maintenance is active.

## Create an offline backup

```bash
docker compose \
  --profile maintenance \
  --env-file .env.publication-operations \
  -f compose.publication-operations.yml \
  run --rm --no-deps publication-backup
```

The command prints a redacted JSON result containing the snapshot identifier, counts, timestamp and manifest fingerprint.

Record the result in the secured operations log. Do not treat container exit alone as proof of an off-host backup.

## Verify the snapshot

Override the snapshot identifier from the shell so the checked-in or private environment file does not need to be edited repeatedly:

```bash
STORYTELLER_PUBLICATION_BACKUP_SNAPSHOT_ID=publication_backup_... \
  docker compose \
    --profile maintenance \
    --env-file .env.publication-operations \
    -f compose.publication-operations.yml \
    run --rm --no-deps publication-backup-verify
```

Verification mounts the backup volume read-only and rejects missing, extra, altered, linked or malformed snapshot content.

Run verification again after copying a snapshot off host.

## Restart after backup

```bash
docker compose \
  --env-file .env.publication-operations \
  -f compose.publication-operations.yml \
  up -d
```

The gateway health check and deployment preflight run before refresh and alert delivery resume.

## Isolated restore rehearsal

Never rehearse by overwriting the production data volume.

Select a fresh named volume:

```bash
export STORYTELLER_PUBLICATION_DATA_VOLUME=storyteller-publication-rehearsal-data
export STORYTELLER_PUBLICATION_BACKUP_SNAPSHOT_ID=publication_backup_...
```

Restore into it:

```bash
docker compose \
  --profile maintenance \
  --env-file .env.publication-operations \
  -f compose.publication-operations.yml \
  run --rm --no-deps publication-restore
```

The restore command fails if the selected data volume already contains non-empty publication state.

After restore, inspect the rehearsal volume with trusted local tooling or a separately configured isolated publication stack. Do not point production roles at it until the rehearsal and schema compatibility checks are complete.

Remove only the rehearsal volume when finished:

```bash
docker volume rm storyteller-publication-rehearsal-data
```

Confirm the volume name before deletion.

## Production restore by volume cutover

Prefer restoring into a new named volume rather than deleting the current production volume.

1. stop mutation roles;
2. create and verify a final backup of current production state;
3. select a new empty volume name;
4. restore the chosen verified snapshot into the new volume;
5. update `STORYTELLER_PUBLICATION_DATA_VOLUME` in the private environment file;
6. run `docker compose config` securely;
7. start the stack;
8. confirm preflight and service logs;
9. retain the old volume until the cutover is verified.

Example restore target:

```bash
export STORYTELLER_PUBLICATION_DATA_VOLUME=storyteller-publication-data-restored-20260730
export STORYTELLER_PUBLICATION_BACKUP_SNAPSHOT_ID=publication_backup_...

docker compose \
  --profile maintenance \
  --env-file .env.publication-operations \
  -f compose.publication-operations.yml \
  run --rm --no-deps publication-restore
```

Then start the normal profile with the same data-volume override or persist that exact volume name in the private environment file.

## Rollback

Because cutover uses a new volume, rollback can select the previous retained data volume and recreate the stack after compatibility review.

Do not run both application revisions or both state volumes as active publication operations simultaneously.

Do not delete the previous volume until:

- the restored stack passes preflight;
- monitor and evidence state is readable;
- refresh and alert counts are plausible;
- a fresh post-cutover backup has been created and verified;
- the rollback window has expired under the operations policy.

## Off-host and encrypted backup

The backup named volume is still on the same Docker host. It protects against application-state corruption, not total host loss.

Copy verified snapshot directories to encrypted off-host storage using trusted host tooling. Preserve filenames and bytes exactly, then run snapshot verification against the received copy.

The maintenance profile does not provide encryption, remote transfer, retention or secure deletion.

## No network boundary

All three maintenance services use:

```text
network_mode: none
```

Backup and restore require no provider or retailer connectivity. This prevents maintenance commands from contacting the evidence gateway, email gateway or public internet.

## No automatic service control

The maintenance services intentionally do not depend on or stop running mutation services.

Compose cannot prove that external intake tools, host processes or another Compose project are inactive. The operator remains responsible for offline confirmation.

The backup core also detects lock files, temporary files and source mutation during copy, but those checks do not replace the stop procedure.

## Current boundary

The maintenance profile makes the merged backup, verification and restore commands reproducible inside the reviewed worker image with explicit read-only/read-write mounts and no networking.

It does not schedule backups, encrypt or transfer snapshots, stop writers automatically, guarantee application-version compatibility, provide multi-host locking or make deletion of old volumes safe without operator review.
