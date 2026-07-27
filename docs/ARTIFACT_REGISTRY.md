# Governed production artifact registry

Status: executable foundation 0.2.0  
Scope: narration, analysis, illustration, chapter assembly and release artifacts

## Purpose

A generation job is an instruction to produce media. It is not proof that media exists, that the bytes are intact, that the result is safe to use, or that a reviewer approved it.

Storyteller Studio therefore separates three things that must never be collapsed into one status:

1. **Generation intent** — a durable queue item describing what an authorised worker may attempt.
2. **Production artifact** — a registered immutable object with integrity, provenance, rights, verification and review state.
3. **Release decision** — an explicit final confirmation over a verified dependency graph.

The queue can report that work completed only after it receives valid artifact references. A release can become available only after every required dependency has passed its own gates.

## Artifact kinds

The registry supports the media and evidence records needed by the production pipeline:

- audio candidates;
- transcripts;
- word-alignment maps;
- waveforms;
- audio-analysis reports;
- illustration layers;
- visual renders;
- chapter masters;
- release packages.

These are separate records because they have different formats, reviewers, retention needs and failure modes. A waveform is not an audio master. A transcript is not proof that an audio file is complete. A release ZIP is not approved merely because it can be opened.

## Immutable identity and integrity

Every artifact carries:

- a stable artifact identifier;
- project, generation-job, segment and take scope where applicable;
- SHA-256 content hash;
- exact byte count;
- MIME type and explicit format;
- revision number;
- creation and update timestamps;
- a fingerprint over the complete governed record;
- a link to the prior fingerprint after each decision.

The registered hash and byte count describe the immutable object expected in storage. Verification records the independently observed hash and byte count. An object cannot be marked verified when those observations differ.

Tampering with the record itself is also detected because its fingerprint covers storage metadata, integrity, provenance, rights, verification, review and release state.

## Private storage boundary

The registry stores a private object reference, not a browser-ready URL.

A storage reference identifies:

- the storage driver;
- the private storage provider;
- the private container or bucket;
- the object key;
- an optional object version;
- an optional processing region.

Object keys are rejected when they contain:

- a URL scheme;
- an absolute path;
- traversal segments;
- query strings or fragments;
- backslashes;
- empty or current-directory path segments.

The public artifact view deliberately removes the container, object key, version identifier and provider request identifier. A later download service must perform authorisation, entitlement, workspace isolation, retention and release checks before creating a short-lived delivery URL.

No signed URL is durable project state.

## Provenance

Provider-generated media records:

- the generation job and immutable segment;
- the candidate take identifier;
- source-content hash;
- deterministic generation-request hash;
- provider identifier;
- adapter version;
- private provider request identifier;
- parent artifact identifiers.

Chapter masters and release packages must identify their input artifacts. The dependency graph makes it possible to prove which approved takes, reports and masters contributed to a release without embedding raw media in database rows or queue state.

## Rights and retention

Each artifact snapshots the rights evidence used when it was created:

- rights-record identifier and fingerprint;
- permitted project uses;
- commercial-use approval;
- optional expiry;
- optional retention date;
- optional mandatory deletion date.

Queue completion and release are evaluated against the intended use and the current time. Expired rights, an unauthorised use, disallowed commercial use or a reached deletion deadline blocks the operation.

The snapshot does not replace the canonical rights register. It preserves what the worker and reviewer relied on at the time and allows later policy changes to be compared explicitly.

## Verification before review

An artifact begins in `pending` verification state.

Verification may assess, as appropriate:

- SHA-256 content hash;
- byte count;
- media signature and container validity;
- malware and safety scanning;
- decodability;
- sample rate, channels and duration;
- transcript and final-word coverage;
- expected image or video dimensions;
- alpha, depth or mask structure;
- report schema;
- parent-reference integrity.

When an error-level finding exists, the artifact is quarantined instead of being treated as usable. A mismatch never becomes a low weighted score that can be compensated for by another metric.

A reviewer cannot approve a pending, quarantined or rejected artifact.

## Human review

