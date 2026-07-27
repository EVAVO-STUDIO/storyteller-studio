# EVAVO Storyteller Studio

EVAVO Storyteller Studio is a provider-neutral production system for emotionally credible long-form narration, audiobook mastering and optional illustrated story companions.

The product is not intended to be another one-click text-to-speech wrapper. It treats narration as a directed performance with explicit manuscript fidelity, rights, pronunciation, character, continuity, quality and release gates.

## Product surfaces

- **Web studio** for manuscript intake, story and pronunciation bibles, performance direction, take review, continuity, mastering and visual-story planning.
- **HTTP API** for deterministic project planning, provider capability negotiation, take evaluation and production orchestration.
- **CLI** for local and automated manuscript planning, manifest validation, provider ranking and quality checks.
- **Provider SDK** boundary so no voice, language, image or rendering provider becomes the product architecture.
- **Durable generation queue** with idempotent intents, exclusive worker leases, bounded retries, cancellation and artifact-reference-only completion records.
- **Series continuity model** that preserves narrator, character, pronunciation and performance decisions across books without hiding drift.
- **Visual story engine** that works at scene and dramatic-beat level rather than producing a generic literal image for every sentence.

## Core production pipeline

1. Import an immutable manuscript revision and calculate its fingerprint.
2. Segment the exact source text into stable chapters, paragraphs and production units.
3. Build proposed story, pronunciation and performance bibles without presenting proposals as approved canon.
4. Verify voice rights, consent, intended uses, territories and expiry before generation.
5. Negotiate provider capabilities against the project rather than assuming a preferred vendor can do everything.
6. Generate calibration passages and multiple candidate takes for difficult material.
7. Enqueue approved generation intents with stable idempotency keys, bounded attempts and fail-closed worker leases.
8. Evaluate transcript fidelity, final-word coverage, audio engineering limits, continuity drift and human direction notes.
9. Approve takes non-destructively and retain complete provenance.
10. Assemble chapters, master against an explicit delivery profile and validate the final package.
11. Optionally build an art-directed scene plan, continuity bible and restrained motion treatment for a visual companion.

## Creative position

Excellent narrators and storytellers can be studied for craft principles such as listener relationship, timing, clarity, intimacy, restraint, humour, subtext, character differentiation, phrase shape and silence. Named performers are not voice-cloning targets. The system rejects instructions to impersonate an identifiable performer unless the project contains explicit, verifiable rights and consent for that identity and use.

## Repository layout

```text
apps/
  api/                 Protected HTTP orchestration surface
  web/                 Responsive review-oriented studio shell
packages/
  cli/                 Command-line workflow
  storyteller/         Provider-neutral domain, queue and quality engine
scripts/               Executable architecture and security checks
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

The repository contains an executable architecture foundation: exact-source manuscript segmentation, performance planning, rights and consent gates, provider capability ranking, continuity drift scoring, transcript and engineering QA, candidate-take selection, a durable file-backed generation queue, visual beat planning, API and CLI surfaces, a protected web shell and fail-closed EVAVO hub metadata.

The queue is suitable for local production, tests and a single isolated worker. It deliberately preserves a migration boundary for transactional PostgreSQL claims and private object storage before multi-instance production execution is enabled.

No external voice provider is enabled by default and no generated media is represented as production-approved without the required evidence and review.
