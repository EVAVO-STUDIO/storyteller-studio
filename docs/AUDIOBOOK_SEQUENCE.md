# Governed complete audiobook sequence

The complete audiobook sequence is an immutable planning manifest. It establishes exact order and timing across one approved opening credit, the approved mastered chapter sequence and one approved closing credit.

## Admission order

The manifest accepts components only in this order:

1. approved `credit-master` delivery snapshot with role `opening`;
2. every approved `mastered-chapter` from the governed chapter sequence;
3. approved `credit-master` delivery snapshot with role `closing`.

No component is inferred, relabelled or silently inserted.

## Live artifact validation

Every snapshot is rechecked against the current artifact record. The artifact must remain:

- verified;
- human approved;
- not quarantined;
- unreleased;
- commercially authorised for audiobook use;
- within its rights and retention dates;
- identical in revision, fingerprint, content hash and byte count.

## Technical consistency

Opening credit, chapters and closing credit must use the same:

- rights fingerprint;
- reviewed engineering profile;
- WAV sample rate;
- channel layout;
- bit depth.

A mismatch blocks the manifest rather than invoking hidden conversion.

## Timeline

Components receive deterministic contiguous offsets. The first component starts at zero, every later component begins at the preceding end time, and total duration equals the final end time. The plan does not invent inter-component silence.

## Revisions and storage

The sequence is revisioned through the integrity-checked project store with optimistic concurrency and a previous-fingerprint chain. Audit metadata records only safe counts, duration, status and the sequence fingerprint.

## Privacy boundary

The public view reports roles, titles, durations and offsets. It omits artifact identifiers, content hashes, rights records, engineering fingerprints, provider information and private storage references.

## Current boundary

`ready-for-retail-encoding` means the exact complete-book timeline is governed. It does not mean a combined file, retail MP3 package, chapter-marker file, download or released audiobook exists.
