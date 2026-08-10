# Narrator profile admission

Audio Studio owns model training and profile promotion. Storyteller owns casting,
chapter direction, listening review, mastering approval and complete-book authority.

A valid `evavo_storyteller_narrator_voice_profile_v1` proves that one exact Audio
Studio model revision passed its governed short-form tournament and single-use
continuous holdout. The profile-admission boundary additionally proves whether that
model is zero-shot or adapted, and, for an adapted model, which exact training
campaign produced its immutable artifact tree.

## Zero-shot admission

A zero-shot profile must arrive with:

```text
trainingProvenanceBound=false
training=null
```

Storyteller rejects a zero-shot profile that carries an invented training campaign,
checkpoint, receipt or capability claim.

## Adapted admission

An adapted profile must carry one exact
`evavo_narrator_training_provenance_v1` record. It binds:

- the reviewed Audio Studio training portfolio;
- the execution-ready campaign plan and its objective;
- the exact adaptation capability and recipe evidence;
- the exact engine revision, adapter and engine lock;
- the immutable narrator, training and validation dataset fingerprints;
- disjoint training and validation partition fingerprints;
- the training request and completed training receipt;
- the validation report and selected checkpoint;
- the final model file count, byte count and artifact-tree SHA-256; and
- the conservative resource policy used to schedule the route.

The training provenance must match the already holdout-approved profile's engine,
training lock, narrator dataset and final model artifact tree. Rehashing a substituted
checkpoint, lock, dataset or model does not make the admission valid.

## Resource boundary

Training VRAM, system-memory and disk figures are planning estimates rather than
quality or execution authority. Every adapted admission retains:

```text
resourceEstimateOnly=true
liveResourcePreflightRequired=true
```

The private Audio Studio executor still performs the exact CUDA, precision, model,
optimizer, batch, storage and device checks before training starts.

## Cross-repository hash contract

Audio Studio and Storyteller both hash canonical JSON by recursively sorting object
keys, preserving array order, serialising without formatting whitespace and appending
one newline before SHA-256. Storyteller validates both:

```text
evavo_narrator_training_provenance_v1
evavo_storyteller_narrator_profile_admission_v1
```

The admission rejects undeclared fields and recursively rejects private paths, roots,
commands, credentials, raw text, transcripts, stdout/stderr and reviewer identities.

## Casting

`approveNarratorCastingFromAdmission` remains the low-level exact-profile casting
primitive. Direct narrator production does not consume its standalone casting document.
Production uses `approveAdmittedNarratorCasting`, which validates the complete profile
admission, creates the human casting approval and binds both documents into
`storyteller-admitted-narrator-casting-v1`.

The profile admission itself retains:

```text
profileAdmissionEligible=true
castingApproved=false
defaultNarrator=false
exactRevisionRequired=true
titleReleaseAuthority=false
publicationAuthority=false
```

The admitted casting separately records the explicit human decision while retaining:

```text
admissionVerified=true
castingApproved=true
defaultNarrator=false
exactRevisionRequired=true
chapterListeningApprovalRequired=true
titleReleaseAuthority=false
publicationAuthority=false
```

A raw casting approval can no longer be passed directly into narrator job creation,
queue admission or the guarded narrator worker. Those boundaries require the exact
admitted-casting fingerprint and profile-admission hash. See
`docs/NARRATOR_CASTING_ADMISSION.md` for the private CLI and production-job contract.

The public profile-admission view exposes only bounded profile identity, mode, whether
training provenance exists, the adaptation method and whether an exact checkpoint/model
binding exists. It redacts dataset, checkpoint, capability, receipt and engine-lock
evidence.

## Complete-book authority remains separate

Profile admission and admitted casting do not approve generated chapter audio. Every
chapter must still pass exact-source generation, objective monitoring, complete
independent listening, mastering review and narrator-bound sequence admission. The
assembled reference master then requires its own continuous whole-book review before
any release or publication decision.
