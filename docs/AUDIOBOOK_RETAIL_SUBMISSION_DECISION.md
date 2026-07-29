# Governed audiobook retail submission decision

An approved remote-draft review does not itself authorize a distributor submission. The submission-decision boundary revalidates the complete chain and creates one short-lived authorization for one manual submission action.

## Admission boundary

The decision requires the exact current chain:

```text
approved package manifest
  + independent package inspection
  + final package review
  + release decision
  + successful delivery attempt
  + approved remote-draft submission review
  + current retail policy
  + current narration eligibility
  + current audiobook rights
  + current distributor-account evidence
  + independent publisher submission authority
  -> authorized-for-single-submission
```

Every source is rebound at decision time. Another package, remote draft, account, narration record or review cannot be substituted by recomputing a local fingerprint.

## Distributor-specific method

The first supported target is `acx-audible` using `manual-acx-submit`.

The decision authorizes a human operator to perform the final submission action in the distributor interface. The engine does not receive account credentials and does not click or automate the submission control.

## Narration eligibility

The exact narration evidence from the track plan is revalidated again.

Human narration requires a current human-performance attestation. Synthetic and mixed narration require current title- or project-scoped Audible or ACX platform authorization for the exact book and retail-policy fingerprint.

Voice consent, provider licensing and general commercial rights do not substitute for platform authorization.

## Independent authority

The submission authority must be a human who is independent from:

- the editorial remote-draft reviewer;
- the engineering remote-draft reviewer;
- the remote-draft review approver;
- the delivery operator;
- the earlier release-decision authority;
- the distributor-account verifier;
- the narration eligibility attestor.

Worker, bot, automation and system identities are rejected.

## Single-action authorization

The decision permits exactly one submission attempt.

The authorization expires no later than 24 hours after the decision and can never extend beyond:

- the remote-draft review deadline;
- retail-policy expiry;
- audiobook-rights expiry;
- mandatory deletion time;
- distributor-account evidence expiry;
- platform-authorization expiry for synthetic or mixed narration.

An expired decision requires fresh governance evidence and a new human decision.

## Exact remote-draft binding

The decision binds:

- the approved submission-review identity, revision and approval;
- the successful delivery-attempt fingerprint;
- the remote-draft reference hash;
- the earlier release-decision fingerprint;
- the package-review, inspection and package-manifest fingerprints;
- the exact track plan and retail policy;
- narration eligibility and platform-authorization state;
- audiobook-rights fingerprint;
- distributor-account evidence;
- media-file count, package bytes and file-set fingerprint.

The remote draft therefore cannot be replaced between review and submission authorization without invalidating the decision.

## Persistence and audit

The decision is stored as an immutable revision-one `audiobook-retail-submission-decision` entity.

Repeating an identical write is idempotent. Reusing the decision identifier for another review or source set is rejected.

Audit metadata records only:

- status;
- media-file count;
- total package bytes;
- submission method;
- one-attempt posture;
- whether platform authorization was present.

Credentials, remote-draft references, rights evidence, account references, reviewer identities and final confirmation identifiers are excluded from audit metadata.

## Privacy boundary

The public projection exposes:

- decision and book identifiers;
- distributor and policy version;
- narration source category;
- whether platform authorization was present;
- media-file count and total package bytes;
- submission method and one-attempt limit;
- decision and expiry times;
- status, revision and fingerprint.

It omits:

- project and package identifiers;
- submission-review, delivery-attempt and release-decision identities;
- package-review, inspection, manifest and track-plan identities;
- remote-draft reference hash;
- policy, rights, narration, authorization and account fingerprints;
- file-set and content hashes;
- reviewer, approver, operator, verifier, attestor and decision-maker identities;
- final confirmation identifier;
- credentials, URLs and private filesystem paths.

## Output boundary

`authorized-for-single-submission` means the exact independently reviewed remote draft may receive one human submission action while all governing evidence remains current.

It does not mean submitted, published, released, accepted, live, on sale or approved by ACX or Audible.

The next stage must record the actual submission action and a sanitized external receipt separately. Retailer processing, validation, acceptance and publication must remain later evidence-backed states.