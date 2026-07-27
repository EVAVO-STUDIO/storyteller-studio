# Storyteller Studio: research, product and reference architecture

Status: executable foundation 0.2.0  
Research review: 27 July 2026  
Scope: long-form narration, audiobook production, series continuity and optional illustrated story companions

## 1. Product position

A convincing audiobook is not produced by sending a complete manuscript to a text-to-speech endpoint. Long-form quality is an orchestration and direction problem:

- the source must remain exact and traceable;
- the narrator must understand narrative distance and listener relationship;
- dialogue must carry intention and subtext rather than a generic emotion preset;
- character differentiation must remain clear without becoming caricature;
- names, languages and invented terms must be governed rather than guessed repeatedly;
- pace, breath, phrase shape and silence must vary with the story without becoming unstable;
- approved voice and performance decisions must survive new sessions and later books;
- objective audio and transcript defects must be rejected automatically;
- human reviewers must retain authority over dramatic truth and taste;
- delivery files must satisfy the selected distributor and archive profiles;
- visual accompaniment must be art-directed at scene and dramatic-beat level.

Storyteller Studio therefore treats generated media as replaceable production output. The durable product is the project knowledge: source revisions, story and pronunciation bibles, rights evidence, performance plans, continuity anchors, takes, findings, approvals, mastering settings and release manifests.

## 2. Learning from excellent narration without copying identity

References such as great oral storytellers, ensemble performers and accomplished audiobook narrators are useful when translated into general craft dimensions. They are not useful as instructions to reproduce a recognisable person.

The system should study and direct:

1. **Listener relationship** — who is being told the story, and how close the narrator stands to them.
2. **Narrative distance** — intimate, close, balanced, formal or mythic presentation.
3. **Intention** — what the speaker is trying to obtain, avoid, conceal or change.
4. **Subtext** — what remains unsaid and must not be flattened by over-explanation.
5. **Phrase architecture** — where a thought begins, turns and resolves across punctuation.
6. **Breath and silence** — pauses with dramatic purpose rather than fixed punctuation delays.
7. **Restraint** — emotional credibility without announcing every feeling.
8. **Character distinction** — rhythm, placement, vocabulary and intention before accent or pitch tricks.
9. **Humour** — timing, confidence and listener complicity rather than forced emphasis.
10. **Continuity** — the same dramatic and vocal logic after hours, months or later books.

Named references can appear in a private research notebook with the principles being studied. Production direction must be written in those general terms. Phrases such as “sound exactly like”, “clone the voice of” or “make it indistinguishable from” are rejected by the rights gate unless an explicit identity licence and consent record covers the project and use.

## 3. Reference architecture

### 3.1 Ingestion and immutable source

Every imported file becomes an immutable source revision with:

- original filename and media type;
- byte hash and canonical text hash;
- import time, importer version and parser warnings;
- page, paragraph and character offsets where the source format supports them;
- a parent revision when an author supplies a replacement manuscript;
- a diff that is reviewable but never silently applied to an approved production.

Initial support should prioritise UTF-8 text and Markdown, followed by DOCX and EPUB. PDF is accepted only with confidence and extraction warnings because visual layout, ligatures and scanned pages can corrupt reading order. OCR must remain an explicit fallback, not a default.

The source text is split into stable production segments whose identifiers derive from the source fingerprint and offsets. Segment text must equal its source slice exactly. Whitespace separators can remain outside spoken units, but words cannot disappear between units. A dedicated final-word gate catches a common long-form truncation failure.

### 3.2 Story, pronunciation and continuity bibles

The project bible separates proposals from approved canon. It contains:

- characters, aliases, relationships and knowledge state;
- locations, historical period, culture and world rules;
- chapter and scene boundaries;
- narrator and point-of-view changes;
- invented terms, names, languages and pronunciations;
- IPA or provider phoneme forms where supported;
- author-recorded pronunciation references;
- character voice descriptors and prohibited shortcuts;
- series-level continuity anchors and book-specific evolution.

A proposed pronunciation is never silently treated as approved. When providers use different phoneme alphabets or lexicon formats, adapters translate from the canonical project entry and retain the provider-specific result in provenance.

### 3.3 Performance director

Direction is layered rather than generated as one enormous prompt:

- **Series direction** defines listener relationship, narrator stance, pronunciation canon, cast logic, acceptable variation and long-term continuity.
- **Book direction** defines the arc, shifts in narrative distance, thematic pressure and intended evolution from earlier books.
- **Chapter direction** defines energy, dramatic purpose and transitions.
- **Scene direction** identifies point of view, objectives, reversals, emotional temperature and environment.
- **Segment direction** records pace, intensity, warmth, restraint, clarity, pauses, emphasis, intention, subtext and negative direction.

