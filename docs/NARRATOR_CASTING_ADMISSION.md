# Narrator casting admission

Storyteller production no longer accepts a standalone narrator casting approval.
A production casting must be represented by one exact
`storyteller-admitted-narrator-casting-v1` document created from a validated Audio
Studio profile admission and an explicit human Storyteller casting decision.

## Why this boundary exists

A profile hash proves which narrator revision was selected, but by itself it does not
prove that Storyteller reviewed the profile-admission chain that produced it. In
particular, a raw `storyteller-narrator-casting-v1` document does not retain the
zero-shot/adapted distinction, selected training provenance or profile-admission hash.

The admitted casting closes that gap by binding:

- the complete validated `evavo_storyteller_narrator_profile_admission_v1` document;
- the exact human `storyteller-narrator-casting-v1` approval;
- the Storyteller project identity;
- the exact profile ID, revision and profile hash;
- the engine, voice identity, model artifact tree, rights and evidence hashes; and
- a deterministic admitted-casting fingerprint.

Rehashing the outer document cannot replace the profile admission, model tree, rights
evidence, narrator revision or underlying casting because both nested documents are
validated again and cross-bound before production.

## Creation

The dedicated private CLI creates the admitted casting:

```text
npm run narrator-production --workspace=@evavo/storyteller-cli -- cast \
  --admission ./private/profile-admission.json \
  --project-id book_001 \
  --approved-by operator_greg \
  --approved-at 2026-08-10T18:45:00+10:00 \
  > ./private/casting-admission.json
```

This command does not train a model, generate audio, approve a chapter or publish a
title. It records one human casting decision after validating the complete profile
admission.

## Production jobs and queue admission

Jobs and queue admission now require `--casting-admission` rather than `--casting`:

```text
npm run narrator-production --workspace=@evavo/storyteller-cli -- jobs \
  --project ./private/project.json \
  --casting-admission ./private/casting-admission.json \
  --candidates 3

npm run narrator-production --workspace=@evavo/storyteller-cli -- queue \
  --project ./private/project.json \
  --casting-admission ./private/casting-admission.json \
  --candidates 3 \
  --data-dir ./private/storyteller-data
```

Every `storyteller-narrator-production-job-v2` stores only the bounded identities needed
at execution time:

```text
narratorProfileAdmissionHash
narratorAdmittedCastingFingerprint
narratorCastingFingerprint
narratorVoice.profileId
narratorVoice.revision
narratorVoice.profileHash
```

The full profile admission is not copied into public queue views. Queue and worker
validation recheck the exact admitted-casting fingerprint, profile-admission hash,
underlying casting fingerprint and voice pin before provider code can run.

## Legacy casting documents

A raw `storyteller-narrator-casting-v1` document remains useful as the human decision
inside an admitted casting and for downstream review records. It is no longer sufficient
as direct narrator-production authority. Passing one where an admitted casting is
required fails closed with `NARRATOR_CASTING_ADMISSION_*` or
`NARRATOR_PRODUCTION_CASTING_ADMISSION_REQUIRED`.

## Public view and privacy

`admittedNarratorCastingPublicView` exposes only bounded project and narrator identity,
whether training provenance exists, the profile-admission hash and the admitted-casting
fingerprint. It does not expose:

- the selected checkpoint;
- training, validation or narrator dataset fingerprints;
- training receipts, capability or engine-lock evidence;
- model artifact-tree, rights or evidence hashes;
- the raw casting fingerprint; or
- the human approver identity.

The full admitted casting is a private production document and must remain in the
private Storyteller data boundary.

## Authority remains separated

Every admitted casting retains:

```text
admissionVerified=true
castingApproved=true
exactRevisionRequired=true
chapterListeningApprovalRequired=true
defaultNarrator=false
titleReleaseAuthority=false
publicationAuthority=false
```

Profile admission and casting do not approve generated audio. Chapter listening,
mastering, whole-book review, retail release and publication remain separate governed
human decisions.
