# Governed publication operations backup retention

Publication backup retention is a separate private maintenance action over already-created immutable publication snapshots.

Backup creation never prunes older snapshots. Retention requires an explicit verified plan followed by a separately confirmed apply step.

## Commands

Create a non-destructive plan:

```bash
npm run publication-operations-backup-retention-plan -- \
  --backup-dir ./backups \
  --evaluated-at 2026-07-30T00:00:00Z \
  --application-revision <40-character-git-sha> \
  --keep-latest 7 \
  --keep-daily-days 30 \
  --keep-weekly-weeks 12 \
  --output retention-plan.json
```

Apply the exact approved plan while publication backup writers are stopped:

```bash
npm run publication-operations-backup-prune -- \
  --backup-dir ./backups \
  --evaluated-at 2026-07-30T00:00:00Z \
  --application-revision <40-character-git-sha> \
  --keep-latest 7 \
  --keep-daily-days 30 \
  --keep-weekly-weeks 12 \
  --plan-fingerprint <sha256> \
  --actor-id operator_greg \
  --offline-confirmed \
  --pruned-at 2026-07-30T00:05:00Z \
  --output retention-receipt.json
```

The plan and apply steps must use the same:

- backup directory;
- evaluation time;
- exact application revision;
- keep-latest count;
- daily window;
- weekly window;
- protected snapshot identifiers.

Review and approve the plan from the same verified application revision used for apply. A repository or runtime upgrade requires a new plan and approval, even when the visible keep policy is unchanged.

## Verified inventory

Planning enumerates every entry beneath the backup root.

Every accepted entry must:

- be a real directory;
- use the canonical `publication_backup_<24-hex>` identifier;
- contain only the expected `manifest.json` and `data` layout;
- pass the complete existing snapshot verification;
- match its directory identifier;
- have a creation time no more than five minutes in the future.

Planning rejects:

- symbolic links;
- files or unknown directories at the backup root;
- hidden staging or pruning directories;
- malformed manifests;
- missing, changed or extra snapshot files;
- invalid compatibility evidence;
- more than 10,000 snapshots.

A plan cannot hide a corrupt snapshot by selecting it for deletion. Every snapshot is verified before any keep or delete decision exists.

## Retention policy

The policy supports four independent keep reasons.

### Latest

`--keep-latest` retains the newest N verified snapshots.

The minimum is one. Retention cannot intentionally delete every snapshot.

### Daily

`--keep-daily-days` retains the newest verified snapshot in each UTC calendar-day bucket inside the configured rolling window.

A value of zero disables daily buckets.

### Weekly

`--keep-weekly-weeks` retains the newest verified snapshot in each UTC Monday-based week bucket inside the configured rolling window.

A value of zero disables weekly buckets.

### Protected

`--protect` accepts a comma-separated set of snapshot identifiers that must be retained regardless of age.

Every protected identifier must exist in the verified inventory. A misspelled or missing protected snapshot fails the plan rather than silently continuing.

A snapshot may have multiple keep reasons. Reasons are recorded in deterministic order.

## Deterministic plan

The plan records:

- exact evaluation time;
- exact lowercase 40-character application revision;
- policy and policy fingerprint;
- complete snapshot and byte totals;
- retained snapshots and reasons;
- exact deletion candidates;
- retained and reclaimable bytes;
- plan fingerprint.

Repeated planning with unchanged inventory, policy and evaluation time returns the same fingerprint.

Planning does not modify the backup directory.

## Exact apply gate

Apply requires:

- the complete same policy;
- the same evaluation time;
- the expected plan fingerprint;
- an identified actor;
- `--offline-confirmed`;
- a mandatory private output receipt.

Apply recomputes and verifies the complete plan immediately before deletion. Any new, removed, altered or newly corrupt snapshot changes the plan and fails with:

```text
PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_STALE
```

No deletion occurs under a stale plan.

## Verified deletion

Each deletion candidate is reopened and fully verified immediately before removal.

Its identifier, creation time, byte total and manifest fingerprint must match the approved plan.

The snapshot directory is renamed to a private `.pruning` staging name before recursive removal. If removal fails, the implementation attempts to restore the original directory name. A failed rollback stops the operation with an explicit error and requires operator inspection.

After deletion, the remaining directory set must exactly equal the retained set from the approved plan.

## Required receipt

Destructive apply requires `--output`.

The mode-0600 JSON receipt records:

- `pruned` or `unchanged` status;
- actor identity;
- apply time;
- approved plan fingerprint;
- exact application revision;
- retained and deleted counts;
- reclaimed bytes;
- deleted snapshot identifiers;
- receipt fingerprint.

The receipt omits the backup filesystem path and snapshot file contents.

Store the receipt in a private maintenance evidence location outside the backup root. Files inside the backup root that are not canonical snapshot directories intentionally make future retention fail closed.

## Offline maintenance boundary

`--offline-confirmed` means every process capable of creating, copying, verifying, restoring or pruning snapshots has been stopped for the selected backup root.

Retention does not stop Docker services or acquire a distributed maintenance lease.

For the one-host Compose deployment:

1. stop mutation and backup maintenance containers;
2. create and retain the plan receipt;
3. review protected and deletion sets;
4. run apply with the exact fingerprint;
5. retain the apply receipt;
6. verify remaining snapshots;
7. restart normal services only after maintenance completes.

## No automatic pruning

The following operations never invoke retention automatically:

- backup creation;
- backup verification;
- restore;
- publication readiness;
- application startup;
- Docker health checks;
- startup preflight.

This prevents an unexpected backup, restart or health cycle from deleting historical recovery points.

## Current boundary

The retention layer controls verified local snapshot deletion on one offline host.

It does not:

- create off-host copies;
- encrypt snapshots;
- prove recovery objectives;
- validate restored application behavior;
- choose business or legal retention policy;
- delete cloud-provider backups;
- make file operations transactional across hosts;
- guarantee rollback if the host fails during deletion.

Keep at least one recent verified off-host recovery copy before pruning the local set.
