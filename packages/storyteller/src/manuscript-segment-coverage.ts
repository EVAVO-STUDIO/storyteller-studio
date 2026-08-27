import {
  DEFAULT_MAX_DETAILED_FINDINGS,
  MAX_MAX_DETAILED_FINDINGS,
  boundedFindingCollector,
  canonicalLocale,
  hashUtf8,
  requireSafeInteger,
  requireSource,
  stableHash,
} from "./manuscript-integrity-internal.js";
import type {
  ManuscriptIntegritySegment,
  ManuscriptSegmentCoverageOptions,
  ManuscriptSegmentCoverageReport,
} from "./manuscript-integrity-types.js";

function coverageFingerprint(
  report: Omit<ManuscriptSegmentCoverageReport, "fingerprint">,
): string {
  return stableHash(report);
}

interface WordSpan {
  start: number;
  end: number;
}

function collectWordSpans(
  source: string,
  locale: string,
): Readonly<{
  spans: readonly WordSpan[];
  mode: "intl-segmenter" | "unicode-regex-fallback";
}> {
  if (typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter(locale, { granularity: "word" });
    const spans: WordSpan[] = [];
    for (const item of segmenter.segment(source)) {
      if (!item.isWordLike) continue;
      spans.push(Object.freeze({
        start: item.index,
        end: item.index + item.segment.length,
      }));
    }
    return Object.freeze({ spans: Object.freeze(spans), mode: "intl-segmenter" });
  }

  const spans: WordSpan[] = [];
  const pattern = /[\p{L}\p{N}]+(?:[’'][\p{L}\p{N}]+)*/gu;
  for (const match of source.matchAll(pattern)) {
    const start = match.index ?? 0;
    spans.push(Object.freeze({ start, end: start + match[0].length }));
  }
  return Object.freeze({ spans: Object.freeze(spans), mode: "unicode-regex-fallback" });
}

function mergeIntervals(
  intervals: readonly Readonly<{ start: number; end: number }>[],
): readonly Readonly<{ start: number; end: number }>[] {
  const merged: Array<{ start: number; end: number }> = [];
  for (const interval of intervals) {
    const last = merged.at(-1);
    if (!last || interval.start > last.end) {
      merged.push({ start: interval.start, end: interval.end });
      continue;
    }
    last.end = Math.max(last.end, interval.end);
  }
  return Object.freeze(merged.map((interval) => Object.freeze({ ...interval })));
}

function nonWhitespaceCodeUnitCount(source: string): number {
  return source.replace(/\s/gu, "").length;
}

function ratio(numerator: number, denominator: number): number {
  if (denominator === 0) return 1;
  return Number((numerator / denominator).toFixed(6));
}

export function auditManuscriptSegmentCoverage(
  source: string,
  segments: readonly ManuscriptIntegritySegment[],
  options: ManuscriptSegmentCoverageOptions = {},
): ManuscriptSegmentCoverageReport {
  requireSource(source);
  if (!Array.isArray(segments)) {
    throw new Error("MANUSCRIPT_SEGMENTS_ARRAY_REQUIRED");
  }
  const locale = canonicalLocale(options.locale);
  const requireWhitespaceCoverage = options.requireWhitespaceCoverage ?? false;
  const maxDetailedFindings = requireSafeInteger(
    options.maxDetailedFindings ?? DEFAULT_MAX_DETAILED_FINDINGS,
    1,
    MAX_MAX_DETAILED_FINDINGS,
    "MANUSCRIPT_SEGMENT_FINDING_LIMIT_INVALID",
  );
  const collector = boundedFindingCollector(maxDetailedFindings);
  const sourceHash = hashUtf8(source);
  const validIntervals: Array<{ start: number; end: number; id: string }> = [];
  const seenIds = new Set<string>();
  const seenOrdinals = new Set<number>();
  let previousInputStart = -1;
  let previousOrdinal = -1;

  for (const segment of segments) {
    const id = typeof segment?.id === "string" ? segment.id.trim() : "";
    if (!id) {
      collector.add({
        code: "MANUSCRIPT_SEGMENT_ID_REQUIRED",
        severity: "error",
        message: "Every manuscript segment requires a stable identifier.",
      });
      continue;
    }
    if (seenIds.has(id)) {
      collector.add({
        code: "MANUSCRIPT_SEGMENT_ID_DUPLICATE",
        severity: "error",
        message: `Segment identifier ${id} is duplicated.`,
        segmentId: id,
      });
    }
    seenIds.add(id);

    if (segment.ordinal !== undefined) {
      if (!Number.isSafeInteger(segment.ordinal) || segment.ordinal < 1) {
        collector.add({
          code: "MANUSCRIPT_SEGMENT_ORDINAL_INVALID",
          severity: "error",
          message: `Segment ${id} has an invalid ordinal.`,
          segmentId: id,
        });
      } else {
        if (seenOrdinals.has(segment.ordinal)) {
          collector.add({
            code: "MANUSCRIPT_SEGMENT_ORDINAL_DUPLICATE",
            severity: "error",
            message: `Segment ordinal ${segment.ordinal} is duplicated.`,
            segmentId: id,
          });
        }
        if (previousOrdinal >= 0 && segment.ordinal <= previousOrdinal) {
          collector.add({
            code: "MANUSCRIPT_SEGMENT_ORDINAL_OUT_OF_ORDER",
            severity: "error",
            message: `Segment ${id} is not in strictly increasing ordinal order.`,
            segmentId: id,
          });
        }
        seenOrdinals.add(segment.ordinal);
        previousOrdinal = segment.ordinal;
      }
    }

    if (
      !Number.isSafeInteger(segment.sourceStart)
      || !Number.isSafeInteger(segment.sourceEnd)
      || segment.sourceStart < 0
      || segment.sourceEnd <= segment.sourceStart
      || segment.sourceEnd > source.length
    ) {
      collector.add({
        code: "MANUSCRIPT_SEGMENT_RANGE_INVALID",
        severity: "error",
        message: `Segment ${id} has an invalid immutable source range.`,
        segmentId: id,
      });
      continue;
    }
    if (previousInputStart > segment.sourceStart) {
      collector.add({
        code: "MANUSCRIPT_SEGMENT_SOURCE_ORDER_INVALID",
        severity: "error",
        message: `Segment ${id} appears before an earlier source span in the supplied order.`,
        segmentId: id,
        sourceStart: segment.sourceStart,
        sourceEnd: segment.sourceEnd,
      });
    }
    previousInputStart = segment.sourceStart;

    if (segment.sourceHash !== undefined && segment.sourceHash !== sourceHash) {
      collector.add({
        code: "MANUSCRIPT_SEGMENT_SOURCE_HASH_MISMATCH",
        severity: "error",
        message: `Segment ${id} belongs to a different immutable manuscript revision.`,
        segmentId: id,
      });
      continue;
    }
    if (source.slice(segment.sourceStart, segment.sourceEnd) !== segment.text) {
      collector.add({
        code: "MANUSCRIPT_SEGMENT_SOURCE_TEXT_MISMATCH",
        severity: "error",
        message: `Segment ${id} does not exactly match its immutable source span.`,
        segmentId: id,
        sourceStart: segment.sourceStart,
        sourceEnd: segment.sourceEnd,
      });
      continue;
    }
    validIntervals.push({
      start: segment.sourceStart,
      end: segment.sourceEnd,
      id,
    });
  }

  validIntervals.sort((left, right) =>
    left.start - right.start
    || left.end - right.end
    || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
  );
  let previousEnd = -1;
  for (const interval of validIntervals) {
    if (interval.start < previousEnd) {
      collector.add({
        code: "MANUSCRIPT_SEGMENT_RANGE_OVERLAP",
        severity: "error",
        message: `Segment ${interval.id} overlaps another immutable source span.`,
        segmentId: interval.id,
        sourceStart: interval.start,
        sourceEnd: interval.end,
      });
    }
    previousEnd = Math.max(previousEnd, interval.end);
  }

  const mergedIntervals = mergeIntervals(validIntervals);
  const gaps: Array<{ start: number; end: number; significant: boolean }> = [];
  let cursor = 0;
  for (const interval of mergedIntervals) {
    if (interval.start > cursor) {
      const gapText = source.slice(cursor, interval.start);
      gaps.push({
        start: cursor,
        end: interval.start,
        significant: /\S/u.test(gapText),
      });
    }
    cursor = Math.max(cursor, interval.end);
  }
  if (cursor < source.length) {
    const gapText = source.slice(cursor);
    gaps.push({
      start: cursor,
      end: source.length,
      significant: /\S/u.test(gapText),
    });
  }

  let whitespaceGapCount = 0;
  let uncoveredNonWhitespaceCodeUnits = 0;
  for (const gap of gaps) {
    const gapText = source.slice(gap.start, gap.end);
    uncoveredNonWhitespaceCodeUnits += nonWhitespaceCodeUnitCount(gapText);
    if (gap.significant) {
      collector.add({
        code: "MANUSCRIPT_SEGMENT_GAP_NON_WHITESPACE",
        severity: "error",
        message: "A non-whitespace manuscript span is not represented by any valid segment.",
        sourceStart: gap.start,
        sourceEnd: gap.end,
      });
    } else {
      whitespaceGapCount += 1;
      if (requireWhitespaceCoverage) {
        collector.add({
          code: "MANUSCRIPT_SEGMENT_GAP_WHITESPACE",
          severity: "error",
          message: "Strict source coverage requires separator whitespace to be represented.",
          sourceStart: gap.start,
          sourceEnd: gap.end,
        });
      }
    }
  }
  if (whitespaceGapCount > 0 && !requireWhitespaceCoverage) {
    collector.add({
      code: "MANUSCRIPT_SEGMENT_SEPARATOR_WHITESPACE_OMITTED",
      severity: "info",
      message: `${whitespaceGapCount} separator-whitespace span(s) are omitted without losing manuscript words.`,
    });
  }

  const words = collectWordSpans(source, locale);
  let coveredWordCount = 0;
  let missingWordCount = 0;
  let partialWordCount = 0;
  let intervalIndex = 0;
  let finalWordCovered = words.spans.length === 0;
  for (let wordIndex = 0; wordIndex < words.spans.length; wordIndex += 1) {
    const word = words.spans[wordIndex];
    if (!word) continue;
    while (
      intervalIndex < mergedIntervals.length
      && (mergedIntervals[intervalIndex]?.end ?? 0) <= word.start
    ) {
      intervalIndex += 1;
    }
    const interval = mergedIntervals[intervalIndex];
    const covered = Boolean(
      interval
      && interval.start <= word.start
      && interval.end >= word.end
    );
    if (covered) {
      coveredWordCount += 1;
      if (wordIndex === words.spans.length - 1) finalWordCovered = true;
      continue;
    }
    const partial = Boolean(
      interval
      && interval.start < word.end
      && interval.end > word.start
    );
    if (partial) partialWordCount += 1;
    else missingWordCount += 1;
    collector.add({
      code: partial
        ? "MANUSCRIPT_SEGMENT_WORD_PARTIALLY_COVERED"
        : "MANUSCRIPT_SEGMENT_WORD_UNCOVERED",
      severity: "error",
      message: partial
        ? "A manuscript word crosses an invalid segment boundary and is only partially covered."
        : "A manuscript word is missing from all valid segments.",
      sourceStart: word.start,
      sourceEnd: word.end,
    });
  }
  if (!finalWordCovered) {
    collector.add({
      code: "MANUSCRIPT_SEGMENT_FINAL_WORD_UNCOVERED",
      severity: "error",
      message: "The final manuscript word is not completely represented by a valid segment.",
    });
  }

  const omitted = collector.omitted();
  if (omitted > 0) {
    collector.findings.push(Object.freeze({
      code: "MANUSCRIPT_SEGMENT_FINDINGS_TRUNCATED",
      severity: "error",
      message: `${omitted} additional coverage findings were omitted from the bounded report.`,
    }));
  }

  const sourceNonWhitespaceCount = nonWhitespaceCodeUnitCount(source);
  const coveredNonWhitespaceCount = Math.max(
    0,
    sourceNonWhitespaceCount - uncoveredNonWhitespaceCodeUnits,
  );
  const exactSourceCoverage = mergedIntervals.length === 1
    && mergedIntervals[0]?.start === 0
    && mergedIntervals[0]?.end === source.length;
  const findings = Object.freeze([...collector.findings]);
  const partial: Omit<ManuscriptSegmentCoverageReport, "fingerprint"> = {
    ok: !findings.some((finding) => finding.severity === "error")
      && coveredWordCount === words.spans.length
      && coveredNonWhitespaceCount === sourceNonWhitespaceCount
      && finalWordCovered
      && (!requireWhitespaceCoverage || exactSourceCoverage),
    sourceHash,
    segmentCount: segments.length,
    validSegmentCount: validIntervals.length,
    sourceWordCount: words.spans.length,
    coveredWordCount,
    missingWordCount,
    partialWordCount,
    wordCoverage: ratio(coveredWordCount, words.spans.length),
    sourceNonWhitespaceCodeUnitCount: sourceNonWhitespaceCount,
    coveredNonWhitespaceCodeUnitCount: coveredNonWhitespaceCount,
    nonWhitespaceCoverage: ratio(
      coveredNonWhitespaceCount,
      sourceNonWhitespaceCount,
    ),
    exactSourceCoverage,
    whitespaceGapCount,
    finalWordCovered,
    segmentationMode: words.mode,
    unicodeVersion: process.versions.unicode ?? "unknown",
    findings,
  };
  return Object.freeze({ ...partial, fingerprint: coverageFingerprint(partial) });
}

export function assertCompleteManuscriptCoverage(
  report: ManuscriptSegmentCoverageReport,
): void {
  if (!report.ok) throw new Error("MANUSCRIPT_SEGMENT_COVERAGE_INCOMPLETE");
}
