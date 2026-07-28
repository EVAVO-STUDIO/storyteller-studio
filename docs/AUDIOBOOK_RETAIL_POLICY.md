# Governed audiobook retail policy

A reviewed lossless audiobook reference master is not automatically a valid distributor submission. Retail platforms impose their own file, technical, metadata, sample, narration and delivery rules, and those rules can change independently of the production master.

The retail-policy boundary records those external rules as versioned, expiring evidence. It prevents Storyteller Studio from treating a historical checklist, a generic MP3 preset or a voice licence as permanent permission to distribute a title.

The first implemented profile is ACX/Audible. Other distributors must receive separate reviewed profiles rather than inheriting ACX assumptions.

## Reviewed ACX requirements

The current ACX profile was derived from the official **ACX Audio Submission Requirements** article, reviewed on 28 July 2026. The policy records the external requirements rather than embedding them as timeless product facts.

The governed output profile requires:

- MP3 output;
- constant bit rate encoding;
- 192, 256 or 320 kbps;
- 44.1 kHz sample rate;
- one consistent mono or stereo channel format across the book.

The governed track profile requires:

- one chapter or section per file;
- separate opening-credit and closing-credit files;
- a spoken section header at the beginning of each file;
- no file longer than 120 minutes;
- a secondary header when a long section must be split;
- standard US alphanumeric file names without unsafe special characters;
- the same channel format across all files.

The governed acoustic profile requires:

- RMS between -23 dB and -18 dB inclusive;
- peaks strictly below -3 dB;
- noise floor strictly below -60 dB RMS;
- one to five seconds of room tone at the beginning and end;
- consistent sound and formatting;
- no extraneous sounds.

The governed retail-sample profile requires:

- no more than five minutes;
- audio taken from the audiobook itself;
- no explicit content;
- human content-safety review;
- preference for a compelling passage near the beginning of the book.

These constraints belong to the ACX policy. Apple Books, Spotify distribution partners and other platforms require their own source review, policy fingerprint and delivery path.

## Versioned and expiring evidence

Every retail policy records:

- distributor;
- external version;
- review date;
- expiration date;
- source reference;
- exact canonical requirements;
- immutable fingerprint.

A policy cannot be created as current when its review date is in the future or its expiration has passed. The initial policy lifetime is bounded to no more than 366 days so external requirements must be checked again regularly.

Changing bitrate, file duration, acoustic limits, sample rules, narration posture or any other canonical requirement changes the policy fingerprint. Recomputed hashes cannot legitimise a non-canonical policy shape.

The public view omits the private source reference while reporting whether the policy is currently within its reviewed window.

## Human, synthetic and mixed narration

ACX currently prohibits unauthorised text-to-speech, AI and automated narration. Storyteller Studio therefore models three source kinds:

- `human-performance`;
- `synthetic-voice`;
- `mixed-performance`.

Human performance can proceed after a real human distribution attestation and the other retail gates.

Synthetic or mixed narration remains blocked unless there is current Audible or ACX platform authorisation for the exact title or an applicable publisher programme. The authorisation must be bound to:

- the ACX/Audible distributor;
- the exact project;
- the exact book;
- the exact reviewed retail-policy fingerprint;
- the permitted ACX retail-audiobook use;
- a private authorisation-evidence record;
- effective and expiration dates.

A voice actor consent record, a stock-voice licence, a provider commercial-use term or an internal rights approval is not Audible or ACX platform authorisation. Those records solve different legal and production questions and cannot be substituted for marketplace permission.

## Platform authorisation

The first authorisation model accepts either:

- title-specific Audible/ACX authorisation; or
- a documented publisher programme that actually covers the title.

The authorisation is valid only while both it and the retail policy are current. A valid authorisation for another book, project, policy revision, distributor or permitted use is rejected.

Authorisation evidence identifiers remain private. Public views reveal only whether authorisation was required, whether it is present and when it expires.

## Human attestation

Every narration-eligibility record requires a human distribution attestor. System, worker, automation and bot identities cannot attest that a title is eligible for retail submission.

The attestation records:

- project and book scope;
- distributor;
- retail-policy fingerprint;
- narration source kind;
- rights fingerprint;
- attestor identity;
- attestation time;
- optional platform authorisation;
- immutable fingerprint.

A human-performance record cannot carry an irrelevant synthetic-narration authorisation. Synthetic and mixed records cannot omit one.

## Tamper resistance

Policy, platform-authorisation and narration-eligibility records are independently fingerprinted and then semantically cross-checked.

This means that recomputing hashes after changing an embedded book identifier, policy fingerprint or authorisation scope still fails. Structural integrity cannot replace scope correctness.

## Privacy boundary

The public policy projection reports safe technical requirements, dates, current status and policy fingerprint. It omits the private source-reference record.

The public narration projection reports:

- distributor;
- narration source kind;
- eligibility status;
- whether platform authorisation was required;
- whether it is present;
- its expiration date when applicable;
- attestation date;
- eligibility fingerprint.

It omits:

- project and book identifiers;
- rights fingerprints;
- policy fingerprints;
- attestor identity;
- platform-authorisation identifier;
- authorisation-evidence identifier.

Normal web and API runtimes do not receive policy-creation, authorisation-creation or narration-attestation controls.

## Current boundary

This layer determines whether a reviewed delivery policy and narration route are admissible. It does not encode audio, upload files, create ACX projects or claim that ACX has accepted a title.

The next governed layers must provide:

1. an exact track plan derived from the approved reference master and approved book sequence;
2. deterministic chapter and credit extraction without re-mastering approved audio;
3. shell-free constant-bit-rate MP3 encoding;
4. independent engineering of every encoded file;
5. section-header, duration, silence and channel-consistency validation;
6. a human-reviewed retail sample;
7. title, author, narrator, copyright, cover and chapter metadata validation;
8. package manifests, checksums and source-to-encode provenance;
9. explicit final release confirmation;
10. manual platform submission unless a separately authorised private integration is later added.

The approved lossless reference WAV remains immutable. Distributor files are derived artifacts and never overwrite the reviewed production master.