The engine creates a proposal from the text, but an editor can change any layer. Lower layers inherit from higher layers and store only deliberate overrides. This avoids contradictory prompts and keeps later regeneration reproducible.

Direction should describe performance outcomes, not manipulate arbitrary acoustic values unless an engineer is calibrating a specific provider. Normalised controls are translated by each provider adapter.

### 3.4 Calibration before production

A production voice is not approved from a single attractive sentence. Each narrator or character receives a calibration suite covering:

- quiet exposition;
- long syntax and lists;
- urgency without shouting;
- grief or fear under restraint;
- humour and irony;
- questions with different intentions;
- proper names and difficult vocabulary;
- dialogue transitions;
- chapter openings and endings;
- whisper-adjacent material without losing intelligibility.

The suite is rendered through candidate settings, reviewed blind where practical, and locked as a revisioned continuity anchor. The anchor contains approved audio references, transcript alignment, provider and model information, settings, direction, acoustic summaries and reviewer notes.

### 3.5 Provider capability negotiation

Provider names are not embedded in the core domain. An adapter reports a versioned capability profile, including:

- streaming and asynchronous long-form modes;
- maximum input size;
- style or natural-language direction;
- SSML, phoneme and pronunciation-dictionary support;
- word or phoneme timestamps;
- multi-speaker support;
- speech-to-speech or performance transfer;
- deterministic seed or repeatability controls;
- regions and data residency;
- input retention and training-use policy;
- custom-voice consent enforcement;
- expected latency and cost units.

A project declares hard requirements, preferred capabilities, privacy rules, region, cost ceiling and latency ceiling. Ineligible providers receive explicit reasons. Eligible providers form a fallback chain. The route is recalculated when an adapter version or provider policy changes; old productions retain the capability snapshot that was actually used.

This protects the product from vendor churn and permits different routes for narration, dialogue calibration, pronunciation repair, timestamps, local previews and final production.

### 3.6 Generation jobs and idempotency

A generation job is a deterministic production intent, not an immediate provider call. It includes:

- project and immutable segment identifiers;
- approved voice-profile and direction revisions;
- canonical pronunciation entries;
- provider fallback route and adapter versions;
- requested candidate count;
- output format and analysis requirements;
- cache key, budget reservation and idempotency key;
- rights-gate result and expiry snapshot;
- correlation identifiers for audit and cost accounting.

Workers claim jobs through a queue, renew leases, respect rate limits and write only to content-addressed temporary output. A network retry cannot create an untracked duplicate charge or silently replace an approved take. Cancellation is cooperative and recorded.

### 3.7 Candidate takes and objective quality gates

Difficult or important segments should produce multiple candidates. Each candidate is checked for:

- source-to-transcript token coverage;
- inserted, omitted, repeated or reordered words;
- final-word and sentence-tail truncation;
- pronunciation mismatches;
- clicks, clipping, DC offset, excessive noise and unexpected silence;
- RMS, peak, true peak, sample rate, channel and encoding rules;
- pace, pause, pitch, energy and style drift from the approved anchor;
- audible joins or room-tone changes;
- repeated synthetic cadence across neighbouring segments;
- human review of intention, subtext, clarity, restraint and listener fatigue.

Objective errors fail automatically. A weighted score ranks only eligible candidates; it never converts a rights or fidelity failure into a passing result. The reviewer hears candidates in context with the previous and following approved material.

### 3.8 Long-form and series continuity

Consistency does not mean freezing every acoustic value. A believable performance changes with health, age, scene, emotion and character development. Continuity therefore uses an approved envelope:

- median pitch and usable range;
- speaking-rate range by narrative mode;
- pause ratio and phrase-length distribution;
- energy and spectral summaries;
- voice or style embedding distance;
- pronunciation and accent rules;
- recurring character intentions and physical constraints;
- approved exceptions tied to story events.

Drift is measured at take, session, chapter, book and series levels. Reviewers can approve an intentional evolution and create a new anchor with a documented relationship to the previous one. Later books begin with a regression calibration suite against the series archive.

### 3.9 Audio assembly and delivery

The production pipeline keeps lossless working and archive masters. A typical path is:

1. decode provider output without repeated lossy transcoding;
2. align transcript and retain timing maps;
3. repair or regenerate only failed regions;
4. edit breaths and pauses conservatively;
5. match room tone and spectral character across joins;
6. assemble approved takes into chapter masters;
7. apply de-click, de-noise, EQ, dynamics and limiting only when justified;
8. measure loudness, peaks, noise and silence in a two-pass process;
9. create distributor-specific files from the master;
10. validate chapter naming, order, metadata, artwork and checksums;
11. preserve a release manifest that can recreate the package.

