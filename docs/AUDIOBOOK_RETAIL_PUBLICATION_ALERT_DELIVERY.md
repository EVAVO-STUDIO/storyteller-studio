# Governed audiobook retail publication alert delivery

Publication alerts already contain deterministic private email notification requests. The delivery boundary consumes those requests without moving raw recipient addresses, provider credentials or response bodies into durable alert evidence.

## Admission boundary

Delivery requires the exact persisted alert:

```text
persisted publication alert
  + unresolved incident
  + pending notification
  + one-way recipient-route reference
  + ephemeral private route resolution
  + configured email-provider adapter
  + deterministic notification idempotency key
  -> sent or failed alert revision
```

The alert remains the durable job. The delivery worker does not create another public job record and does not reinterpret the incident’s category, severity, findings or publication state.

## Ephemeral recipient resolution

The alert stores only `recipientReferenceHash`.

A private runtime resolver may map that hash to an email address and optional display name for the duration of one delivery attempt. The resolver must return the same one-way reference hash requested by the alert. A different route, missing route or malformed address fails closed.

The raw email address is used only in the provider request. It is never written into:

- the publication alert;
- notification attempts;
- audit metadata;
- delivery results;
- public projections.

## Deterministic provider idempotency

Every provider request receives the notification’s existing `idempotencyKey`.

Retries for one governed notification therefore use the same key. A conforming provider adapter must treat repeated requests with the same key as one logical message. The worker also reloads persisted state before each attempt and returns `already-sent` when another worker already completed delivery.

This gives two independent protections:

1. provider-level idempotency for ambiguous network outcomes;
2. optimistic alert revisions for competing workers.

## Safe message rendering

The default renderer creates category-specific email subject, text and HTML content from the safe alert fields:

- incident identifier;
- public book identifier;
- severity and category;
- monitor transition kind;
- previous and current health;
- safe finding codes;
- trigger time.

It does not include:

- retailer credentials or account sessions;
- raw retailer URLs or HTML;
- monitor, listing or transition fingerprints;
- recipient-route references;
- notification idempotency keys;
- private source evidence.

A custom renderer may be supplied, but its output remains bounded and validated before provider delivery.

## Provider adapter boundary

An email provider adapter declares:

- a safe provider identifier;
- a semantic adapter version;
- a `send` operation accepting the rendered message and an abort signal.

Provider credentials remain inside the private adapter implementation. The delivery domain does not persist or expose credentials.

A successful provider call returns a raw receipt reference. The worker hashes that reference together with the provider identity and adapter version before recording the alert attempt. The raw receipt is discarded.

## Bounded retries

The alert contract already limits email delivery to three append-only attempts.

The worker records:

- `sent` with a one-way provider receipt hash; or
- `failed` with one safe failure code.

A sent notification is terminal. Three failed attempts produce `exhausted`, and subsequent worker runs skip provider and route resolution.

Failures such as missing routes, invalid route data, provider timeouts and safe provider error codes consume an attempt. An external operator abort does not append an ambiguous attempt because the worker cannot know whether delivery was intentionally cancelled before provider acceptance.

## Timeout and abort semantics

Recipient resolution and provider sending run under a bounded timeout. The default is 30 seconds and can be configured within a fixed safe range.

A timeout records a safe failed attempt. An external abort stops the operation and leaves the alert unchanged, allowing an operator to inspect the situation before deciding whether to retry.

No provider response body or thrown exception text is stored. Unknown errors collapse to a safe generic failure code.

## Revision and concurrency safety

Every successful or failed attempt creates a new alert revision through the existing alert store.

Saving requires:

- the exact current alert revision;
- the exact previous alert fingerprint;
- a permitted alert audit action.

When a competing worker wins the revision race, the loser reloads the alert. If it is already sent, the delivery is treated as complete. Otherwise the result is a safe save-conflict failure rather than silently overwriting another worker’s attempt.

## Batch worker

`AudiobookRetailPublicationAlertDeliveryWorker` drains pending unresolved alerts from the private project store.

Delivery ordering is deterministic:

1. critical incidents;
2. high-severity incidents;
3. warning incidents;
4. older trigger time;
5. stable incident identifier.

Concurrency and maximum batch size are bounded. The worker snapshot exposes only safe aggregate counts and per-alert dispositions.

## Persistence and audit

The worker reuses the existing revisioned `audiobook-retail-publication-alert` entity.

No new durable delivery entity is introduced. Notification history remains attached to the incident that caused it.

Existing alert audit metadata records only aggregate state such as delivery status and attempt count. It does not contain raw recipient addresses, route hashes, provider receipts or credentials.

## Private runtime boundary

The source, recipient resolver, renderer, provider adapter and batch worker are private engine controls.

Normal API and web runtimes must not import or invoke them. A later private worker-runtime integration may supply:

- secret-backed recipient routes;
- a production email adapter;
- polling or scheduled execution;
- operational logging and shutdown handling.

That integration must preserve the same evidence and privacy boundary.

## Output boundary

A `sent` disposition means the configured provider returned a receipt for the deterministic governed notification and the alert stored only a one-way receipt hash.

It does not prove that the recipient read the message, acted on it, or resolved the underlying publication incident. Incident acknowledgement and verified recovery remain separate alert revisions.
