# Governed audiobook retail track playback review

Independent engineering can prove that an MP3 is well formed and within a delivery profile. It cannot prove that the spoken heading is correct, the file begins and ends cleanly, no words are missing, the narration remains listenable, or the encoded file is free from audible defects.

The retail track review boundary therefore requires complete human playback of every encoded file before any retail package can be assembled.

## Admission boundary

A review session can only be created from a complete `AudiobookRetailTrackEncodeChain` whose files are all:

- verified private `audiobook-retail-track` artifacts;
- independently engineered against the exact reviewed profile;
- free from engineering and source-comparison findings;
- pending mandatory human review;
- covered by current commercial audiobook rights;
- bound to the exact plan, reference master and render evidence.

A quarantined file, stale rights record, mismatched engineering profile, recomputed chain or partially eligible book cannot enter review.

## Every file is reviewed independently

The session snapshots every exact retail MP3 by:

- ordinal and semantic role;
- deterministic file name;
- expected and observed duration;
- artifact identifier, revision, fingerprint, content hash and byte count;
- independent engineering-evidence fingerprint.

One approved chapter cannot hide a defective credit or another chapter. Every track needs both required review roles.

## Editorial review

The editorial reviewer must listen to the complete MP3 in a consumer playback context and confirm:

- the spoken opening credit, chapter title, prologue, epilogue or closing credit is correct;
- the entire approved source content is present;
- the opening boundary is clean;
- the closing boundary is clean;
- transitions and pauses are natural;
- tone is consistent with the approved reference;
- the file remains listenable for its full duration.

## Engineering playback review

The engineering reviewer must listen to the complete MP3 on studio headphones and confirm:

- no audible encoding artifacts;
- no clicks, truncation, doubled words or damaged consonants;
- correct silence and boundary behaviour;
- no tonal or loudness discontinuity;
- no defect hidden by numerical measurements.

Editorial and engineering roles must remain independently human. A person cannot occupy both roles in the same current review set.

## Scoring and findings

Every review scores eight dimensions from one to five:

- spoken header accuracy;
- content completeness;
- transition integrity;
- silence integrity;
- tonal consistency;
- encoding transparency;
- sustained listenability;
- freedom from defects.

A current approval requires every dimension to be at least four and no unresolved finding codes.

A `changes-requested` decision requires structured finding codes and notes. The session remains blocked until a later complete re-review replaces that role and track combination with a clean approval.

## Playback coverage

The current latest review set must collectively cover:

- studio headphones;
- consumer headphones;
- speakers.

Mobile-device playback is also supported as an additional consumer context.

## Third-person approval

After all tracks have independent editorial and engineering approval, a third human release manager must explicitly confirm the complete review set.

The release manager:

- cannot be either review-role identity;
- revalidates the exact encode chain;
- revalidates current rights at approval time;
- records one final confirmation identifier;
- approves each exact retail-track artifact as a new revision;
- binds every approved artifact fingerprint and review fingerprint into the session approval.

The resulting state is `approved`. It means the encoded MP3 set is eligible for package planning. It does not mean released, uploaded, submitted or retailer accepted.

## Revision and tamper resistance

Sessions use immutable fingerprints and linked revisions. Structural validation protects track snapshots, complete-listen evidence, scores, findings, role independence, approval records and artifact revision relationships.

A separate cross-source validator rebinds the session to the original encode chain. Recomputing a valid session fingerprint around another plan or artifact cannot replace the approved source.

## Persistence and privacy

The file-backed review store supports:

- create-once idempotency;
- optimistic revision checks;
- linked envelope hashes;
- semantic validation on every read;
- aggregate-only audit metadata.

The public view exposes file names, roles, review decisions, score averages, safe finding codes and aggregate readiness. It omits reviewer and approver identities, notes, artifact identifiers, content hashes, engineering evidence identifiers, source paths and private evidence relationships.

Normal web and API runtimes do not receive review mutation, approval, private artifact or cross-source validation controls.

## Current boundary

This layer ends with a human-approved set of exact retail MP3 artifacts.

The next governed layers must separately handle:

1. retail sample selection and content review;
2. metadata and cover validation;
3. deterministic package manifests;
4. private package assembly and independent inspection;
5. final package review;
6. explicit release confirmation;
7. distributor upload and returned acceptance evidence.
