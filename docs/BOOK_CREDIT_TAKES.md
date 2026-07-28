# Governed audiobook credit takes

Status: executable private foundation 0.2.0  
Scope: generated opening and closing credit candidates

## Purpose

A generated opening or closing credit is not ordinary manuscript narration and must never be treated as one merely because both are audio candidates.

Storyteller Studio creates a dedicated credit-take record that binds an approved credit-generation plan to its exact audio candidate, transcript evidence and independent engineering evidence. The record preserves whether the take is an opening or closing credit throughout review, mastering, book assembly and release.

## Evidence chain

A credit take may be admitted only from this complete chain:

1. an approved, revisioned credit script;
2. a calibrated credit-generation plan;
3. a verified audio-candidate artifact;
4. a verified transcript or transcript-assessment artifact;
5. exact transcript-fidelity evidence;
6. a verified independent audio-analysis artifact;
7. independently measured engineering evidence;
8. matching rights, project, job, segment and take scope.

The transcript and analysis artifacts must both identify the audio candidate as their parent.

## Exact wording

Credit wording is legally and editorially sensitive. The transcript evidence therefore preserves:

- approved source-text hash;
- observed transcript hash;
- source and observed character counts;
- exact-match state;
- first mismatch position when applicable;
- final-word coverage;
- assessment time;
- immutable evidence fingerprint.

The source and observed text are used during assessment but are not copied into the transcript-evidence record.

A text can become eligible only when the observed transcript exactly matches the approved credit script and retains the final word.

## Technical evidence

Independent engineering evidence must bind to the audio candidate's exact content hash and byte count. The analysis artifact must also record that audio candidate as its parent and source content.

Provider self-reporting cannot certify sample rate, channel layout, loudness, peaks, noise floor, clipping, silence or duration.

## Classification

A structurally valid take receives one of two states:

- `eligible-for-review` — transcript and engineering gates passed;
- `blocked` — the evidence is retained, but one or more quality gates failed.

Transcript drift, a missing final word or failed independent engineering blocks the take. Structural errors such as the wrong project, provider, parent, rights snapshot or evidence hash reject admission entirely.

## Durable record

The immutable record stores:

- opening or closing role;
- credit plan and approved script revision;
- job, segment and take scope;
- voice revision and calibration-lock fingerprint;
- revisioned artifact snapshots for audio, transcript and engineering;
- transcript-evidence fingerprint;
- engineering profile and evidence fingerprint;
- eligibility, findings and status;
- record fingerprint.

A repeated identical write is idempotent. Reusing the record identifier for different evidence is rejected.

## Privacy boundary

The normal public view may expose:

- book and credit role;
- plan and take identifiers;
- script revision and text hash;
- voice revision;
- exact-transcript and final-word flags;
- engineering profile version;
- eligibility, status and safe finding codes.

It omits:

- approved credit text;
- artifact identifiers and private storage references;
- audio content hashes and byte counts;
- provider and model identity;
- calibration session and reference takes;
- rights evidence;
- reviewer and approver identity;
- private engineering command details.

## Current boundary

Credit-take admission classifies verified candidates for review. It does not approve a candidate, create a credit master, add the credit to the book sequence, expose audio bytes or release anything.

A later credit-review workflow must select and approve one take before opening or closing credit audio can participate in complete-book assembly.
