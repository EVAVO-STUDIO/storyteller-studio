# Governed audiobook retail submission review

A successful delivery attempt proves only that a human operator attested that the approved media files were placed in a remote draft. It does not prove that the remote draft is complete, playable, correctly named or safe to submit.

The submission-review boundary independently checks that remote draft before any submission decision can exist.

## Admission boundary

The review requires the exact current chain:

```text
approved package manifest
  + independent package inspection
  + final package review
  + short-lived release decision
  + terminal successful delivery attempt
  + sanitized transfer receipt
  + current retail policy
  + current audiobook rights
  + current distributor-account evidence
  -> remote-draft submission review
```

The review rebinds the exact package, file-set fingerprint, media-file count, byte totals, remote-draft reference hash and transfer receipt.

A changed manifest, package, account, decision, attempt or receipt cannot be substituted by recomputing a local fingerprint.

## Review window

Remote review must begin after transfer and before the earliest of:

- seven days after transfer;
- retail-policy expiry;
- audiobook-rights expiry;
- mandatory deletion time;
- distributor-account evidence expiry.

An expired review window requires fresh account evidence and a new governed path rather than silently extending old approval.

## Independent reviewer roles

Two distinct human roles are required.

### Editorial reviewer

The editorial reviewer confirms:

- the remote draft opens;
- the remote draft reference matches the transfer receipt;
- all expected file names are present and ordered correctly;
- opening and closing credits are correct;
- first, midpoint and final narrative material plays correctly;
- the retail sample is present and representative;
- no submission has been initiated.

The editorial role must use the remote draft player and consumer headphones or speakers.

### Engineering reviewer

The engineering reviewer confirms:

- every media file completed remote processing;
- no remote validation error remains;
- file count and names match the approved package;
- opening, narrative, closing and sample files play through the remote draft player;
- the remote output remains technically coherent.

The engineering role must use the remote draft player and studio headphones.

## Scores and findings

Both reviewers score:

- remote-file completeness;
- file naming and order;
- opening and closing accuracy;
- narrative coverage;
- remote-processing integrity;
- playback integrity;
- retail-sample integrity;
- submission readiness.

Every dimension must score at least four for readiness.

A changes-requested decision requires one or more bounded finding codes and explanatory notes. A clean re-review must replace the latest failed role decision before approval can proceed.

## Third-person approval

A third human approves the review for a later submission decision.

The approver must be independent from:

- the editorial reviewer;
- the engineering reviewer;
- the delivery operator;
- the release-decision authority;
- the distributor-account verifier.

Worker, bot, automation and system identities are rejected.

The approval binds the exact delivery-attempt fingerprint, release-decision fingerprint, remote-draft reference hash, file-set fingerprint and reviewer set.

## Persistence and revision safety

The review is stored as a revisioned `audiobook-retail-submission-review` entity.

The lifecycle is:

```text
open
  -> changes-requested or ready-for-approval
  -> approved-for-submission-decision
```

Each mutation requires the expected revision and previous fingerprint. Approved sessions are immutable.

## Privacy boundary

The public view exposes:

- review and book identifiers;
- distributor;
- media-file count and total package bytes;
- review and reviewer counts;
- playback-context coverage;
- score averages and safe finding codes;
- deadline, status, revision and fingerprint;
- whether a later submission decision is eligible.

It omits:

- project and package identifiers;
- delivery-attempt and release-decision identities;
- remote-draft and receipt hashes;
- package-review, inspection and manifest identities;
- policy, rights and account evidence fingerprints;
- file content hashes and file-set fingerprint;
- reviewer and approver identities;
- reviewer notes and final confirmation identifier;
- credentials, remote URLs and private paths.

Audit metadata is aggregate-only and explicitly records that remote processing was complete while submission remained uninitiated.

## Output boundary

`approved-for-submission-decision` means the exact remote draft passed independent editorial and engineering review and may be considered by a separate submission authority.

It does not mean submitted, published, released, accepted, live, on sale or approved by ACX or Audible.

The next stage must revalidate this approval, current policy, current rights and account access before authorizing exactly one submission action. A later submission receipt and retailer-status evidence must remain distinct records.