# Private publication verification evidence gateway runtime

The Storyteller worker can run a dedicated `publication-evidence-gateway` role that serves complete governed publication-verification evidence from the private inbox to the `publication-refresh` worker.

The gateway does not scrape retailer pages, create observations, create human verification, or expose a public execution API.

## Process role

`STORYTELLER_WORKER_ROLE` selects exactly one worker role:

- `generation`;
- `publication-alerts`;
- `publication-refresh`;
- `publication-evidence-gateway`.

Production should run each required role in a separate process. Changing roles requires a process restart.

## Disabled by default

The gateway is disabled unless:

```text
STORYTELLER_WORKER_ROLE=publication-evidence-gateway
STORYTELLER_PUBLICATION_EVIDENCE_GATEWAY_MODE=serve
```

Disabled mode does not evaluate the bearer token, bind host, port, state path, request limits or shutdown settings.

## Private file state

The gateway reads the shared governed publication state at:

```text
<STORYTELLER_DATA_DIR>/publication-operations
```

This contains publication monitors and evidence-inbox items. The runtime remains single-host and file-backed.

Production requires:

```text
STORYTELLER_FILE_PUBLICATION_EVIDENCE_GATEWAY_SINGLE_HOST=true
```

Multi-host operation requires a later transactional shared-store adapter.

## Private network binding

The default bind host is loopback:

```text
127.0.0.1
```

Binding to a non-loopback hostname requires:

```text
STORYTELLER_PUBLICATION_EVIDENCE_GATEWAY_PRIVATE_NETWORK=true
```

This acknowledgement means the operator has placed the service on an authenticated private network. It does not make the route public or remove bearer authentication.

## Authentication

Every request requires a bearer token. Configuration contains only the environment-variable name:

```text
STORYTELLER_PUBLICATION_EVIDENCE_GATEWAY_TOKEN_ENV
```

The token value is resolved only in enabled mode. Comparison uses constant-time byte comparison when token lengths match.

Tokens are not persisted or included in safe configuration, runtime results, response bodies or audit metadata.

## Route and request limits

The gateway serves one private route:

```text
POST /v1/publication-evidence
```

Requests must use JSON and stay within the configured body limit. Request reading and handling are bounded by the configured timeout.

Safe rejections include:

- unauthorized;
- route not found;
- method not allowed;
- content type required;
- body required;
- body too large;
- malformed request;
- monitor not found;
- stale monitor request;
- request timeout.

## Exact persisted-monitor rebind

The gateway does not trust the monitor object supplied by the client.

It reads the persisted monitor by identifier and compares the request against the exact current:

- monitor revision and fingerprint;
- project and book identifiers;
- listing identity and fingerprint;
- required regions;
- current health;
- latest verification status and fingerprint;
- last verification time;
- observation expiry;
- next refresh deadline;
- canonical request fingerprint.

A stale or substituted request returns `409` and cannot access another monitor's evidence.

## Evidence response

After exact rebinding, the gateway creates the canonical evidence request from the persisted monitor and asks the inbox for the newest current available item.

The response is:

- `200` with `{ "verification": ... }` when exact current evidence is available; or
- `204 No Content` when it is not.

Responses use `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`.

`204` means the inbox has no current available evidence for this exact request. It does not claim that the audiobook is unpublished or unavailable.

## No acknowledgement on serve

Returning a `200` response does not acknowledge the inbox item.

A successful write to the socket, HTTP response, retry, timeout or client disconnect cannot prove that the refresh worker durably updated the monitor.

The item remains `available` until reconciliation reads a later persisted monitor revision that proves exact consumption.

## Proven-consumption reconciliation

Before selecting evidence, the gateway scans available inbox items for the persisted monitor.

It acknowledges an item only when the existing inbox acknowledgement contract confirms that the later persisted monitor:

- is the same monitor, project, book and listing identity;
- has a later revision;
- contains the exact verification fingerprint as its latest entry;
- records the exact verification time.

The gateway re-reads persisted state for every request. It never acknowledges from the request body or an uncommitted in-memory candidate.

## Runtime controls

Enabled mode supports bounded controls for:

```text
STORYTELLER_PUBLICATION_EVIDENCE_GATEWAY_ID
STORYTELLER_PUBLICATION_EVIDENCE_GATEWAY_BIND_HOST
STORYTELLER_PUBLICATION_EVIDENCE_GATEWAY_PORT
STORYTELLER_PUBLICATION_EVIDENCE_GATEWAY_MAX_BODY_BYTES
STORYTELLER_PUBLICATION_EVIDENCE_GATEWAY_REQUEST_TIMEOUT_MS
STORYTELLER_PUBLICATION_EVIDENCE_GATEWAY_SHUTDOWN_GRACE_MS
```

## Shutdown

The first `SIGINT` or `SIGTERM` stops accepting new connections and begins graceful drain.

A second signal, or expiry of the shutdown deadline, aborts active requests and closes active connections.

The runtime reports only safe state and aggregate counters.

## Safe summaries

Configuration and runtime summaries omit:

- gateway identifier;
- state-root path;
- bind host and port;
- token environment-variable name and value;
- monitor, request and verification fingerprints;
- complete evidence objects;
- human identities;
- request and response bodies.

They expose only enabled state, private-gateway state, bounded limits, loopback/private-network flags, shutdown state and aggregate request counts.

## Private application boundary

Gateway configuration, HTTP handling, evidence selection, acknowledgement reconciliation and server lifecycle remain in `apps/worker` and private engine modules.

Normal web and protected API applications must not import or invoke:

- publication evidence gateway configuration;
- `handlePublicationEvidenceGatewayRequest`;
- `PublicationEvidenceGatewayService`;
- `runConfiguredPublicationEvidenceGateway`;
- evidence-inbox selection or acknowledgement controls.

No public route is introduced in the protected API or web application.

## Current boundary

This runtime serves complete current governed verification from the private inbox to the trusted refresh worker.

It does not scrape retailer pages, create or impersonate human evidence, expose a public API, store retailer credentials, acknowledge evidence merely because it was served, guarantee perpetual publication availability, send notification email or resolve publication incidents by itself.
