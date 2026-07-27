# Transactional Generation Budgets

Storyteller Studio treats provider spend as a governed production decision. A job must not invoke a paid provider merely because its manuscript, voice, rights and queue state are otherwise ready.

The budget ledger creates an explicit reservation before provider execution and settles the actual accepted cost before queue completion.

## Integer micro-units

All durable amounts use integer micro-units:

```text
1 major currency unit = 1,000,000 budget micros
```

This avoids floating-point accumulation across concurrent jobs and preserves provider estimates smaller than one cent. Conversion rejects negative, non-finite or more precise values rather than silently rounding uncontrolled input.

The account currency is an uppercase ISO-style three-letter code. One account is scoped to one project and one currency.

## Budget account

A revisioned budget account records:

- project and currency scope;
- authorised limit;
- total committed cost;
- immutable reservation history;
- revision and linked fingerprint chain;
- created and updated timestamps.

Available capacity is derived from:

```text
authorised - committed - active reservations
```

It is never trusted as an independently editable stored value.

An authorised limit cannot be reduced below existing committed cost plus active reservations.

## Reservation identity

A reservation identifier is deterministic over:

- budget account;
- generation job;
- queue item;
- queue attempt.

A repeated request for the same attempt and the same maximum cost is idempotent. A repeated request that changes the cost conflicts. A later queue retry receives a new attempt number and therefore a new reservation identity.

This prevents network retries from charging the available balance twice while still permitting a genuinely new execution attempt.

## Reservation lifecycle

### Reserved

Before provider invocation, the worker reserves the maximum approved job cost. Reservation creation uses optimistic account revision checks. Concurrent jobs may read the same apparent capacity, but only mutations that fit after the winning revision can commit.

When two reservations would exceed the limit, one receives `BUDGET_INSUFFICIENT_AVAILABLE_FUNDS`; the account cannot overspend through a race.

### Renewed

A long provider call may renew its active reservation before expiry. Renewal can only extend the deadline and does not change the maximum amount.

Budget renewal will be coordinated with the queue lease heartbeat when the ledger is wired into the worker service. Losing queue ownership must stop both provider work and future budget renewal.

### Committed

After provider execution produces complete cost evidence, the worker commits the actual amount. The actual amount must not exceed the reserved maximum.

The difference between reserved and actual cost becomes available in the same account revision that records the commit.

Repeated settlement with the same actual amount is idempotent. A different amount conflicts rather than rewriting financial history.

### Released

A configuration block, provider failure, quarantine, cancellation or governed rejection releases an active reservation with a safe reason code. A committed reservation cannot be released through this operation.

Refunds and commercial adjustments are deliberately a separate future ledger event; they must not be simulated by mutating committed history.

### Expired

Reservations have a bounded expiry. The ledger reaps expired reservations into an explicit terminal state before capacity-sensitive mutations. Expiry returns capacity without deleting the historical reservation.

A process crash may therefore leave a conservative temporary hold, but it cannot hold the account forever.

## Concurrency model

The file implementation stores one complete account as one integrity-checked entity. Every mutation:

1. reads and validates the current envelope;
2. computes the next account revision;
3. uses optimistic expected-revision replacement;
4. retries a bounded number of revision conflicts;
5. fails closed when capacity is no longer available;
6. appends bounded audit metadata.

This is appropriate for one isolated host. It does not claim cross-host transactions.

Multi-instance production will retain the same domain contract using a PostgreSQL transaction with row locking or serialisable conflict handling.

## Integrity

Account and reservation records are fingerprinted independently. Transitions link to previous fingerprints and preserve immutable job, queue, attempt and maximum-cost scope.

Validation rejects:

- mismatched account identity;
- duplicate reservation identities or queue attempts;
- invalid status evidence;
- actual cost above reservation;
- committed-total mismatch;
- obligations above authorised limit;
- reversed timestamps;
- broken revision or fingerprint chains;
- malformed persisted envelopes.

## Audit and public views

Audit metadata may contain currency, aggregate amounts, counts and reservation fingerprints. It does not contain job identifiers, queue identifiers, reservation identifiers, provider credentials or private object locations.

The safe account view exposes:

- currency;
- authorised, committed, reserved and available amounts;
- active, committed and terminal reservation counts;
- account revision, timestamp and fingerprint.

It omits project identity and every reservation-level execution identity.

## Worker integration contract

The production sequence is:

1. claim the queue item;
2. resolve immutable generation material;
3. revalidate rights and provider capability;
4. reserve the approved maximum cost;
5. start provider execution;
6. renew queue lease and budget reservation while work is active;
7. persist and verify generated artifacts;
8. validate provider cost evidence;
9. commit actual cost;
10. complete the queue item.

Every non-completion path releases or eventually expires the reservation. Queue completion must not precede budget settlement.

The current post-execution cost policy remains a second fail-closed check. The reservation ledger moves approval ahead of spend; it does not remove evidence validation afterward.

## No public spend mutation

Normal browser and operator API routes do not create, renew, commit or release budget reservations. Those actions belong to internal workers and controlled commercial administration.

A future read-only operator surface may expose aggregate budget views after workspace entitlement and authorisation are implemented.

## Production migration

The production ledger will add:

- PostgreSQL transactions and account row locking;
- account and project authorisation roles;
- provider pricing snapshots and quote expiry;
- currency-specific commercial reporting;
- reservation renewal linked to durable worker ownership;
- dead reservation reconciliation;
- governed refunds and adjustments;
- immutable cost evidence linked to execution-report artifacts;
- alerts and circuit breakers on anomalous spend.

No provider adapter should be enabled for production until the pre-provider reservation path is connected and verified.
