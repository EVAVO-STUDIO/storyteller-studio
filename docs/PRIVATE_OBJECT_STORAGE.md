# Private Object Storage

Storyteller Studio treats generated audio, analysis, transcripts and visual media as private production evidence. Raw bytes are not embedded in project manifests, queue records, web payloads or durable launch metadata.

## Content-addressed storage

Final local objects use a SHA-256 content address:

```text
sha256/<first-two>/<next-two>/<full-hash>.<verified-extension>
```

The object key is derived from observed bytes and detected media format, not from a user-supplied filename. Identical bytes converge on the same immutable object. A different payload cannot silently replace an existing content address.

The local implementation is for development, offline production and one isolated host. Multi-instance production will retain the same integrity contract with PostgreSQL and private object storage.

## Staging before promotion

Bytes first enter a private staging area through exclusive file creation. The stage record captures:

- a cryptographically random staging identifier;
- SHA-256 content hash;
- byte count;
- detected MIME type and format;
- accepted media signature;
- intended content-addressed object key;
- creation time;
- a fingerprint covering the complete stage record.

The staged file is read back before promotion. Changed bytes, changed length, changed media identity or changed stage metadata stop the transition.

## Media signature validation

Supported media is identified from bytes rather than trusted extensions:

- RIFF/WAVE audio;
- FLAC;
- MPEG audio;
- PNG;
- JPEG;
- WebP;
- ZIP;
- valid UTF-8 JSON;
- WebVTT;
- plain UTF-8 text.

Empty input, unsupported binary data, malformed JSON and mismatched MIME or format claims fail before a production artifact record is created.

This is a minimum signature gate, not a complete media decoder or malware scanner. Production workers will add format-specific parsing, duration and stream inspection, antivirus policy where required, and FFmpeg or equivalent analysis before release use.

## Pending record before verification

A successful promotion does not make media approved.

The ingestion coordinator creates a revision-one artifact record in `pending` verification state. That record contains the private storage reference, immutable integrity declaration, provider provenance, project scope, rights snapshot and human-review requirement.

The final object is then reinspected from storage. The artifact becomes a second revision with one of two outcomes:

```text
pending → verified
pending → quarantined
```

A verified revision requires matching SHA-256 hash, byte count, MIME type, format and accepted media signature. Verification and review remain separate decisions.

## Quarantine instead of approval

A failed reinspection, hash mismatch, byte-count mismatch or media-identity mismatch creates a durable quarantine revision. It does not delete the evidence, approve the object or allow queue completion.

A quarantined artifact must be investigated, rejected or replaced through another governed artifact record. The existing record and its revision chain remain auditable.

## Idempotent ingestion

Retrying the same artifact identifier with the same immutable scope, bytes, provenance and rights returns the existing artifact chain. It does not create another approval or verification revision.

Reusing an artifact identifier for different immutable bytes, storage identity, provenance, rights or review policy fails with an idempotency conflict. A retry can never rewrite what an artifact identifier means.

## No public write API

The normal Storyteller HTTP application may expose authenticated, redacted artifact reads. It does not expose object upload, staging, promotion, verification, worker completion, review or release endpoints.

Private object writes belong to an internal worker boundary with server-only credentials and explicit project governance. Browser code must never receive filesystem paths, private object keys, storage version identifiers, provider request identifiers or worker lease material.

## Queue completion

A provider response is not queue completion.

The worker must:

1. stage returned bytes;
2. promote and reinspect the immutable object;
3. create the pending artifact record;
4. persist a verified artifact revision;
5. assemble the exact candidate bundle required by the generation job;
6. complete the queue item using governed artifact and take identifiers only.

Quarantined, pending, wrong-project, wrong-job, wrong-segment or wrong-candidate-count artifacts cannot satisfy queue completion.

## Retention and orphan reconciliation

Content-addressed promotion may succeed immediately before a registry conflict or process interruption. That can leave an immutable object without a live artifact reference.

Production maintenance therefore requires Orphan reconciliation rather than unsafe immediate deletion:

- enumerate staged files older than a bounded grace period;
- enumerate immutable objects and registry references;
- retain objects referenced by any current or historical artifact revision;
- preserve objects under legal hold or retention policy;
- quarantine ambiguous state;
- delete only after a separately authorised retention decision;
- record the maintenance decision without storing private object paths in ordinary audit metadata.

The initial file store provides safe staging discard and immutable promotion. Full orphan enumeration, retention holds and deletion authorisation remain a later production slice.

## Production migration

The final production topology will use:

- PostgreSQL and private object storage;
- transactional artifact and queue metadata;
- conditional object creation or version-aware writes;
- server-side encryption and restricted service identities;
- regional and retention policy controls;
- bounded signed reads created only after authorisation;
- no durable signed URL in project state;
- automated integrity, media and safety analysis;
- explicit human review before chapter assembly and release;
- an independent final release confirmation.

The local file implementation exists to prove these domain and safety contracts without pretending to be distributed storage.