Human review is required by default for:

- audio candidates;
- illustration layers;
- visual renders;
- chapter masters;
- release packages.

Technical analysis records can be configured as review-not-required when their schemas and verification checks are sufficient, but they still require integrity verification.

Review decisions are revisioned and non-destructive. A decision records the reviewer, time and notes. A later quarantine resets an earlier approval because the approved object can no longer be assumed safe or intact.

`changes-requested` requires an explanation. It is not an implicit rejection and does not destroy the earlier artifact.

## Queue-completion gate

A generation queue item may complete only when its artifact bundle satisfies all of these conditions:

- the generation job was ready rather than governance-blocked;
- artifact records are structurally valid and fingerprinted;
- every artifact belongs to the same project, job and segment;
- every artifact is integrity-verified;
- rights remain valid for the intended use;
- parent references resolve inside the admitted bundle;
- audio-candidate take identifiers are unique;
- the number of verified audio candidates equals the job candidate count.

The queue completion record stores artifact identifiers and the execution-report hash. It does not store raw audio, private object keys, provider credentials or lease secrets.

Completing generation does not approve a take and does not release anything.

## Release gate

A release is assessed by walking the dependency graph from a `release-package` artifact.

Every reachable artifact must:

- belong to the same project;
- have a valid fingerprint;
- be integrity-verified;
- have an approved human review where review is required;
- remain rights-valid for the release use;
- resolve all parent references;
- avoid dependency cycles.

An audiobook release package must depend on at least one verified and approved chapter master.

After those checks pass, release still requires:

- a final-confirmation identifier;
- an authenticated releasing actor;
- a release time.

This produces another linked artifact revision. It does not mutate the stored bytes or rewrite earlier decisions.

## Quarantine and rejection

Quarantine is reversible governance state. It isolates an artifact while an integrity, safety, legal or creative concern is investigated.

Rejection is a terminal decision for that artifact revision. Regeneration or corrected assembly should create a new artifact record rather than altering the rejected bytes.

Examples of quarantine causes include:

- content-hash mismatch;
- byte-count mismatch;
- malformed media container;
- malware or safety scan finding;
- missing or contradictory provenance;
- rights uncertainty;
- severe transcript mismatch;
- unexpected visual content;
- later evidence that invalidates an earlier review.

## Public and operator surfaces

Normal web, API and CLI surfaces may expose bounded status information such as:

- artifact identifier and kind;
- project, job, segment and take identifiers;
- content hash, byte count, MIME type and format;
- verification, review and release state;
- safe provider identity and adapter version;
- parent artifact identifiers;
- revision and fingerprint.

They must not expose:

- private bucket or container names;
- object keys;
- object-version identifiers;
- provider request identifiers;
- credentials;
- signed download URLs;
- raw media bytes;
- raw manuscripts;
- worker lease tokens.

## Production persistence path

The executable foundation is storage-driver neutral. The production implementation should retain the same contracts while using:

- PostgreSQL for revisioned artifact metadata, relationships, approvals and audit events;
- private object storage with versioning, encryption and lifecycle policy for media bytes;
- content-addressed temporary upload locations;
- server-side finalisation after hash and media verification;
- workspace-scoped access control;
- short-lived authorised delivery links;
- retention and deletion workers;
- backup and restore procedures that preserve metadata-to-object consistency.

The existing file project store remains useful for local development, isolated workers and deterministic fixtures. It is not presented as a distributed multi-instance artifact database.

## Worker sequence

A production worker should follow this order:

1. claim a generation lease;
2. resolve rights, budget and provider configuration server-side;
3. synthesise or render into a content-addressed temporary object;
4. calculate hash and byte count from the completed bytes;
5. create a pending artifact record;
6. verify format, integrity, safety and required quality evidence;
7. quarantine failed output or retain the verified artifact;
8. admit the complete verified candidate bundle to queue completion;
9. leave creative approval to the review workflow;
10. never auto-release from a worker.

This order ensures that a successful provider response is treated as untrusted input until Storyteller Studio verifies and governs the resulting artifact.