The implemented ACX profile records the commonly published range of -23 dB to -18 dB RMS, peaks no louder than -3 dB, a noise floor no louder than -60 dB, at least 44.1 kHz and 192 kbps for the delivery encode. Distributor rules are external and can change, so every release profile carries a source date and must be revalidated at release time.

FFmpeg can provide repeatable analysis, loudness normalisation, silence detection and encoding, but commands must be generated from explicit profiles and their reports retained. A single “normalise audio” button is not an adequate mastering workflow.

### 3.10 Illustrated story companion

The visual companion is not a page-by-page slideshow and not a prompt stream. It has its own directed production model:

- an approved visual treatment and style bible;
- character turnarounds, expression sheets and costume states;
- location, prop, architecture, weather, light and period references;
- a shot grammar defining lens feel, framing, movement and transitions;
- scene-level dramatic beats linked to narration timing;
- layered foreground, subject, midground, background, atmosphere and light assets;
- masks, depth maps and occlusion rules for restrained motion;
- continuity keys for cast, place, time, weather and story state;
- negative rules against generic compositions, visual repetition, malformed detail and modern anachronisms;
- human approval of key frames before expensive animation or rendering.

A beat can hold on one strong composition, move through a layered illustration, use practical smoke, dust, rain or light overlays, or transition to a new shot. Movement should follow attention and dramatic change. Constant camera drift and parallax on every frame quickly becomes mechanical.

The engine should measure near-duplicate composition, character identity drift, palette drift, style inconsistency and excessive shot repetition. These checks inform review; they do not replace an art director.

Captions, chapter markers and accessible transcripts are generated from approved timing maps. WebVTT is a suitable interoperable caption output for web playback, while final video deliverables can include sidecar and embedded variants.

## 4. Current provider research and architectural implications

The provider landscape has useful but different strengths, and those strengths evolve quickly:

- OpenAI documents text-to-speech generation with instruction-based control and streaming output. Product disclosures must make clear that an end user is hearing an AI-generated voice. The adapter therefore needs instruction translation, streaming support and disclosure metadata rather than exposing model-specific prompts to the project domain.
- ElevenLabs documents text-to-speech, long-form production surfaces, voice settings and pronunciation tooling. Its adapter should expose only verified capabilities for the selected model and account, and should preserve request stitching, lexicon and voice-setting provenance.
- Azure AI Speech documents SSML and asynchronous batch synthesis. Its adapter can map canonical pronunciation, prosody and style direction into supported SSML while recording unsupported or voice-specific features instead of silently discarding them.
- Google Cloud Text-to-Speech documents asynchronous long-audio synthesis. Its adapter is useful for queued long-form routes but must still segment against project boundaries so review and repair remain local rather than forcing a complete-book regeneration.

The conclusion is not to choose one permanent winner. It is to maintain a provider-neutral contract, verified capability snapshots and a quality harness that can compare routes using the same calibration material.

## 5. Evaluation programme

A high-quality system needs a repeatable evaluation library, not anecdotal demos.

### 5.1 Golden corpus

Maintain rights-cleared excerpts covering genres, sentence structures, accents, names, emotional states, dialogue density, humour, violence, intimacy, exposition and difficult punctuation. Include deliberate traps such as final-word truncation, abbreviations, Roman numerals, footnotes, em dashes, ellipses, nested quotations and scene breaks.

### 5.2 Blind review

Reviewers should compare anonymised candidate takes using a consistent rubric:

- manuscript fidelity;
- intelligibility;
- narrative authority;
- listener relationship;
- intention and subtext;
- emotional credibility;
- character distinction;
- rhythm and breath;
- continuity with context;
- fatigue after extended listening;
- technical cleanliness.

Pairwise preference and failure tags are more actionable than a single overall score. Reviewer disagreement is retained rather than averaged away.

### 5.3 Long-session tests

A voice that sounds impressive for thirty seconds can become tiring or repetitive over an hour. Evaluation should include complete chapters, joins across production sessions, regeneration of an isolated paragraph, and regression against an earlier book.

### 5.4 Acceptance gates

A release cannot advance when any of these remain unresolved:

- source mismatch or missing text;
- invalid or expired voice rights;
- unapproved pronunciation with material impact;
- no eligible provider route;
- failed transcript or final-word coverage;
- failed delivery profile;
- unresolved high-severity continuity drift;
- unapproved chapter assembly;
- missing release metadata, artwork rights or checksums.

## 6. Security, privacy and rights

