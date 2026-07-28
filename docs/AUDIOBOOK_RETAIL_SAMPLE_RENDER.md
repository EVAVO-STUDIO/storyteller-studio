# Governed audiobook retail sample rendering

The retail sample renderer turns one approved sample plan into one deterministic MP3 preview. It is a rendering boundary only. It does not register the sample as a durable artifact, approve its post-render listening quality, package a book, upload media or claim retailer acceptance.

## Admission chain

Rendering begins only after the complete planning chain has already established:

```text
current retail policy
  -> approved retail MP3 set
  -> complete two-role track playback review
  -> third-person approval of exact MP3 revisions
  -> approved narrative MP3
  -> human sample-editor range selection
  -> independent content-safety review
  -> retail sample plan
  -> sample rendering
```

The renderer accepts the immutable `ready-for-rendering` plan and resolves only the exact approved source artifact revision named by that plan.

## Exact source resolution

The private resolver must return the same:

- artifact identifier;
- artifact revision;
- artifact fingerprint;
- content hash;
- byte count.

A mismatch fails before FFmpeg is invoked. The private path must be non-empty and contain no null character. Resolved private sources are disposed on success and failure.

The safe evidence retains the source snapshot for cross-source validation, but the public projection omits the artifact identity, hashes and private path.

## Shell-free rendering

The default runner reuses the existing shell-free retail MP3 execution boundary. FFmpeg is spawned with an argument array and `shell: false`.

The deterministic filter is:

```text
atrim exact relative range
-> reset timestamps to zero
-> enforce approved sample rate and channel layout
```

The output is re-encoded once as `libmp3lame` at the policy-approved constant bit rate. Video, subtitle and data streams are excluded. Metadata, ID3v1, ID3v2 and Xing output are disabled.

The runner uses a private temporary directory, reads the resulting MP3 into memory, then removes the temporary directory on every path.

## Immutable render evidence

The evidence binds:

- sample-plan identifier and fingerprint;
- project and book;
- approved source track ordinal, role and safe filename;
- exact approved source artifact revision and hashes;
- relative and absolute sample range;
- output filename and technical profile;
- output SHA-256 and byte count;
- MP3 media signature;
- deterministic filter fingerprint;
- deterministic command fingerprint;
- FFmpeg executable name and version fingerprint;
- render time;
- complete evidence fingerprint.

The command fingerprint explicitly records that metadata is stripped and no shell is used.

## Bounded execution

The renderer validates a configurable timeout and output ceiling before source resolution. It estimates the maximum CBR payload from sample duration and bit rate, with bounded overhead, and rejects an impossible output ceiling before touching private media.

Current bounds are deliberately above the maximum five-minute ACX sample while still preventing unbounded output allocation.

Pre-aborted work, stale render timestamps, malformed output, false media signatures, runner failures and altered result bytes fail closed with stable sample-render error codes.

## Independent validation

Three separate validators are provided:

1. structural evidence validation;
2. evidence-to-plan cross-source validation;
3. returned-byte integrity and MP3-signature validation.

A caller cannot recompute a structurally valid fingerprint around another plan identifier or another approved source and have it pass the cross-source validator.

## Privacy boundary

The public view includes:

- sample and plan identifiers;
- book identifier;
- source track ordinal, narrative role and safe filename;
- exact selected range;
- output profile, output hash and byte count;
- tool-version fingerprint;
- render time and evidence fingerprint.

It excludes:

- private object paths and storage keys;
- approved source artifact identifier and revision;
- source artifact, content and review hashes;
- encode-chain and track-review identifiers;
- sample editor and safety reviewer identities;
- rights evidence;
- command and filter fingerprints.

Normal API and web runtimes must not receive the private resolver, runner controls or raw MP3 bytes.

## Current boundary

A successful result proves that one exact, approved range was rendered as an MP3 with immutable evidence.

It does not yet prove:

- independently measured duration, codec, CBR posture, RMS, peaks, noise floor or silence;
- private artifact persistence;
- post-render human playback approval;
- package inclusion;
- upload or retailer acceptance.

The next governed layer must ingest the sample privately, run independent engineering against the rendered bytes, compare measured output with this evidence, quarantine failed samples without deleting evidence and require a post-render human playback approval.