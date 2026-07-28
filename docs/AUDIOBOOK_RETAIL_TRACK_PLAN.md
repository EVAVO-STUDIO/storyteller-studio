# Governed ACX retail track plan

The ACX track-plan boundary turns one approved lossless audiobook reference master into deterministic delivery-file intent. It does not encode audio and it does not infer approval from a successful render.

The planner binds every proposed file to the exact approved sequence, reference-master chain, whole-book review, approved reference artifact, current ACX policy and narration-eligibility evidence.

## Admission chain

A plan can only be created from this complete evidence chain:

```text
approved audiobook sequence
  -> verified reference-master chain
  -> complete editorial and engineering listening review
  -> independent final human approval
  -> approved reference-master artifact revision
  -> current ACX retail policy
  -> current title-scoped narration eligibility
  -> ACX retail track plan
```

The planner revalidates:

- sequence identifier, revision and fingerprint;
- complete component count and duration;
- reference-chain fingerprint and eligibility;
- exact approved reference artifact revision and fingerprint;
- unchanged reference content hash and byte count;
- artifact review identity and approval time;
- current commercial audiobook rights;
- current retail-policy fingerprint;
- exact project and book scope of narration eligibility;
- synthetic or mixed narration platform authorisation when required.

A pre-review reference artifact, another title’s narration evidence, an expired policy or stale rights cannot enter track planning.

## Exact source ranges

When the plan is ready, each ACX file maps to one complete approved sequence component:

- opening credit;
- prologue, chapter or epilogue;
- closing credit.

Every track stores the exact source start, source end, duration, component fingerprint and approved source-artifact snapshot. The ranges remain contiguous from the beginning to the end of the approved reference master.

The planner does not trim silence, normalise audio, change gain, reorder components, combine chapters or regenerate headers.

## Deterministic ASCII file names

File names are generated from position and semantic role rather than user-entered titles. This avoids accidental punctuation, Unicode, path separators or inconsistent manual naming.

Examples:

```text
0001OpeningCredits.mp3
0002Prologue.mp3
0003Chapter0001.mp3
0004Epilogue.mp3
0005ClosingCredits.mp3
```

The base name contains only standard ASCII letters and digits. The `.mp3` extension is fixed by the reviewed ACX policy.

Generic file names also avoid copying manuscript, chapter-title or series text into worker logs and operational records.

## Output intent

Every ready track inherits one immutable output profile:

- MP3 codec and container;
- constant bit rate;
- reviewed 192, 256 or 320 kbps setting;
- 44.1 kHz sample rate;
- the approved book’s consistent mono or stereo channel layout.

The track plan records encoding intent only. A later shell-free renderer must still prove its actual codec, bit rate, sample rate, channels, duration and content hash.

## Header evidence

ACX requires every file to begin with its section heading. The planner relies on the approved whole-book review, whose editorial and engineering reviewers listened to every component and every transition and scored chapter labelling and credit accuracy.

Every track therefore records:

- its required header kind;
- that a section header is required;
- that the complete component was reviewed under the exact reference approval;
- that no secondary header is required for an unsplit component.

The planner does not generate or insert spoken words.

## Preservation blockers

A blocker produces no provisional tracks. This prevents an invalid partial plan from being mistaken for encode-ready work.

### Reference duration drift

Sequence offsets are safe extraction boundaries only when the approved reference duration exactly matches the sequence duration. Any non-zero drift blocks the plan and requires sample-accurate boundary review.

The system does not assign all drift to the closing credit or guess that it is harmless probe rounding.

### Sample-rate conversion

A production master that is not already 44.1 kHz requires a separately reviewed conversion plan. The track planner does not silently resample the approved master.

This preserves the reviewed WAV and makes conversion evidence, filter settings, dither and post-conversion engineering explicit in a later domain.

### Sections longer than two hours

A prologue, chapter or epilogue longer than 120 minutes cannot become one ACX file. The planner blocks it and requires:

- an approved split point;
- new approved secondary-header audio;
- a governed split plan;
- renewed whole-book or affected-boundary review.

It never cuts a chapter at an arbitrary timestamp and never fabricates “continued” narration.

### Overlong credits

Opening or closing credits longer than 120 minutes are blocked for manual restructuring. They are never split automatically.

## Ready state

A plan is `ready-for-encoding` only when:

- every source and approval relationship is exact;
- the ACX policy and narration evidence are current;
- rights remain current;
- reference duration drift is zero;
- the source master is already 44.1 kHz;
- every component is at most 120 minutes;
- every generated file name is unique and ASCII-safe;
- every source range is contiguous;
- the final range ends at the exact approved reference duration.

A blocked plan contains no tracks and one or more immutable blocker records.

## Tamper resistance

Track, blocker and plan records are independently fingerprinted.

Structural validation protects file names, ranges, duration, output settings, role order, readiness state and fingerprint integrity. Cross-source validation then recreates the expected plan from the approved evidence and compares the complete fingerprint.

This distinction is deliberate. A recomputed hash can make a changed artifact identifier structurally self-consistent, but it cannot make it the source approved by the book sequence and whole-book review.

## Privacy boundary

The public projection exposes:

- distributor and policy version;
- narration source kind;
- output settings;
- safe file names, roles and durations;
- component, chapter and track counts;
- expected and observed book duration;
- safe blocker codes and required actions;
- status and plan fingerprint.

It omits:

- source artifact identifiers and revisions;
- source and reference content hashes;
- component fingerprints;
- reference-master identifier and fingerprint;
- review-session identifier and approval fingerprint;
- retail-policy identifier and fingerprint;
- narration-evidence identifier and fingerprint;
- platform-authorisation evidence;
- planner identity;
- private storage paths.

Normal web and API runtimes do not receive track-plan creation or cross-source validation controls.

## Current boundary

A ready track plan is deterministic extraction and encoding intent. It is not encoded media, an ACX upload or an accepted retail audiobook.

The next governed layers must provide:

1. a private source resolver for the approved reference WAV;
2. shell-free range extraction and constant-bit-rate MP3 encoding;
3. no-op extraction proof for tracks that do not need conversion;
4. exact FFmpeg command and tool-version evidence;
5. private content-addressed MP3 artifacts;
6. independent engineering of every encoded file;
7. MP3 frame, CBR, sample-rate, channel, duration and silence validation;
8. source-range-to-output provenance;
9. human playback checks for every encoded boundary;
10. a separate retail-sample plan and explicit-content review;
11. metadata, cover and package validation;
12. checksums and final release confirmation.

The approved lossless reference WAV remains immutable. Retail tracks are derived artifacts and never replace the reviewed master.
