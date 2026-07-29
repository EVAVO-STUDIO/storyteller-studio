# Governed audiobook retail delivery attempt

A release decision authorizes one controlled delivery attempt. The delivery-attempt boundary consumes that authorization and records what happened without storing credentials, automating submission or claiming retailer acceptance.

## Admission boundary

A delivery attempt requires the exact current chain:

```text
authorized retail release decision
  + approved final package review
  + independent package inspection
  + approved package manifest
  + current distributor-account evidence
  + human delivery operator
  -> one in-progress manual delivery attempt
```

The source decision must still be inside its short validity window. The package, review, inspection, manifest, account evidence, file count, byte totals and file-set fingerprint are rebound before the attempt begins.

## Deterministic one-attempt consumption

The attempt identifier is derived from the immutable release-decision fingerprint and attempt ordinal one.

The same decision cannot create a second logical attempt under another identifier. An identical retry is idempotent. A changed operator or changed source under the same decision identity becomes a persistence conflict rather than a second attempt.

Every terminal outcome records `retryPermittedUnderDecision: false`. A failed or cancelled transfer requires a new release decision before another attempt.

## Manual transfer boundary

The first delivery method is `manual-acx-upload`.

Storyteller Studio does not receive or retain:

- passwords;
- session cookies;
- MFA secrets;
- browser storage;
- access tokens;
- raw account identifiers;
- remote URLs;
- raw receipt identifiers.

A human operator works in the distributor account outside the engine. The engine records only one-way hashes for the remote draft and transfer receipt.

## Successful transfer receipt

A successful receipt must confirm:

- every approved media file was transferred;
- every file name was checked;
- the acknowledged file count exactly matches the approved package;
- the internal `package-manifest.json` was not uploaded as audiobook media;
- submission was not initiated;
- retailer acceptance was not claimed;
- a human actor confirmed completion;
- completion occurred before the release decision expired.

The resulting status is:

`files-transferred-awaiting-submission-review`

That status is intentionally not `submitted`, `released`, `accepted` or `live`.

## Failed and cancelled attempts

A failure stores only a bounded uppercase failure code, human actor, time and immutable fingerprint. Raw browser errors, account text, page content, credentials and manuscript material are not accepted into the record.

A cancellation stores only a bounded reason code, human actor, time and immutable fingerprint.

Both outcomes are terminal under the current decision.

## Terminal immutability

An attempt may transition exactly once from `in-progress` to one of:

- `files-transferred-awaiting-submission-review`;
- `transfer-failed`;
- `cancelled`.

A terminal attempt cannot later be rewritten into another result. Persistence uses revision and previous-fingerprint checks so stale or conflicting updates fail closed.

## Persistence and audit

The attempt is stored as a revisioned `audiobook-retail-delivery-attempt` entity.

Audit metadata contains only:

- status;
- media-file count;
- total package bytes;
- attempt ordinal;
- whether a sanitized receipt exists;
- explicit false values for submission and retailer-acceptance claims.

The audit actor remains accountable at the event layer, but private package, account, receipt and source identifiers are excluded from metadata.

## Privacy boundary

The public projection exposes:

- attempt and book identifiers;
- distributor;
- media-file count and total package bytes;
- delivery method and attempt ordinal;
- current status;
- whether a receipt was recorded;
- safe failure or cancellation code when present;
- timestamps, revision and fingerprint.

It omits:

- project and package identifiers;
- release-decision identity and fingerprint;
- package-review, inspection and manifest identities;
- distributor-account evidence;
- file-set and content hashes;
- operator and completer identities;
- remote draft and receipt hashes;
- private paths and credentials.

## Output boundary

A successful delivery attempt means only that a human operator attested that the exact approved media files were placed in a remote draft and remain awaiting an independent submission review.

It does not mean submitted, published, released, accepted, live, on sale or approved by ACX or Audible.

The next stage must independently inspect the remote draft or sanitized transfer evidence, revalidate the file set and policy, and create a separate submission decision. Retailer acceptance must remain a later external-evidence stage.