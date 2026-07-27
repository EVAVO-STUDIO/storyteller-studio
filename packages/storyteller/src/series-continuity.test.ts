import assert from "node:assert/strict";
import test from "node:test";
import { segmentManuscript } from "./index.js";
import {
  assessBookContinuity,
  buildSeriesRegressionSuite,
  createSeriesContinuityBible,
  promoteBookContinuity,
  verifySeriesContinuityBible,
  type BookContinuitySnapshot,
  type SeriesContinuityBible,
} from "./series-continuity.js";

function bible(): SeriesContinuityBible {
  return createSeriesContinuityBible(
    {
      seriesId: "series_north_road",
      title: "The North Road Trilogy",
      narratorAssignmentId: "assignment_narrator",
      voiceAssignments: [
        {
          id: "assignment_narrator",
          role: "narrator",
          voiceProfileId: "voice_narrator",
          voiceProfileRevision: 2,
          sourceKind: "synthetic-designed",
          continuityAnchorId: "anchor_narrator_v2",
          introducedInBookId: "book_one",
          approvedBy: "actor_owner",
          notes: ["Close listener relationship with restrained dramatic emphasis."],
        },
        {
          id: "assignment_mara",
          role: "character",
          characterId: "character_mara",
          voiceProfileId: "voice_mara",
          voiceProfileRevision: 1,
          sourceKind: "original-cast",
          continuityAnchorId: "anchor_mara_v1",
          introducedInBookId: "book_one",
          approvedBy: "actor_owner",
          notes: ["Consonant precision tightens under pressure."],
        },
      ],
      pronunciations: [
        {
          id: "pronunciation_aelwyn",
          writtenForm: "Aelwyn",
          canonicalForm: "AYL-win",
          language: "invented",
          context: "person-name",
          revision: 1,
          introducedInBookId: "book_one",
          approvedBy: "actor_owner",
        },
      ],
      acousticAnchors: [
        {
          voiceProfileId: "voice_narrator",
          continuityAnchorId: "anchor_narrator_v2",
          signature: {
            medianPitchHz: 118,
            pitchRangeSemitones: 7,
            speakingRateWpm: 156,
            pauseRatio: 0.19,
            energyRmsDb: -21,
          },
          approvedInBookId: "book_one",
          revision: 2,
        },
        {
          voiceProfileId: "voice_mara",
          continuityAnchorId: "anchor_mara_v1",
          signature: {
            medianPitchHz: 184,
            pitchRangeSemitones: 9,
            speakingRateWpm: 168,
            pauseRatio: 0.16,
            energyRmsDb: -20,
          },
          approvedInBookId: "book_one",
          revision: 1,
        },
      ],
      performancePrinciples: [
        "Maintain a clear and intimate listener relationship.",
        "Differentiate characters through intention, rhythm and placement before accent.",
        "Let silence carry unresolved dramatic meaning.",
      ],
      prohibitedShortcuts: [
        "Do not turn emotional intensity into automatic volume.",
        "Do not use caricature accents as the primary character distinction.",
      ],
    },
    new Date("2026-07-27T00:00:00.000Z"),
  );
}

function compatibleSnapshot(overrides: Partial<BookContinuitySnapshot> = {}): BookContinuitySnapshot {
  return {
    seriesId: "series_north_road",
    bookId: "book_two",
    ordinal: 2,
    narratorAssignmentId: "assignment_narrator",
    voices: [
      {
        assignmentId: "assignment_narrator",
        voiceProfileId: "voice_narrator",
        voiceProfileRevision: 2,
        continuityAnchorId: "anchor_narrator_v2",
        acousticSignature: {
          medianPitchHz: 120,
          pitchRangeSemitones: 7.4,
          speakingRateWpm: 158,
          pauseRatio: 0.2,
          energyRmsDb: -20.7,
          embeddingDistanceFromAnchor: 0.04,
        },
      },
      {
        assignmentId: "assignment_mara",
        voiceProfileId: "voice_mara",
        voiceProfileRevision: 1,
        continuityAnchorId: "anchor_mara_v1",
        acousticSignature: {
          medianPitchHz: 181,
          pitchRangeSemitones: 8.7,
          speakingRateWpm: 166,
          pauseRatio: 0.17,
          energyRmsDb: -20.4,
          embeddingDistanceFromAnchor: 0.05,
        },
      },
    ],
    pronunciations: [
      {
        pronunciationId: "pronunciation_aelwyn",
        writtenForm: "Aelwyn",
        canonicalForm: "AYL-win",
        language: "invented",
        context: "person-name",
      },
    ],
    approvedChanges: [],
    ...overrides,
  };
}

