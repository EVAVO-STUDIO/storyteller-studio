# Private publication operations deployment preflight

The `publication-operations-preflight` worker role validates that the private publication alert, refresh and evidence-gateway processes form one coherent deployment before those long-running roles are started.

The preflight does not start a listener, poll monitors, serve evidence, send email or mutate publication state.

## Process role

Run the preflight through the existing worker entry point:

```text
STORYTELLER_WORKER_ROLE=publication-operations-preflight
npm run dev:worker
```

The process resolves all three publication-role configurations from the same environment, validates their cross-role contracts, emits one redacted readiness result and exits.

## Required enabled roles

Preflight requires these configurations to be enabled:

- `STORYTELLER_PUBLICATION_ALERT_MODE=once|continuous`;
- `STORYTELLER_PUBLICATION_REFRESH_MODE=once|continuous`;
- `STORYTELLER_PUBLICATION_EVIDENCE_GATEWAY_MODE=serve`.

A disabled role fails closed. Preflight does not silently reinterpret a disabled role as an optional component.

## Shared private state

All three configurations must resolve to the same private publication state root:

```text
<STORYTELLER_DATA_DIR>/publication-operations
```

This is required because:

- refresh reads and updates publication monitors;
- refresh creates and resolves publication alerts;
- alert delivery reads those alerts;
- the evidence gateway reads monitors and inbox evidence;
- the intake CLI writes to the same evidence inbox.

A state-root mismatch fails before any long-running role is started.

## Gateway token pairing

The refresh client and evidence gateway each name an environment variable containing their bearer token.

Preflight resolves both values privately and compares them using constant-time comparison when their lengths match.

The token values and environment-variable names are not included in the preflight result.

A missing or mismatched token fails closed.

## Gateway endpoint alignment

The refresh endpoint must use the exact route:

```text
/v1/publication-evidence
```

Direct loopback deployments require:

- a loopback refresh hostname;
- a loopback gateway bind host;
- matching refresh endpoint and gateway ports.

A direct mismatch fails closed.

## Private networking and TLS termination

A non-loopback gateway bind requires the gateway's existing private-network acknowledgement.

A loopback gateway behind a private HTTPS reverse proxy requires:

```text
STORYTELLER_PUBLICATION_OPERATIONS_GATEWAY_PROXY=true
```

This explicit acknowledgement allows the refresh endpoint to be an HTTPS private proxy while the application gateway remains loopback-bound.

It does not make the gateway public, remove bearer authentication or relax request validation.

## Incident recipient route

The refresh coordinator creates incidents using one recipient-reference hash.

Preflight requires that exact hash to exist in the alert runtime's recipient bindings and verifies that its environment-backed recipient is a valid email address.

The route hash, environment-variable name and email address are omitted from the result.

## Email delivery preflight

The alert runtime's email token and sender address must both resolve successfully.

Preflight does not contact the email provider and does not send a message. Provider connectivity remains a separate runtime concern.

## Distinct operational identities

The alert worker ID, refresh worker ID and evidence gateway ID must be distinct.

This prevents one shared identifier from obscuring which private process created an audit event or operational outcome.

The identifiers are not included in the readiness result.

## Deadline compatibility

The refresh acquisition timeout must be at least as long as the evidence gateway request timeout.

This avoids a client deadline that expires before the configured server-side request budget.

The preflight does not guarantee network latency or provider availability.

## Single-host acknowledgements

Each file-backed publication role retains its existing production single-host acknowledgement.

In production, the underlying configuration resolvers already fail unless the relevant acknowledgement is present. The preflight summary reports only whether all three acknowledgements are complete.

The acknowledgements do not make the file store multi-host or horizontally scalable.

## Safe result

A successful result exposes only:

- `status: ready`;
- no public execution API;
- no public gateway;
- shared-state confirmation;
- token, route, identity, endpoint and deadline compatibility booleans;
- alert and refresh execution modes;
- gateway mode;
- gateway transport classification;
- aggregate single-host acknowledgement completeness.

It omits:

- tokens and environment-variable names;
- email addresses and route hashes;
- worker and gateway identifiers;
- state-root paths;
- endpoint URLs, hosts and ports;
- provider credentials;
- publication evidence;
- monitor, listing and verification fingerprints.

## Private application boundary

Preflight configuration and execution remain in `apps/worker`.

Normal web and protected API runtimes must not import or invoke:

- `runPublicationOperationsPreflight`;
- publication alert, refresh or evidence-gateway configuration resolvers;
- private deployment compatibility controls.

No execution route is added.

## Current boundary

The preflight proves that the configured private publication roles are internally compatible at startup.

It does not start those roles, prove provider connectivity, acquire retailer evidence, create human verification, send email, guarantee perpetual publication availability or make file-backed persistence multi-host safe.
