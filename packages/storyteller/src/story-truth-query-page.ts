import { stableHash } from "./index.js";
import { verifyStoryTruthLedger } from "./story-truth-ledger.js";
import {
  isHash,
  isInteger,
  isSafeId,
  sortedUnique,
} from "./story-truth-internal.js";
import type {
  StoryTruthLedger,
  StoryTruthSeverity,
} from "./story-truth-types.js";
import type {
  StoryTruthPageInput,
  StoryTruthQueryCollection,
  StoryTruthQueryPage,
} from "./story-truth-query-types.js";

const QUERY_CURSOR_VERSION = 1 as const;
const DEFAULT_QUERY_LIMIT = 50;
const MAX_QUERY_LIMIT = 200;
const MAX_CURSOR_LENGTH = 2_048;
const COLLECTIONS: readonly StoryTruthQueryCollection[] = [
  "entities",
  "facts",
  "timeline",
  "findings",
  "review",
];

export const STORY_TRUTH_QUERY_SEVERITIES = new Set<StoryTruthSeverity>([
  "info",
  "warning",
  "error",
]);

interface CursorCore {
  version: typeof QUERY_CURSOR_VERSION;
  collection: StoryTruthQueryCollection;
  ledgerFingerprint: string;
  queryFingerprint: string;
  offset: number;
}

interface CursorEnvelope extends CursorCore {
  checksum: string;
}

function boundedLimit(value: number | undefined): number {
  if (value === undefined) return DEFAULT_QUERY_LIMIT;
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_QUERY_LIMIT) {
    throw new Error("STORY_TRUTH_QUERY_LIMIT_INVALID");
  }
  return value;
}

function encodeCursor(core: CursorCore): string {
  const envelope: CursorEnvelope = {
    ...core,
    checksum: stableHash(core),
  };
  return Buffer.from(JSON.stringify(envelope), "utf8").toString("base64url");
}

function decodeCursor(value: string): CursorEnvelope {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_CURSOR_LENGTH) {
    throw new Error("STORY_TRUTH_QUERY_CURSOR_INVALID");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw new Error("STORY_TRUTH_QUERY_CURSOR_INVALID");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("STORY_TRUTH_QUERY_CURSOR_INVALID");
  }
  const candidate = parsed as Partial<CursorEnvelope>;
  const ledgerFingerprint = candidate.ledgerFingerprint;
  const queryFingerprint = candidate.queryFingerprint;
  const checksum = candidate.checksum;
  if (
    candidate.version !== QUERY_CURSOR_VERSION
    || typeof candidate.collection !== "string"
    || !COLLECTIONS.includes(candidate.collection as StoryTruthQueryCollection)
    || !isHash(ledgerFingerprint)
    || !isHash(queryFingerprint)
    || !Number.isSafeInteger(candidate.offset)
    || (candidate.offset ?? -1) < 0
    || !isHash(checksum)
  ) {
    throw new Error("STORY_TRUTH_QUERY_CURSOR_INVALID");
  }
  const core: CursorCore = {
    version: QUERY_CURSOR_VERSION,
    collection: candidate.collection as StoryTruthQueryCollection,
    ledgerFingerprint,
    queryFingerprint,
    offset: candidate.offset as number,
  };
  if (stableHash(core) !== checksum) {
    throw new Error("STORY_TRUTH_QUERY_CURSOR_INVALID");
  }
  return Object.freeze({ ...core, checksum });
}

export function pageStoryTruthRows<T>(
  ledger: StoryTruthLedger,
  collection: StoryTruthQueryCollection,
  queryFingerprint: string,
  rows: readonly T[],
  input: StoryTruthPageInput,
): StoryTruthQueryPage<T> {
  const limit = boundedLimit(input.limit);
  let offset = 0;
  if (input.cursor !== undefined) {
    const cursor = decodeCursor(input.cursor);
    if (cursor.collection !== collection) {
      throw new Error("STORY_TRUTH_QUERY_CURSOR_COLLECTION_MISMATCH");
    }
    if (cursor.ledgerFingerprint !== ledger.fingerprint) {
      throw new Error("STORY_TRUTH_QUERY_CURSOR_STALE");
    }
    if (cursor.queryFingerprint !== queryFingerprint) {
      throw new Error("STORY_TRUTH_QUERY_CURSOR_QUERY_MISMATCH");
    }
    offset = cursor.offset;
  }
  if (offset > rows.length) {
    throw new Error("STORY_TRUTH_QUERY_CURSOR_OFFSET_INVALID");
  }
  const data = Object.freeze(rows.slice(offset, offset + limit));
  const nextOffset = offset + data.length;
  const hasMore = nextOffset < rows.length;
  return Object.freeze({
    data,
    meta: Object.freeze({
      ledgerId: ledger.id,
      ledgerRevision: ledger.revision,
      ledgerFingerprint: ledger.fingerprint,
      collection,
      queryFingerprint,
      total: rows.length,
      returned: data.length,
      hasMore,
      ...(hasMore
        ? {
            nextCursor: encodeCursor({
              version: QUERY_CURSOR_VERSION,
              collection,
              ledgerFingerprint: ledger.fingerprint,
              queryFingerprint,
              offset: nextOffset,
            }),
          }
        : {}),
    }),
  });
}

export function validateStoryTruthLedgerForRead(ledger: StoryTruthLedger): void {
  const validation = verifyStoryTruthLedger(ledger);
  if (!validation.ok) {
    const codes = sortedUnique(validation.findings
      .filter((finding) => finding.severity === "error")
      .map((finding) => finding.code));
    throw new Error(`STORY_TRUTH_QUERY_LEDGER_INVALID:${codes.join(",") || "UNKNOWN"}`);
  }
}

export function optionalStoryTruthId(
  value: string | undefined,
  code: string,
): string | undefined {
  if (value === undefined) return undefined;
  if (!isSafeId(value)) throw new Error(code);
  return value;
}

export function optionalStoryTruthWorldOrder(
  value: number | undefined,
  code: string,
): number | undefined {
  if (value === undefined) return undefined;
  if (!isInteger(value)) throw new Error(code);
  return value;
}
