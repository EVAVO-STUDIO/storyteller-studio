# Docker maintenance profile for publication operations

The `maintenance` Compose profile runs the verified publication backup, snapshot verification, retention planning, retention apply and restore commands inside the same reviewed worker image as the publication operations services.

Maintenance containers have no network access. They do not start or stop mutation roles automatically.

## Services

The profile defines five one-shot services:

- `publication-backup`;
- `publication-backup-verify`;
- `publication-backup-retention-plan`;
- `publication-backup-prune`;
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

The topology uses three separately selectable named volumes:

```text
STORYTELLER_PUBLICATION_DATA_VOLUME
STORYTELLER_PUBLICATION_BACKUP_VOLUME
STORYTELLER_PUBLICATION_MAINTENANCE_RECEIPT_VOLUME
```

Defaults are:

```text
storyteller-publication-data
storyteller-publication-backups
storyteller-publication-maintenance-receipts
```

The backup service mounts:

- publication data read-only;
- publication backups read-write.

The verification service mounts only publication backups, read-only.

The retention-plan service mounts:

- publication backups read-only;
- maintenance receipts read-write.

The retention-apply service mounts:

- publication backups read-write;
- maintenance receipts read-write.

The restore service mounts:

- the selected publication data volume read-write;
- publication backups read-only.

Receipt files are intentionally outside the backup root. Unknown files inside the backup root cause future retention planning to fail closed.

## Required maintenance inputs

Set these private values in `.env.publication-operations`:

```text
STORYTELLER_PUBLICATION_MAINTENANCE_ACTOR_ID
STORYTELLER_PUBLICATION_BACKUP_SNAPSHOT_ID
STORYTELLER_PUBLICATION_RETENTION_EVALUATED_AT
STORYTELLER_PUBLICATION_RETENTION_KEEP_LATEST
STORYTELLER_PUBLICATION_RETENTION_KEEP_DAILY_DAYS
STORYTELLER_PUBLICATION_RETENTION_KEEP_WEEKLY_WEEKS
STORYTELLER_PUBLICATION_RETENTION_PLAN_FINGERPRINT
STORYTELLER_PUBLICATION_RETENTION_PLAN_FILE
STORYTELLER_PUBLICATION_RETENTION_RECEIPT_FILE
```

The actor identifier is stored privately in backup manifests, restore receipts and retention apply receipts. The snapshot identifier is used only by verification and restore.

`STORYTELLER_APPLICATION_REVISION` must be the exact lowercase 40-character Git commit SHA used to build the maintenance image. Backup binds it into the private manifest. Restore requires the same revision unless a separately reviewed same-schema compatibility approval is supplied through the private compatibility environment fields.

Retention planning and apply must use the same evaluation time and policy values. Copy the exact plan fingerprint from the private plan receipt only after review.

Do not place filesystem paths in snapshot identifiers, receipt filenames or plan fingerprints.

## Stop mutation roles

Before backup, retention apply or restore:

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

Do not run evidence intake, another backup service, host retention tooling or another Compose project against the selected state or backup root while maintenance is active.

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

Override the snapshot identifier from the shell so the private environment file does not need to be edited repeatedly:

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

## Plan backup retention

Retention planning is non-destructive and mounts the backup volume read-only:

```bash
docker compose \
  --profile maintenance \
  --env-file .env.publication-operations \
  -f compose.publication-operations.yml \
  run --rm --no-deps publication-backup-retention-plan
```

The plan is written to the maintenance-receipts volume using `STORYTELLER_PUBLICATION_RETENTION_PLAN_FILE`.

Planning fully verifies every snapshot before selecting latest, daily or weekly recovery points. The Compose service intentionally does not inject protected snapshot IDs. When protected snapshots are required, use the reviewed CLI directly or a private Compose override that adds the exact `--protect` argument to both plan and apply.

Copy the plan receipt out of the private receipt volume using trusted host tooling. Review:

- the exact application revision;
- evaluation time;
- policy fingerprint;
- retained snapshots and reasons;
- deletion candidates;
- reclaimable bytes;
- final plan fingerprint.

Do not run apply after an application upgrade, inventory change or policy change. Create and approve a new plan.

## Apply backup retention

Set the exact reviewed plan fingerprint, keep values and evaluation time in the private environment, then run:

```bash
docker compose \
  --profile maintenance \
  --env-file .env.publication-operations \
  -f compose.publication-operations.yml \
  run --rm --no-deps publication-backup-prune
```

Apply mounts the backup volume read-write but has no network access. It recomputes and verifies the complete plan before deletion, re-verifies each deletion candidate, and fails if the inventory or plan fingerprint changed.

The mandatory apply receipt is written to the maintenance-receipts volume using `STORYTELLER_PUBLICATION_RETENTION_RECEIPT_FILE`.

After apply:

1. retain the plan and apply receipts privately;
2. list the remaining snapshot identifiers;
3. run `publication-backup-verify` against retained snapshots selected by the recovery policy;
4. confirm at least one recent verified off-host copy still exists;
5. restart publication services only after maintenance review completes.

Retention is never invoked automatically by backup creation, health checks, startup or restore.

## Restart after backup or retention

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
8. confirm readiness, preflight and service logs;
9. retain the old volume until the cutover is verified.

## Rollback

Because cutover uses a new volume, rollback can select the previous retained data volume and recreate the stack after compatibility review.

Do not run both application revisions or both state volumes as active publication operations simultaneously.

Do not delete the previous volume until:

- the restored stack passes readiness and preflight;
- monitor and evidence state is readable;
- refresh and alert counts are plausible;
- a fresh post-cutover backup has been created and verified;
- the rollback window has expired under the operations policy.

## Off-host and encrypted backup

The backup named volume is still on the same Docker host. It protects against application-state corruption, not total host loss.

Copy verified snapshot directories to encrypted off-host storage using trusted host tooling. Preserve filenames and bytes exactly, then run snapshot verification against the received copy.

The maintenance profile does not provide encryption or remote transfer. Local retention must not be treated as an off-host backup policy.

## No network boundary

All five maintenance services use:

```text
network_mode: none
```

Backup, verification, retention and restore require no provider or retailer connectivity. This prevents maintenance commands from contacting the evidence gateway, email gateway or public internet.

## No automatic service control

The maintenance services intentionally do not depend on or stop running mutation services.

Compose cannot prove that external intake tools, host processes or another Compose project are inactive. The operator remains responsible for offline confirmation.

The backup and retention cores detect unsafe snapshot state and changed plans, but those checks do not replace the stop procedure.

## Current boundary

The maintenance profile makes backup, verification, retention planning, retention apply and restore reproducible inside the reviewed worker image with explicit read-only/read-write mounts, private receipts and no networking.

It does not schedule backups or pruning, encrypt or transfer snapshots, stop writers automatically, select legal retention policy, guarantee application-version compatibility, provide multi-host locking or guarantee rollback if the host fails during deletion.
