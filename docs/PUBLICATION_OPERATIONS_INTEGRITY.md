# Publication operations restored-state integrity

The publication operations integrity CLI is a read-only post-restore gate for the private file-backed state used by publication monitoring, evidence intake, refresh and alert delivery.

It reopens persisted entities through their domain stores, verifies audit-event fingerprints and validates the retained cross-reference graph without exposing entity identifiers or private evidence.

## Command

```bash
npm run publication-operations-integrity -- \
  --data-dir ./restored-storage \
  --checked-at 2026-07-30T00:00:00.000Z \
  --output integrity-result.json
```

`--data-dir` may come from `STORYTELLER_DATA_DIR`.

`--checked-at` is optional and defaults to the current time.

Use `--strict-warnings` when any operational warning should return exit code `2`:

```bash
npm run publication-operations-integrity -- \
  --data-dir ./restored-storage \
  --strict-warnings
```

Output files use mode `0600`.

## Read-only boundary

The command does not:

- acquire file locks;
- rewrite entity envelopes;
- append audit events;
- acknowledge evidence;
- resolve alerts;
- refresh monitors;
- contact providers;
- start worker roles.

It expects the publication state root to already contain the `entities/` and `audit/` directories created by the project store.

## Allowed durable entities

The dedicated publication operations state may contain only:

- `audiobook-retail-publication-monitor`;
- `audiobook-retail-publication-alert`;
- `audiobook-retail-publication-evidence-inbox`.

Unknown entity-type directories are rejected so a restore cannot silently introduce state outside the reviewed publication operations model.

## Filesystem layout checks

Integrity verification rejects:

- a missing or linked state root;
- unexpected top-level content;
- missing or linked `entities/` or `audit/` directories;
- unknown entity-type directories;
- non-JSON entity files;
- malformed entity identifiers;
- symbolic links and special files;
- active `.lock` or incomplete `.tmp` files;
- malformed audit filenames.

These checks complement, but do not replace, snapshot verification.

## Domain envelope checks

Every entity file is reopened through its existing domain store:

- `FileAudiobookRetailPublicationMonitorStore`;
- `FileAudiobookRetailPublicationAlertStore`;
- `FileAudiobookRetailPublicationEvidenceInboxStore`.

Those stores revalidate:

- project-store envelope hashes and revision chains;
- domain schema versions;
- domain fingerprints;
- status and transition invariants;
- embedded publication verification evidence;
- acknowledgement and resolution fingerprints.

A malformed entity is counted only as an aggregate issue code. Its identifier is not emitted.

## Alert graph checks

For every valid alert, integrity requires:

- the referenced monitor to exist;
- project, book and listing identity scope to match;
- the alert's recorded monitor revision not to exceed current state;
- same-revision monitor fingerprints to match;
- the trigger transition sequence, fingerprint, kind, health and time to exist in monitor history;
- resolved alerts to reference a retained healthy-live recovery transition;
- recovery monitor revisions not to exceed current state.

An unresolved alert after a retained recovery is a warning rather than structural corruption because the gateway may still need to reconcile it.

## Evidence inbox graph checks

For every valid inbox item, integrity requires:

- the referenced monitor to exist;
- project, book, listing identity and required-region scope to match;
- request revisions not to exceed current monitor state;
- same-revision monitor fingerprints to match;
- embedded verification scope to match the monitor;
- acknowledged evidence to appear in retained monitor entries;
- acknowledgement verification fingerprints and revisions to remain valid.

Operational warnings include:

- verification was consumed by the monitor but acknowledgement reconciliation is pending;
- an available evidence request was superseded by a later monitor revision;
- available evidence has expired.

Warnings do not mutate or delete inbox items.

## Audit partition verification

Every dated `audit/YYYY-MM-DD.jsonl` partition is read line by line.

The verifier checks:

- maximum line size;
- JSON shape;
- audit schema;
- actor, action, entity and optional request identifiers;
- partition date against event time;
- metadata value types;
- deterministic audit fingerprint;
- deterministic audit identifier;
- duplicate audit identifiers;
- referenced entity existence;
- audit revision not exceeding the current envelope revision.

Audit events are historical and may reference an earlier valid entity revision. The command does not attempt to reconstruct every historical envelope because only the current envelope and retained domain history are stored.

## Status

The result status is:

- `valid` — no structural issues or operational warnings;
- `valid-with-warnings` — no structural issues, but reconciliation or expiry warnings exist;
- `invalid` — one or more structural, envelope, graph or audit problems exist.

Exit codes are:

- `0` for `valid`;
- `0` for `valid-with-warnings` unless `--strict-warnings` is set;
- `2` for `invalid` or strict warnings;
- `1` for command or configuration failure.

## Redacted result

The result exposes only:

- status and check time;
- aggregate monitor, alert and inbox counts;
- aggregate monitor-health, alert-status and evidence-status distributions;
- audit partition and event counts;
- sorted safe issue and warning codes;
- aggregate result fingerprint.

It omits:

- state-root and file paths;
- project, book, monitor, alert and inbox identifiers;
- listing and verification fingerprints;
- source-reference and route hashes;
- human identities;
- audit actors and entity identifiers;
- publication evidence and file contents.

## Restore rehearsal

After restoring a snapshot into an isolated data volume:

1. run snapshot verification;
2. run publication operations integrity;
3. review warnings;
4. use `--strict-warnings` for promotion gating when policy requires complete reconciliation;
5. run publication operations preflight against the intended configuration;
6. start no external provider calls until the rehearsal is approved.

Integrity success does not prove that email or evidence providers are reachable.

## Docker maintenance profile

A networkless `publication-integrity` service can mount the selected publication data volume read-only and run this command inside the reviewed worker image.

It should be used after isolated restore and before production volume cutover.

The integrity service must not depend on or start mutation roles.

## Current boundary

The command proves that the current restored publication operations state is structurally readable, domain-valid, cross-referenced and audit-consistent under the retained information model.

It does not prove historical envelope reconstruction, provider connectivity, current retailer truth, successful alert delivery, human review quality, application-version downgrade compatibility, perpetual publication availability or multi-host safety.