test("series continuity bible is fingerprinted and structurally verifiable", () => {
  const value = bible();
  assert.equal(value.revision, 1);
  assert.match(value.fingerprint, /^[a-f0-9]{64}$/u);
  assert.deepEqual(verifySeriesContinuityBible(value), []);
});

test("compatible later-book voices remain inside the approved continuity envelope", () => {
  const assessment = assessBookContinuity(bible(), compatibleSnapshot());
  assert.equal(assessment.status, "compatible");
  assert.equal(assessment.score >= 88, true);
  assert.equal(assessment.voiceScores.assignment_narrator > 85, true);
});

test("silent narrator recasts are blocked even when the replacement sounds stable", () => {
  const snapshot = compatibleSnapshot({
    voices: compatibleSnapshot().voices.map((voice) =>
      voice.assignmentId === "assignment_narrator"
        ? { ...voice, voiceProfileId: "voice_unapproved_recast" }
        : voice,
    ),
  });
  const assessment = assessBookContinuity(bible(), snapshot);
  assert.equal(assessment.status, "blocked");
  assert.equal(assessment.findings.some((finding) => finding.code === "SERIES_VOICE_RECAST_UNAPPROVED"), true);
});

test("approved recasts remain review items until promoted into series canon", () => {
  const snapshot = compatibleSnapshot({
    voices: compatibleSnapshot().voices.map((voice) =>
      voice.assignmentId === "assignment_mara"
        ? { ...voice, voiceProfileId: "voice_mara_recast", voiceProfileRevision: 2 }
        : voice,
    ),
    approvedChanges: [
      {
        id: "change_mara_recast",
        kind: "voice-recast",
        targetId: "assignment_mara",
        fromRevision: 1,
        toRevision: 2,
        rationale: "The original performer is unavailable; a rights-cleared recast was approved after blind continuity review.",
        approvedBy: "actor_owner",
        approvedAt: "2026-07-27T02:00:00.000Z",
      },
    ],
  });
  const assessment = assessBookContinuity(bible(), snapshot);
  assert.equal(assessment.status, "review");
  assert.equal(assessment.findings.some((finding) => finding.code === "SERIES_VOICE_RECAST_APPROVED_REVIEW"), true);
});

test("pronunciation conflicts are blocked while new terms remain proposals", () => {
  const snapshot = compatibleSnapshot({
    pronunciations: [
      {
        pronunciationId: "pronunciation_aelwyn",
        writtenForm: "Aelwyn",
        canonicalForm: "EEL-win",
        language: "invented",
        context: "person-name",
      },
      {
        writtenForm: "Tor Cael",
        canonicalForm: "tor KAYL",
        language: "invented",
        context: "place-name",
      },
    ],
  });
  const assessment = assessBookContinuity(bible(), snapshot);
  assert.equal(assessment.status, "blocked");
  assert.equal(assessment.findings.some((finding) => finding.code === "SERIES_PRONUNCIATION_CONFLICT"), true);
  assert.deepEqual(assessment.proposedPronunciations.map((entry) => entry.writtenForm), ["Tor Cael"]);
});

test("promotion increments revision and links the previous fingerprint", () => {
  const current = bible();
  const promoted = promoteBookContinuity(current, compatibleSnapshot(), {
    approvedBy: "actor_owner",
    approvedAt: new Date("2026-07-27T03:00:00.000Z"),
  });
  assert.equal(promoted.revision, 2);
  assert.equal(promoted.previousFingerprint, current.fingerprint);
  assert.notEqual(promoted.fingerprint, current.fingerprint);
  assert.deepEqual(verifySeriesContinuityBible(promoted), []);
});

test("regression suite spans performance risks without selecting the same segment twice", () => {
  const manuscript = segmentManuscript(`Chapter One\n\nThe valley held the morning in a pale, unbroken stillness that stretched from the abandoned mill to the black line of pines beyond the river, and no bird crossed it.\n\n“Do not open that door!” Mara said. “Not until I tell you why.”\n\nHe waited.\n\nThe hinges answered for him.\n\nChapter Two\n\nThey travelled for three days beneath a blank sky, speaking only when the road divided or the horses needed water, and the quiet between them acquired the weight of an agreement neither had made.\n\n“Then ask me,” he said.\n\nShe could not.`, { maximumCharacters: 900 });
  const suite = buildSeriesRegressionSuite(manuscript.segments, 10);
  assert.equal(suite.length >= 5, true);
  assert.equal(new Set(suite.map((item) => item.segmentId)).size, suite.length);
  assert.equal(new Set(suite.map((item) => item.category)).size >= 4, true);
  assert.equal(suite.some((item) => item.category === "chapter-ending"), true);
});
