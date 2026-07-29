# Private publication verification evidence intake CLI

The Storyteller CLI can admit one complete human-governed audiobook publication verification into the private publication evidence inbox.

The command is a local operator workflow. It does not scrape retailer pages, create observations, create human verification or expose an HTTP execution route.

## Command

```text
npm run storyteller -- publication-evidence-submit \
  --data-dir ./storage \
  --monitor-id publication_monitor_001 \
  --verification ./verification.json \
  --source-reference-hash <64-lowercase-hex> \
  --actor-id publication_operator_001 \
  --received-at 2026-07-30T00:00:00.000Z \
  --output ./submission-result.json
```

`--received-at` is optional and defaults to the current time.

`--data-dir` may also come from `STORYTELLER_DATA_DIR`. The command uses:

```text
<STORYTELLER_DATA_DIR>/publication-operations
```

## Exact persisted monitor

The command reads the monitor identified by `--monitor-id` from the private publication state.

It creates the canonical evidence request from that exact persisted monitor revision. The caller cannot provide a replacement request, monitor fingerprint, region set or listing identity.

If the monitor does not exist, is stale relative to the submitted verification or has advanced to another revision, admission fails closed.

## Complete verification input

`--verification` must point to one complete `AudiobookRetailPublicationVerification` JSON document.

The existing evidence-inbox contract validates:

- schema and fingerprint integrity;
- exact project and book scope;
- exact approved listing identity;
- exact required-region set;
- a verification later than the monitor's current verification;
- current, unexpired observation evidence;
- a verification that is not future-dated.

The CLI does not manufacture missing fields, recalculate human decisions or accept partial observation data.

## Source provenance

`--source-reference-hash` is a one-way SHA-256 reference to the private governed source envelope or intake receipt.

Raw retailer URLs, HTML, screenshots, response bodies and account credentials must not be passed or stored as source provenance.

## Operator identity

`--actor-id` identifies the private operator performing admission. The identifier is stored in private evidence and audit history, but it is omitted from command output.

## Idempotency

The inbox item identity is derived from:

- the exact monitor request fingerprint; and
- the complete verification fingerprint.

Repeating the command with the same monitor revision, verification, receipt time and provenance returns the existing revision-one item rather than creating a duplicate.

The result metadata reports whether the store already contained the same item.

## Output boundary

The command emits only:

- the redacted inbox public view;
- whether the operation was idempotent;
- store revision;
- stored-envelope content hash.

It omits:

- the complete verification document;
- request and monitor fingerprints;
- source-reference hash;
- public-product reference hashes;
- observer, verifier and operator identities;
- verification-file path;
- publication state-root path.

Writing output to a file uses the existing `--output` and `--force` behavior.

## Persistence and audit

The command uses the existing revisioned `FileProjectStore`, publication-monitor store and evidence-inbox store.

Creation is idempotent for an identical inbox item. Conflicting content for the same deterministic item identifier is rejected rather than overwritten.

Audit metadata remains aggregate and redacted under the evidence-inbox contract.

## Private application boundary

The command is implemented in `packages/cli` and imports private engine controls directly.

Normal web and protected API runtimes must not import or invoke:

- `submitPublicationEvidenceCommand`;
- publication evidence request creation;
- inbox submission or persistence controls.

No web route, protected API route or remote execution endpoint is introduced.

## Current boundary

The command can admit complete existing human-governed publication verification into the local private inbox.

It does not acquire retailer evidence, create or impersonate human verification, acknowledge evidence as consumed, refresh a monitor, send alerts, guarantee publication availability or make the single-host file store multi-host safe.
