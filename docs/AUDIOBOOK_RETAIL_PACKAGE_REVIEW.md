# Final human audiobook retail package review

Independent filesystem inspection proves that the private package contains the expected bytes. It does not prove that the package is editorially correct, pleasant to hear or ready for a release decision.

This stage therefore requires human review of the exact inspected package before any release confirmation can be considered.

## Exact subject binding

A review session is bound to:

- the exact package-inspection identity, revision and fingerprint;
- the exact governed package-manifest identity and fingerprint;
- the exact canonical package-manifest fingerprint;
- the exact ordered file set, hashes, sizes, roles and durations;
- the distributor policy snapshot;
- the commercial audiobook rights fingerprint;
- the inspection timestamp and aggregate package size.

A recomputed review-session fingerprint cannot substitute another package, file set, inspection or rights record.

## Independent review roles

Two distinct human roles are required:

```text
editorial
engineering
```

The same person cannot occupy both roles in the current review state. Automation, worker, system and bot identities are rejected.

Editorial review must use at least one consumer playback context. Engineering review must include studio headphones. Across both current reviews, the package must be covered on:

- studio headphones;
- consumer headphones;
- speakers.

Mobile-device playback is optional additional evidence.

## Complete package coverage

Each reviewer confirms the complete governed file list and canonical manifest and records playback coverage for:

- opening credit;
- first narrative material;
- narrative midpoint;
- final narrative material;
- closing credit;
- retail sample.

The reviewed file count must exactly match the inspected media-file count. A partial spot check cannot be recorded as a complete package review.

## Review dimensions

Each current review scores the package from one to five on:

- package completeness;
- file naming and order;
- credit accuracy;
- narrative continuity;
- transition and silence integrity;
- encoding consistency;
- retail sample quality;
- release readiness.

Readiness requires every current score to be at least four, no current finding codes and an approve decision from both roles.

## Changes and re-review

A changes-requested decision requires:

- at least one structured finding code;
- reviewer notes;
- a later clean review from the same role after the package has been corrected and independently inspected again where the bytes changed.

Historical review entries remain immutable. The latest entry for each role controls the current state.

## Third-person approval

Two approving reviews do not complete the stage automatically.

A third human release manager must provide:

```text
humanConfirmation: true
```

That person cannot be either current reviewer. Final approval revalidates:

- the exact inspection and file-set fingerprints;
- current commercial audiobook rights;
- current distributor-policy validity;
- current reviewer fingerprints and playback coverage.

Successful approval ends at:

```text
approved-for-release-decision
```

This means a separate release-decision workflow may now evaluate the package. It does not mean the package has been released, uploaded, submitted or accepted by a retailer.

## Persistence and audit privacy

The session is revisioned and integrity checked as:

```text
audiobook-retail-package-review
```

Audit metadata contains aggregate status, counts and booleans only. It omits:

- reviewer and release-manager identities;
- reviewer notes;
- private paths;
- file and inspection hashes;
- rights-record identifiers;
- final confirmation identity;
- canonical manifest contents.

## Public boundary

The safe projection exposes:

- book identifier and distributor;
- filenames, roles, durations and byte counts;
- review counts and current role decisions;
- aggregate playback contexts and score averages;
- safe finding codes;
- readiness and release-decision eligibility;
- revision, timestamps and session fingerprint.

It omits project and package identity, inspection evidence, file hashes, rights evidence, policy fingerprints, reviewer identities, notes and final confirmation details.

## Honest completion boundary

This stage deliberately stops before release.

The next stage must create a separately governed release decision and release-package artifact, revalidate the approved package-review fingerprint and require explicit human confirmation before changing any release status.