Manuscripts, voice samples, unreleased recordings, consent records and project bibles are sensitive production data.

Required controls include:

- private object storage with project-scoped access;
- encryption in transit and at rest;
- server-only provider credentials;
- separate launch and session signing secrets;
- short-lived signed launch assertions with audience, issuer, nonce and replay protection;
- isolated project/workspace authorisation on every API action;
- no raw manuscript or audio content in routine logs;
- content hashes and opaque identifiers in audit records;
- retention and deletion controls by provider and project;
- explicit export and data-processing records;
- malware and format validation on upload;
- no public indexing, embedding or open cross-origin access for the studio runtime.

The current source foundation binds the API to loopback by default, requires a token in production, limits request size, omits body logging and applies no-store/noindex headers. The web source is hidden from indexing and the EVAVO hub card is fail-closed until provisioning, entitlement and signed launch are implemented.

## 7. Product data model

The durable entities should include:

- Workspace and Project
- Series, Book and ManuscriptRevision
- Chapter, Scene and SourceSegment
- Character, Location, Term and PronunciationEntry
- StoryBibleRevision and VisualBibleRevision
- VoiceIdentity, VoiceRightsRecord and ConsentRecord
- NarratorProfile, CharacterVoiceProfile and ContinuityAnchor
- PerformancePlanRevision and SegmentDirection
- ProviderAdapterVersion and CapabilitySnapshot
- GenerationJob, ProviderAttempt and UsageRecord
- AudioAsset, Take, TranscriptAlignment and QualityFinding
- Review, Approval and ApprovedTakeAssignment
- ChapterAssembly, MasteringProfile and ReleasePackage
- VisualBeat, Shot, LayerAsset, RenderJob and CaptionTrack
- AuditEvent and SignedLaunchSession

Mutable workflow state should never overwrite immutable evidence. Approvals point to exact revisions and assets.

## 8. Delivery roadmap

### Phase A — completed foundation

- exact-source segmentation and stable identifiers;
- initial performance-direction proposal;
- rights and consent validation;
- capability-based provider ranking;
- continuity-drift assessment;
- transcript, final-word and technical audio gates;
- candidate-take scoring and selection;
- scene-level visual-beat planning;
- API, CLI, private web shell and EVAVO hub manifest;
- executable tests and architecture checks.

### Phase B — persistent production core

- PostgreSQL schema and migrations;
- encrypted object storage and content-addressed assets;
- workspaces, projects and role-based access;
- immutable audit journal;
- upload and manuscript parser workers;
- story and pronunciation bible review UI;
- signed EVAVO hub launch receiver and session boundary.

### Phase C — first provider and audio loop

- provider SDK and one production adapter selected by verified capability;
- queue, leases, idempotency and cost reservations;
- calibration suite workflow;
- generated take ingestion and provenance;
- speech-to-text alignment;
- FFmpeg/ffprobe analysis worker;
- waveform, transcript and context review UI;
- surgical regeneration and approved-take assembly.

### Phase D — professional audiobook delivery

- chapter editor and continuity dashboard;
- mastering profiles and two-pass reports;
- metadata, artwork and release package workflow;
- complete-chapter listening reviews;
- ACX and other distributor validators;
- accessible transcript and caption exports;
- usage, cost and provider performance reporting.

### Phase E — visual story production

- visual treatment and bible editor;
- character and location reference workflow;
- shot and layered-asset planning;
- image and animation adapters;
- continuity and repetition QA;
- parallax, practical-overlay and caption render pipeline;
- chapter and complete-book video assembly.

## 9. Primary technical sources reviewed

These sources are architecture inputs, not permanent provider guarantees. Adapter capability snapshots must be verified against current provider documentation and the actual account before production.

- OpenAI, Text-to-speech guide: https://platform.openai.com/docs/guides/text-to-speech
- ElevenLabs, Text to Speech documentation: https://elevenlabs.io/docs/overview/capabilities/text-to-speech
- Microsoft, Speech Synthesis Markup Language: https://learn.microsoft.com/azure/ai-services/speech-service/speech-synthesis-markup
- Microsoft, Batch synthesis API: https://learn.microsoft.com/azure/ai-services/speech-service/batch-synthesis
- Google Cloud, Long Audio Synthesis: https://cloud.google.com/text-to-speech/docs/create-audio-text-long-audio-synthesis
- ACX, Audio submission requirements: https://help.acx.com/s/article/what-are-the-acx-audio-submission-requirements
- FFmpeg, loudnorm and audio analysis filters: https://ffmpeg.org/ffmpeg-filters.html
- W3C, WebVTT: https://www.w3.org/TR/webvtt1/
