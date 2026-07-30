# Private publication operations readiness

The publication operations readiness diagnostic verifies that the one-host file-backed publication state is structurally readable before Docker treats the private evidence gateway as healthy.

It is a read-only infrastructure check. It does not scrape retailer pages, create publication evidence, refresh monitors, acknowledge inbox items, deliver alerts or change any stored entity.

## Command

Run the complete aggregate diagnostic:

```bash
npm run publication-operations-readiness -- \
  --data-dir ./storage
```

Run the bounded readiness-only projection used by container health checks:

```bash
npm run publication-operations-readiness -- \
  --data-dir ./storage \
  --readiness-only
```

Optional deterministic and operational controls are:

```text
--checked-at <ISO-8601>
--stale-temporary-after-ms <integer>
--output <private-json-path>
--force
```

`--data-dir` may come from `STORYTELLER_DATA_DIR`.

## Infrastructure readiness

A successful result has:

```text
status: ready
```

This means the diagnostic could:

- initialise missing private store directories;
- enumerate every publication monitor, evidence-inbox item and alert;
- reopen and integrity-check every stored envelope;
- run the existing domain assertion for every payload;
- verify envelope and payload revision scope;
- traverse the state filesystem without following links;
- read every dated audit JSONL partition;
- reject malformed audit lines;
- reject symbolic links and special files;
- reject stale atomic temporary files.

A healthy TCP listener alone cannot establish these facts.

## Operational status

Infrastructure readiness is distinct from the current publication condition.

The aggregate `operationalStatus` is:

- `empty` when no monitor, inbox or alert entities exist;
- `healthy` when all monitors are current and healthy, no unresolved incident requires attention and no available evidence has expired;
- `attention` when refresh is due, a monitor is degraded, unavailable, mismatched or stale, available evidence has expired, an incident remains open or acknowledged, or notification delivery is pending or exhausted.

`attention` does not make the container infrastructure-unhealthy. Publication incidents are expected governed state and must remain observable without causing restart loops.

## Monitor aggregates

The safe result reports only counts for:

- total monitors;
- monitors whose refresh deadline has passed;
- `healthy-live`;
- `degraded`;
- `unavailable`;
- `mismatch`;
- `stale`.

No monitor identifier, listing identity, verification fingerprint or regional evidence is exposed.

## Evidence inbox aggregates

The safe result reports only counts for:

- total items;
- available items;
- acknowledged items;
- available items whose observation evidence has expired.

Available evidence is not acknowledged or consumed by readiness inspection.

## Alert aggregates

The safe result reports only counts for:

- total incidents;
- open incidents;
- acknowledged incidents;
- resolved incidents;
- pending notification delivery;
- sent notification delivery;
- exhausted notification delivery.

Recipient route hashes, delivery receipts, failure details, responder identities and resolution evidence are omitted.

## Filesystem checks

The diagnostic traverses only:

```text
<data-dir>/publication-operations
```

It rejects:

- symbolic links;
- sockets, devices and other special files;
- path escape;
- malformed persisted JSON;
- invalid domain payloads;
- invalid audit JSON;
- stale `.tmp` files older than the configured threshold.

Current `.lock` files and recent `.tmp` files are counted but do not automatically fail readiness. Short-lived locks and atomic staging files are normal during legitimate single-host writes.

The default stale temporary threshold is five minutes. It is bounded between one second and 24 hours.

## Audit boundary

Every dated file under the private audit directory must:

- use `YYYY-MM-DD.jsonl` naming;
- contain parseable non-empty JSON lines;
- contain the expected audit schema, identifiers, action, metadata and fingerprint fields.

Readiness reports only partition and event counts. It does not expose actor identities, entity identifiers, request identifiers or metadata.

## Redacted result

The complete result contains:

- readiness and operational status;
- check time;
- safe aggregate counts;
- a result fingerprint.

It omits:

- data and state paths;
- monitor, inbox and alert identifiers;
- project and book identifiers;
- listing, monitor, transition, request and verification fingerprints;
- source-reference and recipient-route hashes;
- provider receipts and failure details;
- human and worker identities;
- complete evidence or audit metadata.

When readiness fails, the CLI writes only:

```json
{"status":"not-ready","code":"PUBLICATION_OPERATIONS_READINESS_..."}
```

Raw exceptions and private paths are not emitted.

## Docker health check

The one-host Compose topology combines:

1. the readiness-only store diagnostic; and
2. the existing loopback TCP connection to the evidence gateway.

Both must succeed. This proves that the process is listening and that its shared publication state is readable and structurally valid.

The diagnostic does not contact the evidence gateway, email gateway, retailer or public internet.

## Backup and restore

Run readiness after every isolated restore rehearsal and before a restored volume is selected for production cutover.

A successful readiness result proves application-level structural readability for the current code revision. It does not prove that:

- the snapshot belongs to the intended business environment;
- external providers are reachable;
- retailer evidence is current;
- a previous application revision remains schema-compatible;
- off-host backup or encryption requirements are satisfied.

## Private application boundary

The readiness implementation and CLI remain private operational tooling.

Normal web and protected API runtimes must not import or invoke:

- `inspectPublicationOperationsReadiness`;
- `runPublicationOperationsReadinessCli`;
- publication monitor, inbox or alert store inspection controls.

No public readiness endpoint is added.

## Current boundary

The readiness diagnostic proves that one local publication state is structurally readable by the current application and reports aggregate operational attention safely.

It does not create human evidence, guarantee publication availability, replace alerts, acknowledge evidence, resolve incidents, stop writers, make file persistence multi-host safe or replace full startup preflight and exact-SHA repository verification.
