# Generation Material

A queue item records that a governed generation job may run. It does not contain the private text, performance direction, pronunciations, voice assignment, rights snapshot or cost ceiling needed to execute that job.

Storyteller Studio stores those inputs as a separate immutable generation-material record.

## Purpose

The separation prevents queue inspection and operator dashboards from becoming manuscript stores. It also prevents an internal worker from reconstructing or improvising production intent at execution time.

A material record binds one generation job to:

- exact segment text;
- immutable source hash;
- voice profile identifier and approved revision;
- complete performance direction;
- approved pronunciation entries and revisions;
- execution mode, storage format and sample rate;
- rights evidence and allowed uses;
- commercial-use posture;
- parent continuity or source artifacts;
- an optional fingerprinted natural-narration plan containing language and bounded neighbouring context;
- optional job cost policy.

## Immutable scope

A generation-material record is tied to the generation job through:

- job identifier;
- project identifier;
- segment identifier;
- job cache key;
- candidate count.

The store resolves material only for an active leased claim whose scope and cache identity match the stored record. A worker cannot attach text prepared for another segment, project, candidate plan or generation revision.

## Canonical production intent

Optional fields are normalised before fingerprinting:

```text
mode             → production
format           → wav
sample rate      → 48,000 Hz
intended use     → audiobook
commercial use   → true
pronunciations   → empty list
parent artifacts → empty list
```

Equivalent intent therefore produces one stable fingerprint whether defaults were omitted or written explicitly. Arrays and nested objects are copied into the record rather than retaining mutable caller-owned collections.

## Validation

Records fail before persistence when any of these conditions is present:

- invalid identifier, hash, date, currency or bounded number;
- empty or oversized text;
- unsafe control characters;
- direction for a different segment;
- invalid pace, intensity, warmth, restraint, clarity or pause values;
- duplicate pronunciation entries or duplicate written terms;
- unapproved pronunciation revisions;
- unsupported execution mode;
- raw PCM selected for durable provider output;
- duplicate or malformed parent artifact identifiers;
- unknown, duplicate or unauthorised rights uses;
- commercial production without commercial approval;
- expired rights;
- invalid or negative cost ceiling;
- a generation job that is not ready;
- an Audio Studio production job without a valid natural-narration plan;
- a natural-narration plan whose text, direction, source, context or candidate-count binding changed.

WAV, FLAC and MP3 are currently accepted as durable generation formats. Raw PCM needs an explicit container and media contract before it can enter private object storage.

## Idempotency

The entity identifier is derived from the job identifier. Creating the same canonical material again returns the existing revision.

Changing text, direction, pronunciation, voice revision, rights, format, cost policy or another immutable field while reusing the same job identifier fails with:

```text
GENERATION_MATERIAL_IDEMPOTENCY_CONFLICT
```

A retry can never silently redefine what a previously queued job means.

## Rights and timing

Rights are checked when the material record is created, and artifact rights are checked again when provider outputs are admitted and when release is assessed.

This repeated evaluation is intentional. A record may have been valid when a job was prepared but expired before execution or release. A future worker service must revalidate the stored rights snapshot against its actual execution time before invoking a provider.

## Private persistence

Generation material uses the integrity-checked project store entity type:

```text
generation-material
```

The envelope provides:

- optimistic revision checks;
- payload hash;
- envelope hash;
- atomic local writes;
- linked prior-envelope integrity where revisions are later introduced;
- safe identifier and path controls.

The initial record is immutable. Corrections require a newly governed generation job rather than replacing text beneath an existing queue item.

## Public view

The redacted material view may reveal operational metadata such as:

- project, job and segment identifiers;
- job cache key and material fingerprint;
- text hash and character count;
- voice revision number, but not the voice identifier;
- direction fingerprint, but not direction text;
- pronunciation count, but not terms or phonemes;
- execution mode, format and sample rate;
- rights record identifier, rights fingerprint and expiry;
- natural-narration plan and context fingerprints, context boundary and language;
- cost ceiling.

It does not reveal:

- manuscript text;
- character names or pronunciation entries;
- emotional objective, subtext or direction notes;
- preceding or following manuscript context;
- voice profile identifier;
- parent artifact identifiers;
- provider credentials;
- provider request identifiers;
- queue lease material;
- private object locators.

Ordinary audit metadata follows the same boundary. It records only scope, counts and fingerprints.

## Worker resolution

The internal service sequence is:

1. claim a ready queue item;
2. resolve its generation-material record;
3. revalidate rights, natural-narration context and execution policy;
4. start lease heartbeat;
5. invoke approved provider adapters;
6. persist and verify artifact evidence;
7. stop heartbeat before terminal transition;
8. complete, retry or block the queue item.

Material resolution is not exposed through the public HTTP API. The normal web application may show redacted readiness information but must not retrieve executable text or voice direction from this store.

## Production migration

The file-backed store proves the domain contract for local and isolated single-host work. Multi-instance production will use PostgreSQL transactions and row-level access controls while preserving the same:

- job-derived identity;
- canonical fingerprint;
- immutable scope;
- rights checks;
- redacted public projection;
- audit-data minimisation;
- fail-closed worker resolution.
