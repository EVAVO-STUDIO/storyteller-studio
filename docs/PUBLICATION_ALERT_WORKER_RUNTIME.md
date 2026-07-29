# Private publication alert worker runtime

The Storyteller worker executable can run the generation service or the publication-alert delivery service. The roles are explicit so two independent continuous loops cannot accidentally share one process lifecycle or strand each other after a failure.

## Process role

`STORYTELLER_WORKER_ROLE` selects:

- `generation` — the existing narration-generation worker and the default;
- `publication-alerts` — the private publication-incident email delivery runtime.

A production deployment should run separate worker processes when both roles are required. Both roles use the same worker application and repository but have independent configuration, failure, scaling and shutdown boundaries.

## Disabled by default

Publication alert delivery is disabled unless:

```text
STORYTELLER_WORKER_ROLE=publication-alerts
STORYTELLER_PUBLICATION_ALERT_MODE=once|continuous
```

Disabled mode does not evaluate route bindings, email credentials, sender addresses, endpoints or filesystem paths.

## Private file state

Enabled publication-alert mode uses the existing `STORYTELLER_DATA_DIR` and stores governed monitor, alert and delivery revisions beneath:

```text
<STORYTELLER_DATA_DIR>/publication-operations
```

The runtime remains a single-host file-backed service. Production requires:

```text
STORYTELLER_FILE_PUBLICATION_ALERT_SINGLE_HOST=true
```

This acknowledgement does not make the file store horizontally scalable. More than one host requires a later transactional shared-store adapter.

## Recipient bindings

`STORYTELLER_PUBLICATION_ALERT_RECIPIENT_BINDINGS` is JSON mapping one-way recipient-reference hashes to environment-variable names:

```json
{
  "<64-character-sha256>": "PUBLICATION_ALERT_PRIMARY_EMAIL"
}
```

The referenced environment variable contains the raw email address. The configuration object stores only the hash-to-variable-name binding; the runtime resolves the address only during one delivery attempt.

Bindings must:

- use lowercase SHA-256 reference hashes;
- point to uppercase environment-variable names;
- use a unique environment variable per route;
- contain no raw email addresses;
- remain below the bounded route limit.

Configuration summaries expose only the binding count.

## HTTP email gateway

The runtime uses a provider-neutral HTTPS JSON email gateway.

Required settings are:

```text
STORYTELLER_PUBLICATION_ALERT_EMAIL_ENDPOINT
STORYTELLER_PUBLICATION_ALERT_EMAIL_TOKEN_ENV
STORYTELLER_PUBLICATION_ALERT_FROM_EMAIL_ENV
```

The token and sender settings identify environment-variable names. Their values are resolved only after enabled configuration has passed validation.

Optional settings are:

```text
STORYTELLER_PUBLICATION_ALERT_EMAIL_PROVIDER_ID
STORYTELLER_PUBLICATION_ALERT_EMAIL_ADAPTER_VERSION
STORYTELLER_PUBLICATION_ALERT_FROM_NAME
```

The gateway request contains:

- sender;
- exactly one recipient;
- subject;
- validated text and HTML bodies;
- template code;
- deterministic idempotency key;
- message fingerprint.

The idempotency key is sent both in the JSON payload and the `Idempotency-Key` header.

Provider authentication uses a bearer token. Credentials, recipient addresses, request bodies and provider response bodies must not be logged.

## Gateway response

A successful gateway response must provide a bounded receipt through:

1. `X-Message-Id`;
2. `X-Request-Id`; or
3. a bounded JSON `id`, `messageId` or `requestId` field.

The raw receipt exists only inside the adapter call. The governed delivery layer persists a one-way provider receipt hash.

Safe failure mappings include:

- rate limited;
- provider unavailable;
- provider rejected;
- network failed;
- invalid or oversized response;
- invalid receipt.

Raw response text and exception details do not enter durable evidence or safe runtime results.

## Runtime controls

The publication-alert runtime supports bounded environment controls for:

- worker identity;
- once or continuous execution;
- concurrency;
- maximum batch size;
- poll interval;
- provider timeout;
- shutdown grace period.

Continuous mode drains pending alerts, waits for the configured poll interval and repeats. Once mode performs one deterministic drain pass and stops.

## Shutdown

The first `SIGINT` or `SIGTERM` requests a graceful drain and starts the shutdown deadline.

A second signal, or expiry of the shutdown grace period, aborts the active route or provider request. The runtime returns only safe state, counts and failure codes.

## Safe summaries

Configuration and runtime summaries omit:

- worker identifiers;
- state-root paths;
- route hashes and environment-variable names;
- raw email addresses;
- sender values;
- bearer tokens;
- gateway endpoint;
- request and response bodies;
- provider receipts.

They expose only operational mode, bounded controls, route count, provider-configured state, shutdown signal and aggregate delivery counts.

## Private application boundary

Publication-alert configuration, route resolution, email adapters and runtime execution remain in `apps/worker` and the private engine delivery module.

The web and protected API applications must not import or invoke:

- publication alert runtime configuration;
- environment recipient resolution;
- HTTP email delivery;
- alert-delivery workers;
- runtime start or drain controls.

No execution endpoint is introduced.

## Current boundary

This runtime can drain already-created publication incidents and send their governed email notifications through a configured private gateway.

It does not acquire fresh retailer-page evidence, create monitor refreshes, create incidents, expand distribution lists, guarantee inbox delivery, confirm that a human read the alert, or resolve the underlying publication issue.
