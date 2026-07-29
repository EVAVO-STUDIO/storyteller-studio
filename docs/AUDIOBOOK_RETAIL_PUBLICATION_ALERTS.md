# Governed audiobook retail publication alerts

Publication alerts are created only from persisted publication-monitor transitions. They do not trust raw browser results, send email directly or replace the immutable monitor history that triggered them.

## Admission boundary

An alert requires the latest actionable transition from one governed publication monitor:

```text
persisted publication monitor
  + actionable latest transition
  + current non-live health
  + safe finding codes
  + one-way notification recipient reference
  -> revisioned publication alert incident
```

Actionable transitions are:

- an initial non-live state;
- a regression from `healthy-live`;
- a non-live state change;
- explicit stale evidence.

A healthy monitor, a same-health refresh or a recovery transition cannot create a new incident.

## Alert classifications

### Identity mismatch

Health: `mismatch`

Category: `identity-mismatch`

Severity: `critical`

Template: `publication-identity-mismatch`

This indicates that an observed public page exists but its metadata, cover or linked eBook differs from the approved listing identity.

### Publication unavailable

Health: `unavailable`

Category: `publication-unavailable`

Severity: `critical`

Template: `publication-unavailable`

This indicates that none of the required regional product pages were accessible in the latest governed verification.

### Regional degradation

Health: `degraded`

Category: `regional-degradation`

Severity: `high`

Template: `publication-regional-degradation`

This indicates that the identity matches but required regions have purchase, page-access or sample-playback failures.

### Evidence stale

Health: `stale`

Category: `evidence-stale`

Severity: `warning`

Template: `publication-evidence-stale`

This indicates that no current public verification exists within the monitor’s freshness deadline.

## Deterministic incident identity

The incident identity is derived from:

- monitor identity;
- exact transition fingerprint;
- one-way recipient-reference hash.

Repeated creation from the same transition and route therefore produces the same incident and notification identity.

Another monitor, transition or route cannot silently reuse the incident.

## Notification request boundary

Each alert contains one private email notification request with:

- hashed recipient-route reference;
- deterministic idempotency key;
- category-specific template code;
- pending, sent or exhausted delivery state;
- no more than three append-only attempts.

The alert engine does not receive a raw email address and does not send mail. A separate delivery worker may resolve the route reference and attempt delivery.

## Delivery attempts

Each notification attempt records:

- attempt number;
- sent or failed outcome;
- attempt time;
- one-way provider receipt hash for success; or
- safe failure code for failure.

A sent attempt is terminal and idempotent. Three failed attempts produce `exhausted`; a fourth attempt is rejected.

Provider response bodies, message contents, credentials and raw recipient addresses are not stored.

## Acknowledgement

An open alert may be acknowledged by a human responder.

Acknowledgement records:

- responder identity;
- acknowledgement time;
- optional bounded notes;
- immutable acknowledgement fingerprint.

Worker, bot, automated and system identities cannot acknowledge an incident.

Acknowledgement does not change publication health and does not resolve the alert.

## Verified recovery resolution

An alert can resolve only when a later revision of the same monitor contains a verified recovery to `healthy-live`.

Resolution requires:

- exact monitor, project, book and listing identity scope;
- a later monitor revision;
- a later transition sequence;
- latest transition kind `recovery`;
- current health `healthy-live`;
- immutable recovery monitor and transition fingerprints.

Resolution may be recorded automatically because the state change is evidence-backed. It does not require a manual declaration that the public listing recovered.

The original trigger, notification attempts and acknowledgement remain immutable in alert history.

## Persistence and audit

Alerts are revisioned entities. Creation is idempotent for an identical incident fingerprint. Every update requires the exact current revision and previous alert fingerprint.

Aggregate audit metadata records:

- category and severity;
- incident status;
- trigger kind and health;
- finding count;
- notification delivery state and attempt count;
- acknowledgement and resolution booleans.

It omits monitor, listing and transition fingerprints, recipient-route hashes, provider receipts and human identities.

## Public projection

The safe public projection exposes:

- incident and book identifiers;
- category and severity;
- safe trigger kind and health transition;
- finding codes;
- email delivery state and attempt count;
- acknowledgement and resolution times;
- incident status, revision and fingerprint.

It omits:

- project identity;
- monitor and listing identities and fingerprints;
- transition fingerprint;
- notification identity and idempotency key;
- recipient-reference hash;
- provider receipt hashes and failure details;
- responder and resolver identities;
- private source evidence.

## Output boundary

An `open` or `acknowledged` incident means a governed publication problem remains unresolved.

A `resolved` incident means a later immutable monitor verification proved recovery to `healthy-live`. It does not erase the regression and does not guarantee future availability or prevent a later transition from creating a new incident.
