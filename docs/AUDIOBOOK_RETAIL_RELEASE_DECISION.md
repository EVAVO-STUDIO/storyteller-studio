# Governed audiobook retail release decision

A final package review does not itself permit an upload. The release-decision boundary converts an approved, independently inspected retail package into one short-lived authorization for one controlled manual delivery attempt.

## Admission boundary

The decision requires the exact approved chain:

```text
retail track plan
  + current retail policy
  + current narration eligibility
  + approved package manifest
  + independent package inspection
  + final human package review
  + current audiobook rights
  + recently verified distributor account access
  + independent publisher authority
  -> authorized-for-controlled-delivery
```

Every source is revalidated at decision time. A matching object shape or recomputed fingerprint cannot substitute another package, review, policy, narration record, rights record or distributor account.

## Distributor-specific scope

The first supported target is `acx-audible` through `manual-acx-upload`.

The v1 decision authorizes only the ability to place the approved files into the distributor account. It does not authorize an automated submission button, a public release, a listing change or a retailer acceptance claim.

## Narration eligibility

Human narration may proceed with a current human attestation.

Synthetic and mixed narration require a current Audible or ACX platform authorization scoped to the exact project, book and policy. Voice consent, provider licensing and commercial rights are not treated as platform authorization.

The release decision revalidates the narration evidence instead of trusting the earlier track-plan snapshot.

## Distributor account evidence

Account access is represented by a short-lived evidence record containing:

- exact project and book scope;
- a one-way account reference hash;
- permission to upload audiobook files;
- a human access verifier;
- verification and expiration dates;
- an immutable fingerprint.

Credentials, cookies, session tokens, passwords and raw account identifiers are not stored in the decision.

Account evidence may be valid for no more than 31 days. Expired or future-dated evidence cannot authorize delivery.

## Independent publisher authority

The release decision requires explicit human confirmation from a publisher authority who is independent of:

- the editorial package reviewer;
- the engineering package reviewer;
- the final package-review approver;
- the narration eligibility attestor;
- the distributor account access verifier.

Worker, bot, automation and system identities are rejected.

## Short-lived authorization

The decision authorizes exactly one delivery attempt.

Its validity window is capped at 72 hours and can never extend beyond:

- the retail policy expiry;
- commercial audiobook rights expiry;
- mandatory deletion time;
- distributor account evidence expiry;
- platform authorization expiry for synthetic or mixed narration.

A delivery worker must revalidate the decision before using it. An expired decision requires a new human decision rather than silent extension.

## Persistence and idempotency

The decision is stored as a revision-one immutable entity. Repeating an identical write is idempotent. Reusing the same decision identifier for another package or authorization is rejected.

Audit metadata is aggregate-only. It records status, file count, total package bytes, delivery method, one-attempt posture and whether platform authorization was present.

## Privacy boundary

The public projection exposes:

- decision and book identifiers;
- distributor and policy version;
- narration source category;
- whether platform authorization was present;
- media-file count and total package bytes;
- delivery method;
- one-attempt limit;
- validity window;
- status and fingerprint.

It omits:

- project and package identifiers;
- inspection and package-review fingerprints;
- rights and policy fingerprints;
- narration evidence identifiers;
- platform authorization identifiers and fingerprints;
- distributor account evidence and account-reference hash;
- reviewer, attestor, verifier and decision-maker identities;
- final confirmation identifier;
- file content hashes and file-set fingerprint;
- private filesystem paths and credentials.

## Output boundary

`authorized-for-controlled-delivery` means the exact reviewed package may be used for one bounded manual upload attempt while every governing record remains current.

It does not mean uploaded, submitted, published, released, accepted, live, on sale or approved by ACX or Audible.

The next stage must record a delivery attempt and its sanitized receipt separately. A later submission decision must remain distinct from file transfer, and retailer acceptance must be represented only by verified external evidence.