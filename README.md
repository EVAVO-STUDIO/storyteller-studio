# EVAVO Storyteller Studio

EVAVO Storyteller Studio is a provider-neutral production system for emotionally credible long-form narration, audiobook mastering and optional illustrated story companions.

The product is not intended to be another one-click text-to-speech wrapper. It treats narration as a directed performance with explicit manuscript fidelity, rights, pronunciation, character, continuity, quality, artifact and release gates.

## Product surfaces

- **Web studio** for manuscript intake, story and pronunciation bibles, performance direction, take review, continuity, mastering and visual-story planning.
- **HTTP API** for deterministic project planning, provider capability negotiation, take evaluation and production orchestration.
- **CLI** for local and automated manuscript planning, manifest validation, provider ranking and quality checks.
- **Lossless manuscript integrity** with deterministic source manifests, chained chunks, resumable hash-only checkpoints and complete word/non-whitespace coverage audits.
- **Integrity-checked segmentation** that binds the normal Storyteller segmenter to whole-source verification and fails closed before generation planning.
- **Canonical story truth** with explicit entity identity, aliases, separate entity/event graphs, world-time fact intervals, contradiction findings, source evidence and approved append-only retcons.
- **Provider SDK** boundary so no voice, language, image or rendering provider becomes the product architecture.
- **Durable generation queue** with idempotent intents, exclusive worker leases, bounded retries and cancellation.
- **Governed artifact registry** with private storage references, immutable hashes, provenance, rights snapshots, quarantine, review and final release confirmation.
- **Artifact-backed completion boundary** so generation cannot complete from unverified media paths or a provider response alone.
- **Series continuity model** that preserves narrator, character, pronunciation and performance decisions across books without hiding drift.
- **Visual story engine** that works at scene and dramatic-beat level rather than producing a generic literal image for every sentence.

## Core production pipeline

1. Import an immutable manuscript revision and calculate its whole-source fingerprint.
2. Create deterministic chained integrity chunks and complete a resumable, hash-only intake checkpoint.
3. Segment the exact source text into stable chapters, paragraphs and production units, then prove that every word and non-whitespace source span is covered.
4. Build proposed story, pronunciation and performance bibles without presenting proposals as approved canon.
5. Resolve proposals into a private story-truth ledger with canonical entities, event chronology, time-aware facts, explicit uncertainty, evidence and controlled retcons.
6. Verify voice rights, consent, intended uses, territories and expiry before generation.
7. Negotiate provider capabilities against the project rather than assuming a preferred vendor can do everything.
8. Generate calibration passages and multiple candidate takes for difficult material.
9. Enqueue approved generation intents with stable idempotency keys, bounded attempts and fail-closed worker leases.
10. Write provider output to private temporary storage and register immutable artifact records.
11. Verify content hashes, byte counts, media structure, transcript fidelity, engineering limits and continuity evidence.
12. Quarantine invalid output and admit only the exact verified candidate bundle to queue completion.
13. Approve takes non-destructively and retain complete provenance.
14. Assemble chapters from approved artifacts and validate the dependency graph.
15. Master against an explicit delivery profile and construct a governed release package.
16. Require final confirmation over verified, reviewed and rights-valid dependencies before release.
17. Optionally build an art-directed scene plan, continuity bible and restrained motion treatment for a visual companion.

Generation completion, take approval and final release are separate state transitions. A successful provider response does not imply any of them.

## Creative position

Excellent narrators and storytellers can be studied for craft principles such as listener relationship, timing, clarity, intimacy, restraint, humour, subtext, character differentiation, phrase shape and silence. Named performers are not voice-cloning targets. The system rejects instructions to impersonate an identifiable performer unless the project contains explicit, verifiable rights and consent for that identity and use.

## Repository layout

```text
apps/
  api/                 Protected HTTP orchestration surface
  web/                 Responsive review-oriented studio shell
packages/
  cli/                 Command-line workflow
  storyteller/         Provider-neutral domain, queue, artifact and quality engine
scripts/               Executable architecture, security and artifact checks
docs/                  Architecture, research, rights and delivery records
```

## Development

Requirements:

- Node.js 24 or a supported Node.js 22 LTS release
- npm 10 or newer

```powershell
npm install
npm run verify
npm run build
npm run dev:web
```

Run the API in another terminal:

```powershell
npm run dev:api
```

Inspect the CLI:

```powershell
npm run storyteller -- help
```

## Current status

The repository contains an executable architecture foundation: deterministic whole-source manuscript manifests, resumable chunk intake, complete segment coverage auditing, exact-source segmentation, canonical entity and event truth, time-aware fact state, contradiction detection, controlled retcons, layered performance planning, rights and consent gates, provider capability ranking, continuity drift scoring, transcript and engineering QA, candidate-take selection, a durable file-backed generation queue, an integrity-checked artifact registry, artifact-backed queue completion, visual beat planning, API and CLI surfaces, a protected web shell and fail-closed EVAVO hub metadata.

The file queue, file artifact registry and file story-truth store are suitable for local production, tests and a single isolated worker. They deliberately preserve migration boundaries for transactional PostgreSQL claims, private versioned object storage and multi-instance workers before distributed production execution is enabled.

No external voice provider is enabled by default. No proposed fact, provider result, stored object, generated voice, illustration, chapter master or release package is represented as approved without its required evidence and review.
