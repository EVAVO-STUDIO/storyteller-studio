# Governed audiobook retail sample playback review

A technically valid retail sample is not automatically an approved public preview. This layer requires complete post-render human playback review of the exact private sample artifact revision.

The workflow ends at `approved`. It does not add the sample to a release package, upload it or claim retailer acceptance.

## Review subject

A review session can be created only from a sample chain that is:

- structurally valid;
- eligible for review;
- free of unresolved engineering findings;
- bound to a verified `audiobook-retail-sample` MP3;
- still at artifact review status `pending`;
- non-quarantined;
- covered by current commercial audiobook rights;
- bound to matching engineering evidence and profile.

The session snapshots the exact sample artifact identifier, revision, fingerprint, content hash, byte count and pending-review fingerprint. It also binds the sample chain, plan and engineering evidence.

A later artifact revision or another rendered sample cannot inherit the session.

## Complete playback review

Every reviewer must confirm playback of the complete rendered sample, allowing only a one-second measurement tolerance. Spot checks and waveform-only review cannot satisfy the gate.

Each review confirms:

- the opening boundary begins naturally;
- the closing boundary ends naturally;
- no word, phrase or sentence is truncated;
- the excerpt remains continuous with its audiobook source;
- the excerpt remains suitable and representative as a retail preview;
- the approved content-safety posture remains true after rendering;
- the encoded sample is clear and free of audible defects.

Reviewers score:

- start-boundary integrity;
- end-boundary integrity;
- content continuity;
- representativeness;
- spoken clarity;
- encoding transparency;
- level and tonal consistency;
- freedom from defects.

Every dimension uses a five-point scale. Approval readiness requires at least four in every dimension from both current reviews.

## Independent roles and playback contexts

Two human roles are mandatory:

- `editorial` for continuity, representation, content and listener experience;
- `engineering` for encoded quality, levels, silence, boundaries and defects.

The current editorial and engineering reviewers must be different people. Bot, worker, automation and system identities are rejected.

The review set must cover:

- consumer headphones;
- speakers;
- studio headphones.

Engineering review specifically requires studio headphones. Editorial review requires at least one consumer playback context.

## Changes and re-review

A changes-requested decision must include at least one stable finding code and reviewer notes. The session remains `changes-requested` until the latest review for every role approves the exact same sample artifact.

Review history is append-only. A later clean re-review supersedes the role’s prior decision without deleting the original finding.

## Final human approval

Two approving role reviews do not themselves approve the artifact.

A third independent human must provide:

- a final confirmation identifier;
- `humanConfirmation: true`;
- a valid human approver identity;
- an approval time after both reviews.

The approver cannot be either current role reviewer. Rights are rechecked at approval time.

Successful approval creates a new immutable artifact revision through the central artifact registry. The approval record binds:

- reviewer-set fingerprint;
- approved artifact review fingerprint;
- approved artifact revision;
- approved artifact fingerprint;
- final confirmation and approval time.

The original verified pending-review sample is never overwritten.

## Structural and cross-source validation

The session validator checks:

- schema, identifiers and hashes;
- exact sample snapshot;
- complete-listen duration;
- role and context requirements;
- score bounds;
- finding and note rules;
- chronology;
- revision and previous-fingerprint chain;
- state derived from latest role decisions;
- independent reviewers and approver;
- approval fingerprint and artifact revision relationship.

A separate cross-source validator rebinds the session to the original sample chain. Approved sessions additionally require the exact approved artifact revision.

A recomputed session fingerprint around another plan or chain cannot replace the reviewed subject.

## Persistence and audit privacy

The file-backed store provides:

- idempotent create;
- optimistic expected-revision writes;
- complete envelope validation on read;
- stale-write rejection;
- append-only audit events.

Public and audit projections omit:

- sample artifact identity and hashes;
- sample chain and plan fingerprints;
- reviewer and approver identities;
- final confirmation identifier;
- reviewer notes;
- rights evidence;
- private media and storage details.

Audit metadata contains only aggregate state such as status, review count, reviewer count, playback-context count, finding count and readiness.

## Current boundary

An approved session proves that the exact engineered `RetailSample.mp3` revision has passed complete independent editorial and engineering playback review plus third-person confirmation.

It does not yet prove that the sample and all audiobook tracks have been placed into a deterministic package, independently re-opened from that package, uploaded to a distributor or accepted by a retailer.

The next layer must build a private release manifest from the approved track revisions and approved retail sample, then independently inspect that manifest and every packaged file before final package review.