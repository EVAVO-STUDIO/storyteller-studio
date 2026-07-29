# Governed audiobook retail submission attempt

A submission decision authorizes one manual submission action. The submission-attempt boundary consumes that authorization and records a sanitized external receipt without storing credentials or claiming retailer acceptance.

## Admission boundary

A submission attempt requires the exact current chain:

```text
authorized single-submission decision
  + approved remote-draft submission review
  + successful delivery attempt
  + current distributor-account evidence
  + human submission operator
  -> one in-progress manual submission attempt
```

The decision must still be inside its validity window. The review, remote draft, file-set fingerprint, media-file count, package bytes and account evidence are rebound before the attempt starts.

## Deterministic one-attempt consumption

The attempt identity is derived from the immutable submission-decision fingerprint and attempt ordinal one.

The same decision cannot produce a second logical attempt. An identical start is idempotent. A changed operator or changed source under the same decision identity conflicts rather than creating another attempt.

Successful, failed and cancelled outcomes all consume the decision. A retry requires a newly reviewed and authorized submission decision.

## Manual submission boundary

The first method is `manual-acx-submit`.

Storyteller Studio does not receive or retain:

- passwords;
- access tokens;
- MFA secrets;
- browser cookies or local storage;
- remote URLs;
- raw account identifiers;
- raw submission receipt identifiers.

A human operator performs the action in the distributor account. The engine records only one-way hashes and bounded attestation fields.

## Successful submission receipt

A successful receipt confirms:

- the remote draft matches the approved delivery attempt;
- the acknowledged media-file count matches the governed package;
- every approved file was included;
- the distributor accepted the submission action for processing;
- submission was initiated;
- retailer acceptance was not claimed;
- the listing was not claimed to be published;
- a human operator confirmed completion before authorization expiry.

The resulting status is:

`submitted-awaiting-retailer-review`

This means the distributor accepted the request into its processing workflow. It does not mean the content passed retailer review.

## Failed and cancelled attempts

A failed attempt stores only a bounded uppercase failure code, human actor, time and immutable fingerprint. Raw retailer pages, account text, browser errors and credentials are excluded.

A cancellation stores only a bounded reason code, human actor, time and immutable fingerprint.

Both outcomes are terminal and explicitly forbid retry under the consumed decision.

## Terminal immutability

An attempt may transition once from `in-progress` to one of:

- `submitted-awaiting-retailer-review`;
- `submission-failed`;
- `cancelled`.

A terminal outcome cannot later be rewritten as another result. Revision and previous-fingerprint checks reject stale or conflicting updates.

## Persistence and audit

The attempt is stored as a revisioned `audiobook-retail-submission-attempt` entity.

Audit metadata contains only:

- status;
- media-file count;
- total package bytes;
- attempt ordinal;
- whether a receipt exists;
- whether submission was initiated;
- explicit false values for retailer acceptance and publication claims.

Private decision, review, remote-draft, account and receipt evidence is not copied into audit metadata.

## Privacy boundary

The public projection exposes:

- attempt and book identifiers;
- distributor;
- media-file count and total package bytes;
- submission method and attempt ordinal;
- status;
- whether a receipt exists;
- safe failure or cancellation code;
- timestamps, revision and fingerprint.

It omits:

- project and package identifiers;
- submission-decision and review identities;
- delivery-attempt and remote-draft references;
- distributor-account evidence;
- file-set and content hashes;
- operator and completer identities;
- receipt and retailer-reference hashes;
- credentials, URLs and private paths.

## Output boundary

`submitted-awaiting-retailer-review` means one human submission action was acknowledged for processing against the exact approved remote draft.

It does not mean accepted, approved, published, released, live or on sale through ACX or Audible.

The next stage must represent retailer processing status through independently verified external evidence. Validation errors, requested changes, acceptance and publication must remain separate states rather than inferred from the submission receipt.