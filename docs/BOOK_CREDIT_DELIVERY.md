# Governed book credit delivery snapshot

An approved opening or closing credit master is not yet a complete audiobook component until its timing and technical delivery characteristics are bound to the exact approved review session and artifact revision.

## Purpose

The delivery snapshot provides a deterministic bridge between governed credit mastering and complete-book assembly. It does not copy audio, alter an approved master or expose private evidence.

## Required evidence

A snapshot is created only from:

- an approved `BookCreditMasterChain`;
- the exact approved `BookCreditTakeReviewSession` named by that chain;
- the selected candidate's independent audio-engineering evidence;
- a verified and human-approved `credit-master` artifact;
- current commercial audiobook rights.

## Bound delivery data

The snapshot records:

- opening or closing role;
- book and project scope;
- exact credit-master artifact revision and integrity;
- selected take and review fingerprints;
- full observed duration;
- reviewed engineering profile and version;
- WAV sample rate, channel count and bit depth;
- rights fingerprint;
- immutable fingerprint and creation time.

Only WAV credit masters are admitted for complete-book assembly. Unsupported or ambiguous PCM bit depths fail closed.

## Privacy boundary

The public view omits:

- artifact identifiers and content hashes;
- rights evidence identifiers;
- reviewer and approver identities;
- selected take and calibration identifiers;
- private storage and provider provenance.

## Current boundary

The delivery snapshot is a governed input to the future complete audiobook sequence. It does not concatenate files, perform retail encoding, create downloads or release a package.
