# Governed audiobook retail sample planning

The retail sample is a commercial preview, not another chapter file and not an automatically selected highlight. A technically compliant excerpt can still contain the wrong material, begin or end mid-thought, expose explicit content, reveal a major spoiler or misrepresent the book.

The sample-plan boundary therefore requires exact approved source audio, deliberate editorial selection and an independent human content-safety review before any sample audio is rendered.

## Admission chain

A sample plan can only be created from this complete evidence chain:

```text
current ACX retail policy
  -> ready retail track plan
  -> private independently engineered MP3 set
  -> complete two-role playback review
  -> third-person approval of exact MP3 revisions
  -> approved narrative MP3
  -> human sample-editor selection
  -> independent content-safety review
  -> retail sample plan
```

The plan revalidates every relationship. It does not infer approval from an MP3 signature, a passing loudness report or the existence of a review session.

## Narrative source only

Opening and closing credits cannot be used as the retail sample. The source role must be:

- prologue;
- chapter;
- epilogue.

The source artifact must be the exact approved revision recorded by the retail-track review approval. Its immutable storage, integrity, provenance and rights fields must still match the originally engineered retail track.

## Exact range

A sample plan identifies one contiguous range within one approved narrative MP3.

It records:

- source track ordinal, role and safe file name;
- start and end relative to the approved MP3;
- exact duration;
- corresponding absolute position in the book;
- output profile inherited from the current policy.

The range must stay inside the approved file and cannot exceed 300,000 milliseconds under the current ACX policy.

The plan does not splice files, combine chapters, trim silence, insert narration or render audio.

## Preferred beginning and governed exceptions

The current policy prefers the beginning of the audiobook. A range beginning at zero in the first narrative track is recorded as `preferred-book-beginning`.

Another source or a later offset is allowed only as a `curated-exception` with one structured reason:

- explicit content at the beginning;
- opening too short or nonrepresentative;
- spoiler or context risk;
- stronger representative excerpt;
- technical boundary constraint.

This keeps the preference visible without pretending that the first five minutes are always suitable.

## Human sample editor

The sample editor must listen to the complete proposed range and confirm:

- it represents the book honestly;
- the start is a natural approved boundary;
- the end is a natural approved boundary;
- the full range was reviewed rather than inferred from timestamps.

Automation, workers, bots and system identities cannot perform this role.

## Independent content-safety review

A different human must listen to the same complete range and confirm:

- the excerpt comes from the approved audiobook;
- no explicit content is present;
- no other content makes it unsuitable for a retail preview;
- it is approved for use as the public-facing sample.

The safety reviewer cannot be the sample editor. The review occurs after selection and before plan creation.

## Current policy and rights

The distributor policy is revalidated at plan creation. The plan binds its identifier, version, review date, expiry and fingerprint.

Commercial audiobook rights are also revalidated on the exact approved source artifact. Expired rights, a reached deletion deadline or a non-commercial source fail closed.

## Output intent

A ready plan targets:

```text
RetailSample.mp3
```

with the policy-approved:

- MP3 codec and container;
- constant bit rate;
- 44.1 kHz sample rate;
- source book channel layout.

This is output intent only. A later renderer must independently prove the actual bytes, source range, duration, codec, bit rate, sample rate, channel count and content hash.

## Tamper resistance

The plan, editorial selection and safety review are independently fingerprinted.

Structural validation protects range arithmetic, narrative role, output settings, chronology, human independence and safety state. A separate cross-source validator recreates the expected plan from the policy, track plan, encode chain, approved review and approved artifact.

Recomputing a structurally valid fingerprint around another plan identifier or source artifact cannot replace the approved chain.

## Persistence and privacy

The file-backed plan store is create-once and idempotent for identical intent. A conflicting plan under the same identifier is rejected.

The safe public projection exposes:

- policy version;
- source role, ordinal and safe file name;
- exact range and duration;
- preferred-beginning or exception status;
- safe exception reason;
- output profile;
- content-safety approval state;
- plan fingerprint.

It omits:

- editor and safety-reviewer identities;
- approved artifact identifiers and revisions;
- content, artifact and review hashes;
- review-session identifiers;
- rights-record identifiers;
- private object keys and paths;
- manuscript text and reviewer notes.

Audit metadata remains aggregate and contains no reviewer identity, source file name, artifact identity or content hash.

## Current boundary

`ready-for-rendering` means the exact source range and human approvals are complete.

It does not mean the sample has been cut, encoded, independently engineered, listened to after rendering, packaged, uploaded or accepted by a retailer.

The next governed layer must render the exact range without a shell, store the sample privately, independently engineer it, compare it with the plan and require a post-render human playback approval.