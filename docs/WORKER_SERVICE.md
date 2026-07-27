# Internal Worker Service

The worker service is the long-running internal process that joins the durable queue, immutable generation material, transactional budget control, provider adapters, lease heartbeat, private object storage and artifact registry.

It is deliberately implemented as an engine service before any deployment wrapper is added. The normal web application and operator API do not import it and cannot claim or execute work.

## Claim polling

The service polls the durable queue using a configured internal worker identifier. Every claim still uses the queue's existing controls:

- priority and scheduled availability;
- exclusive lease ownership;
- bounded lease duration;
- attempt ceiling;
- deterministic retry backoff;
- expired-lease reaping;
- optional project filter.

Polling is bounded and configurable. An empty queue produces a controlled wait, not a tight loop.

## Bounded concurrency

The service accepts a concurrency ceiling from 1 to 16. It fills only the available slots and does not claim another job after entering drain state.

Each active task owns its own queue lease, heartbeat controller and, when required, budget reservation. Completion of one task permits another claim without increasing the maximum number of simultaneous provider executions.

The safe public service snapshot reports counts, not active job or worker identities.

## Material resolution

A claim cannot execute until `FileGenerationMaterialStore` resolves a matching record.

Resolution verifies:

- active leased claim;
- job identifier;
- project identifier;
- segment identifier;
- job cache key;
- candidate count;
- material fingerprint and store-envelope integrity.

The service then calls `validateGenerationWorkerMaterial` again at the actual execution start time. This rechecks rights expiry and execution policy instead of assuming that material valid at preparation time remains valid later.

Missing, malformed, expired or scope-mismatched material blocks the queue item before provider credentials are resolved or provider work begins.

## Budget reservation and settlement

The dedicated worker runtime constructs the service with `requireBudget: true` and a `FileGenerationBudgetController`. A required controller must be present before the service can start.

After material resolution and before provider invocation, the service reserves the maximum amount from the material cost policy. Admission failure blocks the queue item without calling a provider. This covers:

- missing budget account;
- insufficient available capacity;
- missing or invalid cost policy;
- reservation idempotency conflict;
- invalid queue-attempt scope.

The active budget session is passed into the heartbeating worker through the internal queue-transition hook.

- A complete candidate set settles actual cost after artifact admission and before queue completion.
- A configuration block with no provider attempt releases the reservation before queue block.
- A retry with no provider attempt also releases capacity.
- Partial successful output commits observed cost.
- Attempted provider work without trustworthy cost evidence commits the full reservation conservatively.
- Abort, ownership loss or unexpected runtime failure uses interrupted-work settlement before the service returns its operational outcome.

Settlement is idempotent. Once a session has committed or released its reservation, repeated transition handling returns the same result rather than mutating commercial history twice.

The ordinary engine service keeps budget enforcement opt-in for isolated unit fixtures. The dedicated private worker runtime always enables it, so production composition cannot silently bypass the controller.

## Provider execution

A valid claim, material record and required budget reservation enter `runGenerationWorkerWithHeartbeat` with:

- the approved provider adapter registry;
- server-only credential resolver;
- private object store;
- revisioned artifact registry;
- exact material record;
- worker and verifier identities;
- provider timeout;
- live service clock;
- service cancellation signal;
- lease and heartbeat durations;
- governed budget-settlement callback.

The service does not add another generation implementation. It composes the previously verified provider, storage, artifact, heartbeat and budget boundaries.

## Live transition time

Provider execution may outlive one or more heartbeat renewals. Artifact writes, budget settlement and terminal queue transitions therefore use the live service clock rather than the timestamp captured when the claim first began.

This prevents a valid completion from failing timestamp-order checks after a later heartbeat updated the queue envelope.

Fixed timestamps remain available to deterministic tests when no live clock is supplied.

## Outcome classification

Each claimed job ends in one safe operational disposition:

- `completed`;
- `blocked`;
- `retry-wait`;
- `failed`;
- `cancelled`;
- `ownership-lost`;
- `aborted`.

The service retains a bounded outcome history containing queue and job identifiers, counts, safe finding codes, revision and redacted worker result. It does not retain manuscript text, voice identities, provider credentials, private request identifiers, object locators, budget reservation identifiers or lease secrets.

Unexpected internal failures are converted to a retryable queue failure only while the original claim remains authoritative. When the current queue state no longer belongs to this worker, the service records ownership loss and performs no terminal queue write. Any active budget session is settled conservatively before control returns.

## Graceful drain

`requestDrain()` stops new claims while active jobs continue. The service exits after all active tasks reach their governed result.

This is the preferred shutdown path for ordinary deploys and host maintenance:

1. stop accepting claims;
2. keep heartbeat renewal active for current work;
3. allow providers and artifact admission to finish;
4. stop each heartbeat before budget settlement and terminal transition;
5. exit when the active set is empty.

A drain requested before the service starts changes it directly to stopped state.

## Forced abort

`abortActive()` changes the service to draining state and aborts the shared service signal. Active provider adapters receive the abort through the heartbeating worker.

Interrupted claims are not falsely completed, blocked or failed by a stale shutdown path. They remain leased until expiry and are later recovered by the queue reaper. Their budget reservation is conservatively settled so potentially incurred external spend cannot silently become available again.

This behaviour is intentional. A process that no longer has time to finish evidence and terminal writes must leave recovery to durable queue ownership rather than guessing an outcome.

## Service failure

A failure in the polling loop or an uncaught job-processing defect changes the service to `failed`, aborts active work and records only a bounded safe failure code.

Ordinary expected outcomes such as missing material, budget admission failure, provider configuration blocks, retryable provider failure, artifact quarantine, cost policy failure, ownership loss and operator abort do not crash the service.

## Public snapshot

The safe snapshot reports:

- lifecycle state;
- whether claims are accepted;
- active job count;
- configured concurrency;
- aggregate claimed, completed, blocked, retrying, failed, cancelled, ownership-lost and aborted counts;
- bounded history size;
- last disposition and time;
- safe service failure code where applicable.

It omits:

- worker identifier;
- active job identifiers;
- queue lease token or token hash;
- text or direction;
- voice profile identifier;
- provider credential or request identifier;
- private object container, key or version;
- budget account, reservation or settlement identity.

## No HTTP execution surface

The worker service must not be imported by the normal API or web runtime. Those applications may create generation intent and inspect redacted queue or artifact state, but they cannot:

- poll or claim jobs;
- resolve executable private material;
- reserve or settle provider budget;
- receive provider credentials;
- renew leases;
- invoke providers;
- write private objects;
- verify artifacts;
- complete worker jobs.

The deployment wrapper is a dedicated non-HTTP worker process with a restricted service identity.

## Production migration

The file queue and stores are appropriate for tests, offline work and one isolated host. Multi-instance production will retain the same service contract while replacing coordination with:

- PostgreSQL transactional claims and budget reservations;
- database-backed material and artifact metadata;
- production private object storage;
- durable reservation renewal linked to worker ownership;
- distributed service identity and secret rotation;
- deployment-level concurrency and autoscaling controls;
- structured metrics with no manuscript or credential content;
- graceful shutdown deadlines and forced-abort escalation;
- commercial reconciliation for conservative settlements;
- dead-letter and operator recovery workflows.
