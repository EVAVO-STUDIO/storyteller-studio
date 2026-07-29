# Private publication refresh worker runtime

The Storyteller worker can run a dedicated `publication-refresh` role that feeds complete governed publication-verification evidence into the publication refresh coordinator.

It does not scrape retailer pages, create human observations, create human verification, or infer public availability from raw browser output.

## Process role

`STORYTELLER_WORKER_ROLE` selects exactly one process role:

- `generation` — narration generation and the default;
- `publication-alerts` — governed alert email delivery;
- `publication-refresh` — due-monitor refresh coordination.

Production deployments should run separate worker processes for each required role. A role change requires a process restart so one continuous lifecycle cannot strand another.

## Disabled by default

Publication refresh execution is disabled unless:

```text
STORYTELLER_WORKER_ROLE=publication-refresh
STORYTELLER_PUBLICATION_REFRESH_MODE=once|continuous
```

Disabled mode does not evaluate gateway credentials, endpoints, recipient references, filesystem paths or polling controls.

## Private file state

Enabled mode uses the same governed publication state root as alert delivery:

```text
<STORYTELLER_DATA_DIR>/publication-operations
```

The runtime remains single-host and file-backed. Production requires:

```text
STORYTELLER_FILE_PUBLICATION_REFRESH_SINGLE_HOST=true
```

This acknowledgement does not make the file store horizontally scalable. Multi-host execution requires a later transactional shared-store adapter.

## Governed verification gateway

The runtime calls one private HTTPS JSON gateway that returns either:

- `204 No Content` when no current governed verification exists; or
- `200 OK` with one complete `AudiobookRetailPublicationVerification` object, directly or under a `verification` property.

Required settings are:

```text
STORYTELLER_PUBLICATION_REFRESH_VERIFICATION_ENDPOINT
STORYTELLER_PUBLICATION_REFRESH_VERIFICATION_TOKEN_ENV
```

The token setting names an environment variable. The token value is resolved only after enabled configuration passes validation.

Optional gateway settings are:

```text
STORYTELLER_PUBLICATION_REFRESH_PROVIDER_ID
STORYTELLER_PUBLICATION_REFRESH_ADAPTER_VERSION
```

Production endpoints must use HTTPS. Local non-production testing may use loopback HTTP.

## Gateway request

Each request contains only governed internal scope needed to locate later evidence:

- monitor identifier, revision and fingerprint;
- project and book identifiers;
- listing-identity identifier and fingerprint;
- required regions;
- current monitor health;
- latest verification status and fingerprint;
- last verification and observation-expiry times;
- next refresh deadline;
- deterministic request fingerprint.

The request does not contain:

- retailer credentials or sessions;
- raw retailer URLs or HTML;
- raw public-page screenshots;
- recipient email addresses;
- email-provider credentials;
- manuscript, audio or package files.

The request fingerprint is also sent through the `Idempotency-Key` header.

## Complete evidence boundary

A `200` response must contain a structurally valid, fingerprint-valid publication verification.

The runtime also rejects evidence when:

- its observation has already expired;
- its verification time is unreasonably in the future;
- the response is empty, malformed or oversized.

The engine coordinator then enforces exact monitor, listing, regional and chronological scope before saving.

The gateway is responsible for returning evidence already created by the human-governed publication-verification workflow. Automated page acquisition alone is not sufficient.

The gateway trust policy must never convert automated acquisition into human-confirmed observation or verification fields. Changing that trust policy, gateway identity or evidence authority requires a reviewed configuration change and a worker-process restart.

## No-evidence behavior

`204 No Content` means no current governed verification is available.

It does not assert that no observation exists anywhere or that the product is unavailable. It states only that the trusted gateway cannot supply a current complete verification for this monitor at this request boundary.

When a monitor is due, the coordinator records governed staleness and creates an evidence-stale incident. Staleness means the evidence deadline was missed; it does not by itself prove the public product is unavailable.

## Recipient route

New incidents use one one-way recipient-route hash configured through:

```text
STORYTELLER_PUBLICATION_REFRESH_RECIPIENT_REFERENCE_HASH
```

The refresh process never receives the raw email address. The separate `publication-alerts` runtime resolves that hash later during notification delivery.

## Runtime controls

Enabled mode supports bounded controls for:

```text
STORYTELLER_PUBLICATION_REFRESH_WORKER_ID
STORYTELLER_PUBLICATION_REFRESH_CONCURRENCY
STORYTELLER_PUBLICATION_REFRESH_BATCH_SIZE
STORYTELLER_PUBLICATION_REFRESH_POLL_INTERVAL_MS
STORYTELLER_PUBLICATION_REFRESH_ACQUISITION_TIMEOUT_MS
STORYTELLER_PUBLICATION_REFRESH_SHUTDOWN_GRACE_MS
```

Once mode performs one deterministic due-monitor pass and stops.

Continuous mode drains due monitors, waits for the polling interval and repeats.

## Failure mapping

Safe gateway failures include:

- provider rate limited;
- provider unavailable;
- provider rejected;
- provider network failed;
- response too large;
- response invalid;
- evidence invalid;
- evidence not current.

Raw response bodies, credentials and thrown exception details do not enter durable evidence or safe runtime results.

## Shutdown

The first `SIGINT` or `SIGTERM` requests a graceful drain and starts the shutdown deadline.

A second signal, or expiry of the deadline, aborts the active gateway request or refresh pass with a safe failure code.

An external abort does not append ambiguous verification, staleness or alert state.

## Safe summaries

Configuration and runtime summaries omit:

- worker identifiers;
- state-root paths;
- recipient-route hashes;
- token environment-variable names and values;
- gateway endpoint;
- monitor, listing and verification fingerprints;
- human identities;
- request and response bodies.

They expose only operational mode, bounded controls, provider-configured state, shutdown state and aggregate refresh counts.

## Private application boundary

Publication-refresh configuration, gateway acquisition, due discovery and refresh execution remain in `apps/worker` and the private engine coordinator.

Normal web and protected API applications must not import or invoke:

- publication-refresh configuration;
- `HttpPublicationVerificationProvider`;
- `runConfiguredPublicationRefreshRuntime`;
- `AudiobookRetailPublicationRefreshWorker`;
- refresh mutation controls.

No execution endpoint is introduced.

## Current boundary

This runtime can poll a trusted private evidence gateway and coordinate persisted publication refreshes.

It does not browse retailer pages, create or impersonate human evidence, store account credentials, send email directly, guarantee public availability, confirm that an alert was read, or replace independent publication verification.
