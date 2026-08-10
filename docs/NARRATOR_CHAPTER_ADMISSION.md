# Admission-bound narrator chapter evidence

Storyteller production now keeps the complete Audio Studio profile admission and the
explicit human admitted casting attached to chapter evidence after synthesis. A
production job can no longer carry the full training/profile chain while objective
monitoring and human review quietly fall back to the older standalone casting record.

## Production lineage

`storyteller-admitted-narrator-chapter-monitor-v1` binds one chapter to:

- the exact validated Audio Studio profile-admission hash;
- the exact admitted-casting fingerprint and underlying casting fingerprint;
- the pinned profile ID, revision and profile hash;
- the immutable Storyteller project and manuscript source hash;
- the exact expected chapter definition and ordered segment set;
- every admission-bound narrator production job ID and cache key;
- the complete production-job-set fingerprint;
- the exact rendered-chapter fingerprint;
- the approved acoustic reference and monitoring policy;
- transcript, speaker-identity, acoustic and engineering evidence hashes; and
- the recomputed objective monitoring result.

The chapter source fingerprint hashes segment IDs, ordinals, kinds, immutable source
ranges and text hashes. It does not publish the manuscript text.

## Exact job-set admission

Every expected chapter segment must have exactly one ordered
`storyteller-narrator-production-job-v2` job. Each job is revalidated against the same
profile admission and admitted casting. Missing, duplicate, reordered or substituted
jobs are rejected, as are jobs with fewer than the governed three performance
candidates.

This prevents a caller from monitoring a render made by another model revision or
from presenting only the best-looking subset of a chapter's generated segments.

## Objective evidence recomputation

The admitted monitor constructs the existing objective observation and then runs the
existing long-form monitor. Validation later re-runs the monitor from the bound policy,
reference and observation and requires the same fingerprint. Rehashing changed finding
codes, continuity, transcript metrics or status does not make the evidence valid.

The objective layer still checks transcript coverage, insertions, final-word presence,
clipping, unexpected speaker changes, narrator identity, acoustic continuity, cadence
repetition, sentence-final contour repetition, noise floor, room tone, seams and
chapter-duration drift.

## Human chapter review

`storyteller-admitted-chapter-narrator-review-v1` wraps the existing complete human
chapter review and binds it to the exact admitted monitoring result, production job set,
render, source, profile admission and admitted casting.

Warning findings must still be acknowledged exactly. Regeneration-required objective
evidence cannot be overridden by high human scores. Review chronology, minimum reviewer
count, performance, continuity, listening ease, identity stability, synthetic-artifact
flags and fatigue flags remain governed by the existing chapter-review contract.

## Zero-shot and adapted voices

The same chapter boundary supports both modes:

- zero-shot profiles retain `training=null` in their validated profile admission;
- adapted profiles retain the exact governed training provenance and selected model
  artifact through the profile-admission hash.

The chapter layer never invents training evidence for a zero-shot voice and never drops
training provenance from an adapted voice.

## Public privacy boundary

The public projection exposes only bounded operational state:

- project and chapter identity;
- profile ID and revision;
- whether admission and human review are bound;
- production-job count;
- objective monitoring status and finding count;
- chapter approval state; and
- the admitted-review fingerprint.

It does not expose profile hashes, admission hashes, casting fingerprints, selected
checkpoints, datasets, engine locks, reviewer identities, manuscript text, transcripts,
private audio paths or model files.

## Authority separation

Objective monitoring retains:

```text
humanListeningApproval=false
titleReleaseAuthority=false
publicationAuthority=false
```

The admitted chapter review may record:

```text
chapterApproved=true
```

but still retains:

```text
titleNarratorApproval=false
titleReleaseAuthority=false
publicationAuthority=false
```

Chapter approval therefore remains separate from whole-book narrator approval,
mastering approval, retail release and publication.

## Governed path

```text
validated Audio Studio profile admission
→ explicit admitted narrator casting
→ v2 admission-bound production jobs
→ complete ordered chapter job set
→ exact rendered chapter
→ admission-bound objective monitoring
→ admission-bound human chapter review
→ narrator-bound mastering and complete-book review
```
