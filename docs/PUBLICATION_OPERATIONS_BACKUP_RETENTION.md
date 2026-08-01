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

Plan, apply and inspection require `--output`. Complete private receipts are never written to standard output. A successful command emits only a bounded acknowledgement identifying whether a private `plan`, `apply` or `inspection` receipt was written.

The receipt output path must remain outside the backup root. A receipt inside the immutable snapshot inventory would change the inventory being planned or applied and is rejected before any retention action begins.


Inspect the immutable plan, apply evidence and backup root after every apply, and whenever apply leaves `applying` or `failed` evidence:

```bash
npm run publication-operations-backup-retention-inspect -- \
  --backup-dir ./backups \
  --plan-receipt retention-plan.json \
  --apply-receipt retention-receipt.json \
  --application-revision <40-character-git-sha> \
  --offline-confirmed \
  --inspected-at 2026-07-30T00:10:00Z \
  --output retention-inspection.json
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

Repeated planning with unchanged inventory, policy, application revision and evaluation time returns the same fingerprint.

Planning does not modify the backup directory. The complete plan must be persisted to the mandatory private output receipt for review; it is never dumped into service logs or an interactive terminal by default.

## Exact apply gate

Apply requires:

- the complete same policy;
- the same evaluation time;
- the exact same application revision;
- the expected plan fingerprint;
- an identified actor;
- `--offline-confirmed`;
- a mandatory private output receipt.

Before reserving mutation intent, apply performs a complete non-destructive inventory and plan verification. A mismatched plan fingerprint, invalid actor, missing offline confirmation, invalid apply time, occupied output path or output path inside the backup root fails before deletion is authorised.

After intent is reserved, apply recomputes and verifies the complete plan immediately before deletion. Any new, removed, altered or newly corrupt snapshot, policy change, evaluation-time change or application-revision change changes the plan and fails with:

```text
PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_STALE
```

No deletion occurs under a stale plan.

## Apply intent evidence

Destructive apply publishes private intent evidence to the final apply-receipt path before any snapshot deletion can begin.

The intent uses schema:

```text
storyteller-publication-operations-backup-retention-apply-intent-v2
```

It records:

- `status: applying`;
- a unique operation identifier;
- actor identity;
- start time;
- exact application revision;
- expected plan fingerprint;
- `backupState: inspection-required-until-completed`;
- a deterministic evidence fingerprint.

The intent file is mode `0600`, flushed, atomically published and read back byte-for-byte. The reservation is checked again immediately before the destructive domain operation. If another process changes or replaces the reserved receipt, apply fails before deletion with:

```text
PUBLICATION_OPERATIONS_BACKUP_RETENTION_CLI_OUTPUT_RESERVATION_CHANGED
```

On success, the final `pruned` or `unchanged` apply receipt atomically replaces the verified intent.

On failure after intent publication, the CLI attempts to replace the intent with private failure evidence using schema:

```text
storyteller-publication-operations-backup-retention-apply-failure-v2
```

The failure evidence records the operation identity, actor, original start time, application revision, expected plan fingerprint, exact intent fingerprint, a bounded error code, `backupState: inspection-required` and its own deterministic fingerprint. It does not claim that rollback completed. If the reserved evidence path itself changed or cannot be updated, the original intent or externally replaced file remains and operators must inspect both the receipt location and backup inventory.

The inspection command accepts legacy v1 intent and failure receipts so earlier maintenance evidence remains usable, but marks them `legacy-unfingerprinted` in the private inspection result.

An `applying` or `failed` receipt is not proof of completed deletion. Normal services must remain stopped until the backup inventory is inspected and retained snapshots are verified.


## Interrupted apply inspection

Inspection is a read-only offline maintenance command. It never renames, deletes, restores or repairs a snapshot.

It requires:

- the private fingerprinted retention plan receipt;
- the private apply receipt, which may be current v2 intent/failure, legacy v1 intent/failure or a final v2 result;
- the exact application revision;
- `--offline-confirmed`;
- a distinct private inspection output path outside the backup root.

Plan and apply evidence must be regular mode-`0600` files with one filesystem link. Symlinks, hard-linked evidence, oversized files, malformed JSON, fingerprint drift, application-revision drift and receipt substitution fail before an inspection receipt is written.

The inspector performs a read-only two-pass inventory. Every canonical snapshot and every recognised `.pruning` directory is fully reopened through the existing snapshot verifier. Plan and apply receipts are reopened after the second pass. Any inventory or evidence change during inspection fails closed.

The private inspection receipt binds the exact plan fingerprint, exact apply-evidence fingerprint and full verified inventory fingerprint. It has one of four statuses:

- `verified-complete`: final apply evidence matches the exact verified retained state;
- `verified-complete-recovered`: an interrupted or failed apply left no final result, but the exact verified retained state is complete and no `.pruning` residue remains;
- `verified-no-mutation`: all snapshots from the approved plan still exist unchanged, although later valid snapshots may also exist; create and approve a new plan before retrying;
- `inspection-required`: partial deletion, missing retained snapshots, changed snapshots, unknown entries, duplicate locations, invalid content or `.pruning` residue remains.

Only the first three statuses set `normalServicesMayRestart: true`. `inspection-required` keeps normal services stopped and requires manual host inspection. The command reports private snapshot identifiers and issue codes only in the mode-`0600` inspection receipt; standard output remains a bounded path-free acknowledgement.

Inspection does not repair `.pruning` state, recreate deleted snapshots or authorise a second apply under the old plan.

## Verified deletion

Each deletion candidate is reopened and fully verified immediately before removal.

Its identifier, creation time, byte total and manifest fingerprint must match the approved plan.

The snapshot directory is renamed to a private `.pruning` staging name before recursive removal. If removal fails, the implementation attempts to restore the original directory name. A failed rollback stops the operation with an explicit error and requires operator inspection.

After deletion, the remaining directory set must exactly equal the retained set from the approved plan.

## Required private receipts

Planning, destructive apply and read-only inspection require `--output`.

The private plan receipt records the complete verified inventory decision, including retained snapshots, deletion candidates, reasons, byte totals, application revision and plan fingerprint.

A successful mode-0600 apply receipt records:

- `pruned` or `unchanged` status;
- actor identity;
- apply time;
- approved plan fingerprint;
- exact application revision;
- retained and deleted counts;
- reclaimed bytes;
- deleted snapshot identifiers;
- receipt fingerprint.

An interrupted or failed apply may instead leave the private intent or failure evidence described above.

The receipts omit the backup filesystem path and snapshot file contents. They remain private operational evidence because snapshot identifiers, actor identity and retention decisions can still reveal internal state.

Standard output contains only one of these bounded acknowledgements after successful receipt completion:

```json
{"status":"written","receipt":"plan"}
```

```json
{"status":"written","receipt":"apply"}
```

```json
{"status":"written","receipt":"inspection"}
```

The acknowledgement omits output paths, application revisions, plan fingerprints, snapshot identifiers, actor identities and deletion details. Failed apply does not emit a success acknowledgement.

Store receipts in a private maintenance evidence location outside the backup root. Files inside the backup root that are not canonical snapshot directories intentionally make future retention fail closed.

## Atomic receipt publication

Receipt bytes are first written to a unique sibling staging file using exclusive creation and mode `0600`. The file is flushed before publication.

Without `--force`, the staging inode is linked into the requested output path only when that path does not already exist. An existing receipt is never silently overwritten and therefore blocks apply before mutation.

With `--force`, the fully written staging file replaces a regular requested output file through an atomic rename. Symbolic links, directories and other non-regular output targets are rejected.

After publication, the parent directory is flushed and the receipt is reopened and compared with the exact staged bytes. Failed publication removes the staging file. Successful publication leaves no `.tmp` receipt beside the final evidence file.

Final success or failure evidence can replace an apply intent only while the current receipt still exactly matches the reserved intent bytes. This prevents an externally changed receipt from being silently overwritten during destructive maintenance.

This boundary prevents partially written JSON from being mistaken for an approved plan or completed apply receipt. It does not make the containing filesystem durable against host loss; private maintenance evidence still needs appropriate encrypted storage and backup.

## Offline maintenance boundary

`--offline-confirmed` means every process capable of creating, copying, verifying, restoring or pruning snapshots has been stopped for the selected backup root.

Retention does not stop Docker services or acquire a distributed maintenance lease.

For the one-host Compose deployment:

1. stop mutation and backup maintenance containers;
2. create and retain the plan receipt;
3. review protected and deletion sets;
4. run apply with the exact fingerprint;
5. run read-only interrupted-retention inspection against the exact plan and apply receipts;
6. require `verified-complete`, `verified-complete-recovered` or `verified-no-mutation` before restarting normal services;
7. if inspection returns `inspection-required`, keep services stopped and inspect the backup root manually;
8. retain all plan, intent, failure, success and inspection evidence privately;
9. verify retained recovery snapshots and the required off-host copy;
10. restart normal services only after maintenance completes.

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

The retention layer controls verified local snapshot deletion on one offline host, leaves durable private intent evidence before destructive work begins, and provides read-only recovery-state inspection after interruption.

It does not:

- create off-host copies;
- encrypt snapshots;
- prove recovery objectives;
- validate restored application behavior;
- choose business or legal retention policy;
- delete cloud-provider backups;
- make file operations transactional across hosts;
- guarantee rollback if the host fails during deletion.

Intent and failure evidence make interruption visible; they do not prove the exact deletion point after sudden host loss. Inspect the backup root, resolve any `.pruning` directory and verify every retained snapshot before resuming services.

Keep at least one recent verified off-host recovery copy before pruning the local set.
