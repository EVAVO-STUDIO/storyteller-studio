# Generation Lease Heartbeat

Long-form narration calls can outlive a short queue lease. Storyteller Studio therefore treats lease renewal as an explicit ownership protocol rather than a timer hidden inside provider code.

## Exclusive ownership

A heartbeat controller is created from an active `GenerationQueueClaim`. It keeps the queue item identifier, job identifier, worker identity and opaque lease token inside the internal worker process.

The controller never returns the worker identity or lease token in its public snapshot. The token remains available only to the queue heartbeat operation and final terminal transition.

## Renewal cadence

The configured heartbeat interval must be:

- at least 250 milliseconds;
- shorter than half the lease duration;
- backed by a lease duration accepted by the queue;
- scheduled serially, never as overlapping renewals.

The default production shape renews a 60-second lease every 20 seconds. Deployments may choose a different bounded duration based on provider latency, but the interval cannot approach the expiry boundary.

## Serial renewal

Only one heartbeat request may be in flight for a claim. Concurrent callers receive the same renewal promise rather than creating competing queue revisions.

After a successful renewal the controller records only safe operational evidence:

- heartbeat count;
- queue envelope revision;
- last heartbeat timestamp;
- current expiry timestamp;
- controller state.

## Ownership loss

A heartbeat fails closed when:

- the opaque token no longer matches;
- the lease expired;
- another worker recovered and claimed the item;
- a revision race proves the claim is no longer authoritative;
- the renewed queue item is not leased to the expected worker.

The controller enters `lost` state and aborts its `AbortSignal` with `GenerationLeaseOwnershipLostError`. Provider adapters and orchestration code must use that signal so expensive work is stopped when its queue ownership is gone.

Ownership loss is not converted into a provider retry by the heartbeat controller. The queue reaper and current authoritative worker determine the next state.

## Terminal transition shutdown

Heartbeat scheduling must stop before `complete`, `fail`, `block` or `cancel` changes the queue item out of `leased` state.

`stopForTerminalTransition()`:

1. changes the controller to `stopping`;
2. cancels the next scheduled callback;
3. waits for an in-flight renewal to settle;
4. fails if ownership was lost;
5. changes the controller to `stopped`.

The worker may then perform one terminal queue transition with the same claim. This prevents a late renewal from racing a completion or failure revision.

## Terminal state observation

A renewal may fail because another authorised path already completed, blocked, failed or cancelled the queue item. When the controller reads a terminal state after renewal failure, it stops scheduling rather than falsely reporting that another worker stole the lease.

That distinction matters during orderly cancellation and shutdown.

## Process shutdown

`stop()` is idempotent and suitable for worker cleanup. It cancels future scheduling and waits for any active renewal. It preserves `lost` state and the aborted signal when ownership has already failed.

Process-level shutdown must still stop accepting new claims, abort active provider work, stop heartbeat controllers and leave unfinished leased items recoverable by expiry and the queue reaper.

## Internal-only boundary

The heartbeat controller is not imported by the web application or normal operator API. Those surfaces cannot:

- claim jobs;
- access lease tokens;
- renew leases;
- invoke provider adapters;
- complete worker jobs.

A future worker runtime will compose the heartbeat controller with the governed generation worker and will expose only redacted health summaries.

## Verification contract

Automated tests cover:

- scheduled lease extension;
- token and worker-identity redaction;
- serial overlapping renewal;
- loss after lease recovery by another worker;
- abort signalling;
- stopping before terminal transition;
- invalid renewal cadence rejection.

The full repository verification must remain green before heartbeat behaviour is treated as an accepted production foundation.
