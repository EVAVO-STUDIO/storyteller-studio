# Governed audiobook retail publication refresh coordination

The publication refresh coordinator advances an existing publication monitor only from complete governed publication-verification evidence. It never fabricates a human observation, human verification, retailer acceptance, public listing state or sample-playback result.

## Admission boundary

A refresh pass requires:

```text
persisted publication monitor
  + monitor refresh deadline
  + injected private verification provider
  + complete current publication-verification evidence or no evidence
  + exact monitor, listing and regional scope
  + optimistic monitor revision
  + governed publication-alert store
  -> refreshed, stale, conflicted or failed result
```

The injected provider returns either:

- one complete `AudiobookRetailPublicationVerification`; or
- `null` when no current verification evidence is available.

The coordinator does not construct human evidence from browser output, scrape results, account sessions or raw page data.

## Complete verification evidence only

A returned verification must already satisfy the publication-verification contract, including:

- an approved canonical retail listing identity;
- accepted retailer-status evidence;
- a current human-confirmed public listing observation;
- an independent human publication verifier;
- exact required-region scope;
- exact metadata, cover and eBook comparison;
- purchase and sample-playback state;
- immutable source fingerprints.

The coordinator validates that evidence before it can update the monitor.

Automated page acquisition may assist a separate human-governed observation workflow, but its raw output is not publication verification and cannot be promoted by this coordinator.

## Due discovery

`listDueAudiobookRetailPublicationMonitorIds` scans persisted publication monitors and returns only monitors whose `nextRefreshDueAt` is at or before the supplied time.

Ordering is deterministic:

1. earliest refresh deadline;
2. stable monitor identifier.

The result is bounded by an explicit maximum batch size.

## Refresh outcomes

### `not-due`

The monitor deadline has not arrived. No provider call, monitor revision or alert mutation occurs.

### `refreshed`

The provider returned complete valid verification evidence. The coordinator appends it through the existing monitor refresh contract and saves one new monitor revision.

The resulting health may be:

- `healthy-live`;
- `degraded`;
- `unavailable`;
- `mismatch`.

### `marked-stale`

The deadline has arrived and the provider returned no current evidence. The coordinator records the existing governed stale transition and creates an evidence-stale incident.

### `already-stale`

The monitor is already stale and no new evidence is available. No duplicate stale transition or incident is created.

### `conflict`

Another writer changed the monitor before the coordinator could save its revision. The coordinator reloads current state and reports a safe conflict result rather than overwriting it.

### `failed`

Acquisition, validation or governed state mutation failed with a safe failure code. Provider exception details and raw evidence are not returned.

## Alert creation

A newly persisted actionable monitor transition creates one deterministic publication incident through the existing alert contract.

Actionable transitions include:

- initial non-live state;
- regression from `healthy-live`;
- non-live state change;
- stale evidence.

A same-health refresh or healthy state does not create an incident. Repeated processing of the same transition and route remains idempotent through the alert fingerprint.

## Verified recovery resolution

When a fresh verification produces a monitor `recovery` transition to `healthy-live`, the coordinator resolves every earlier unresolved incident for that monitor through the existing verified-recovery contract.

Resolution requires the later monitor revision and recovery transition. The coordinator cannot manually declare that the listing recovered.

Notification history, acknowledgement and the original incident trigger remain immutable.

## Timeout and abort

Verification acquisition runs under a bounded timeout.

A timeout or provider failure returns a safe failed result and does not mutate monitor or alert state.

An external abort rejects the operation with `AUDIOBOOK_RETAIL_PUBLICATION_REFRESH_ABORTED`. It does not mark the monitor stale, append ambiguous evidence or create an incident.

## Revision and concurrency safety

Every monitor update uses:

- the exact persisted revision;
- the existing monitor fingerprint chain;
- the governed monitor store;
- a permitted audit action.

Alert creation and recovery resolution use their own existing revision-safe stores. The coordinator does not silently overwrite competing work.

## Batch worker

`AudiobookRetailPublicationRefreshWorker` processes a bounded deterministic due set with bounded concurrency.

Its snapshot reports only:

- due and processed monitor counts;
- refreshed, stale, failed and conflicted counts;
- created and resolved alert counts;
- remaining due count;
- safe result dispositions and failure codes.

The snapshot is a point-in-time result for one drain pass. It does not guarantee another process has not created or changed a monitor immediately afterwards.

## Persistence and audit

The coordinator introduces no new durable entity. It reuses:

- `audiobook-retail-publication-monitor`;
- `audiobook-retail-publication-alert`.

Existing audit metadata remains aggregate and omits public-page reference hashes, provider internals, raw page data, human identities and recipient-route values.

## Private application boundary

Refresh acquisition, due scanning, monitor mutation and incident mutation are private engine controls.

Normal web and protected API runtimes must not import or invoke:

- `refreshAudiobookRetailPublicationMonitor`;
- `listDueAudiobookRetailPublicationMonitorIds`;
- `AudiobookRetailPublicationRefreshWorker`;
- verification-provider acquisition controls.

A later private worker-runtime adapter may supply the governed verification provider and polling lifecycle.

## Output boundary

A successful refresh means the monitor accepted a later complete human-governed publication verification.

A stale transition means no current governed verification was available by the deadline. It does not by itself prove that the public product is unavailable.

The coordinator does not prove perpetual availability, replace human verification, scrape retailer pages, store account credentials, send alerts directly or confirm that a recipient acted on an incident.
