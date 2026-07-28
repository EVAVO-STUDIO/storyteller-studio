# Governed audiobook credit-master promotion

Status: executable private foundation 0.2.0  
Scope: approved opening and closing credit audio

## Purpose

An approved credit take must remain identifiable as an opening or closing component when it moves into complete-book production.

Storyteller Studio promotes the selected take into a distinct `credit-master` artifact without re-rendering, normalising or silently changing the approved bytes. The selected audio candidate remains a separate source artifact with its own revision history.

## Preconditions

Promotion requires:

- an approved credit-take review session;
- a non-stale selected candidate;
- latest independent editorial and engineering approvals;
- a verified selected audio-candidate artifact;
- verified transcript and engineering artifacts;
- exact source artifact snapshots from the selected take record;
- matching project, job, segment and take scope;
- matching parent relationships;
- matching current rights for audiobook and commercial use;
- lossless WAV or FLAC bytes that match the selected audio hash and size;
- a promotion time after review approval and source evidence.

A plausible object with recomputed fingerprints cannot replace the persisted artifact envelopes.

## Source approval

The selected audio candidate begins as technically verified but creatively pending. Promotion records an approved artifact revision using the final human credit-take approval.

The immutable media, storage, provenance and rights fields remain unchanged. Only the revisioned review state changes.

A retry may observe that source approval already exists and reuse it idempotently.

## Private review evidence

The complete review session is retained as a private JSON evidence artifact. Its bounded summary records:

- session identity, revision and fingerprint;
- book and opening or closing role;
- selected take and source audio identities;
- selection and approval fingerprints;
- latest editorial and engineering review fingerprints;
- selection and approval times.

The evidence artifact has the selected audio, transcript and engineering artifacts as parents. It is integrity-verified but does not require a second human review.

## Lossless credit master

The `credit-master` artifact stores the exact selected bytes.

Its content hash and byte count must equal the approved source audio. It identifies these parents:

1. approved selected audio candidate;
2. transcript evidence artifact;
3. independent engineering artifact;
4. private credit-review evidence artifact.

The master is integrity-verified through the normal private-object and artifact pipeline. The final credit-take approver then approves the master revision because no audio transformation occurred.

If processing is later required, it must create a separate mastering plan, render, engineering analysis and artifact revision rather than editing this master in place.

## Evidence chain

The returned private chain contains integrity-checked envelopes for:

- approved source audio;
- verified transcript artifact;
- verified engineering artifact;
- private review evidence;
- approved credit master.

The chain validates store envelope hashes, artifact revisions, parent edges, content identity, verification and review state, role and complete chain fingerprint.

Repeated identical promotion returns the same artifact envelopes and chain fingerprint.

## Public boundary

The bounded public projection may expose:

- book and opening or closing role;
- selected take record identifier;
- credit-master identifier and revision;
- lossless format;
- verification and review status;
- book-assembly eligibility;
- creation time and chain fingerprint.

It omits:

- credit text;
- source, transcript, engineering and review-evidence artifact identifiers;
- content hashes and byte counts;
- private storage and provider request data;
- provider, model and calibration-session identity;
- rights evidence;
- reviewer, selector and approver identities;
- review notes and engineering command evidence.

## Current boundary

Credit-master promotion creates an approved, lossless opening or closing component. It does not place that component into the final book timeline, create retail encodes, generate a release package or release anything.

Complete-book assembly must require one approved opening credit master, the approved ordered chapter sequence and one approved closing credit master.
