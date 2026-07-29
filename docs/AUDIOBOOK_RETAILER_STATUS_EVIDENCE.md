# Governed audiobook retailer status evidence

A successful submission receipt proves only that the distributor accepted a request into its processing workflow. It does not prove that the audiobook passed review, was accepted for sale, was published or is live.

Retailer-status evidence records a separately observed external state without storing credentials, raw page content or account identifiers.

## Admission boundary

The evidence requires the exact submitted chain:

```text
submitted retail attempt
  + sanitized submission receipt
  + single-submission decision
  + approved remote-draft review
  + current distributor-account evidence
  + independent human observer
  -> immutable retailer-status evidence
```

The submission attempt, receipt, decision, review, account evidence and file-set fingerprint are rebound at observation time.

## Normalized statuses

The first version supports four normalized states:

- `processing`;
- `changes-requested`;
- `accepted-awaiting-publication`;
- `rejected`.

The normalized state is derived from external evidence, but the raw status text and page content are not persisted. Instead, the record retains one-way hashes for the external reference and exact observed status text.

## Processing

`processing` means the distributor is still evaluating or processing the submission.

It explicitly records:

- retailer acceptance not confirmed;
- publication not confirmed;
- live status not confirmed;
- no resubmission requirement inferred.

## Changes requested

`changes-requested` requires one or more bounded issue codes.

The record marks `resubmissionRequired: true`. It does not reopen or mutate the submitted package. Corrective work must return through the governed production, review, packaging and submission chain.

Raw retailer messages are not copied into audit or public views.

## Rejection

`rejected` also requires bounded issue codes.

Rejection is distinct from a requested revision. The record does not infer that a retry, appeal or resubmission is permitted.

## Acceptance awaiting publication

`accepted-awaiting-publication` permits `retailerAcceptanceConfirmed: true` only when the external evidence explicitly supports acceptance.

Even then:

- `publicationConfirmed` remains false;
- `liveConfirmed` remains false;
- the audiobook is not described as released or on sale.

Publication and live availability require a later independent evidence stage.

## Independent observation

The observer must be a human who is independent from:

- the submission operator;
- the submission receipt completer;
- the submission-decision authority;
- the distributor-account verifier.

Worker, bot, automation and system identities are rejected.

## Current account evidence

Distributor-account evidence must still be current at observation time and match the exact project and book.

No password, token, MFA secret, session cookie or raw account identifier is accepted into the evidence record.

## Persistence and audit

Each observation is an immutable revision-one `audiobook-retailer-status-evidence` entity.

A repeated identical write is idempotent. Another external reference, status, time or source attempt produces separate evidence rather than rewriting prior history.

Audit metadata contains only:

- normalized status;
- issue count;
- acceptance-confirmed flag;
- explicit false publication and live flags;
- resubmission-required flag.

## Privacy boundary

The public projection exposes:

- evidence and book identifiers;
- distributor;
- normalized status;
- safe issue codes;
- acceptance, publication, live and resubmission flags;
- observation time, status, revision and fingerprint.

It omits:

- project and package identifiers;
- submission-attempt, receipt, decision and review identities;
- retailer submission reference hash;
- account evidence;
- file-set and content hashes;
- external-reference and status-text hashes;
- observer identity;
- credentials, URLs and private paths.

## Output boundary

Retailer-status evidence communicates only what the independently observed external evidence supports.

`accepted-awaiting-publication` does not mean published, released, live or on sale.

A later publication-evidence stage must verify the public listing, exact title identity, regional availability and live state before Storyteller Studio can represent the audiobook as published.