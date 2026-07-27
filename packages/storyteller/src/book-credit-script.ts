import {
  FileProjectStore,
  StoreConflictError,
  type StoredEnvelope,
} from "./project-store.js";
import { stableHash } from "./index.js";

export const BOOK_CREDIT_POLICY_SCHEMA_VERSION =
  "storyteller-book-credit-policy-v1" as const;
export const BOOK_CREDIT_SCRIPT_SCHEMA_VERSION =
  "storyteller-book-credit-script-v1" as const;

export type BookCreditKind = "opening" | "closing";
export type BookCreditProjectKind = "standalone" | "series";
export type BookCreditReviewRole = "editorial" | "rights";
export type BookCreditDecision = "approve" | "changes-requested";
export type BookCreditScriptStatus =
  | "draft"
  | "changes-requested"
  | "ready-for-approval"
  | "approved";

export type BookCreditToken =
  | "title"
  | "seriesTitle"
  | "volumeNumber"
  | "authorCredit"
  | "narratorCredit"
  | "copyrightNotice"
  | "productionCredit";

export interface BookCreditTemplate {
  kind: BookCreditKind;
  projectKind: BookCreditProjectKind;
  text: string;
  requiredTokens: readonly BookCreditToken[];
  fingerprint: string;
}

export interface BookCreditPolicy {
  schemaVersion: typeof BOOK_CREDIT_POLICY_SCHEMA_VERSION;
  id: string;
  version: string;
  languageTag: string;
  reviewedAt: string;
  sourceReference: string;
  maximumWords: number;
  templates: readonly BookCreditTemplate[];
  fingerprint: string;
}

export interface BookCreditMetadata {
  bookId: string;
  title: string;
  projectKind: BookCreditProjectKind;
  authorCredit: string;
  narratorCredit: string;
  copyrightNotice: string;
  productionCredit?: string;
  seriesTitle?: string;
  volumeNumber?: number;
}

export interface BookCreditReviewEntry {
  id: string;
  role: BookCreditReviewRole;
  reviewerId: string;
  decision: BookCreditDecision;
  checks: readonly string[];
  notes?: string;
  decidedAt: string;
  fingerprint: string;
}

export interface BookCreditApproval {
  finalConfirmationId: string;
  approvedByActorId: string;
  approvedAt: string;
  fingerprint: string;
}

export interface BookCreditScript {
  schemaVersion: typeof BOOK_CREDIT_SCRIPT_SCHEMA_VERSION;
  id: string;
  projectId: string;
  bookId: string;
  kind: BookCreditKind;
  projectKind: BookCreditProjectKind;
  policyId: string;
  policyVersion: string;
  policyFingerprint: string;
  metadataFingerprint: string;
  text: string;
  textHash: string;
  wordCount: number;
  reviews: readonly BookCreditReviewEntry[];
  status: BookCreditScriptStatus;
  approval?: BookCreditApproval;
  revision: number;
  previousFingerprint?: string;
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
}

export interface BookCreditScriptPublicView {
  id: string;
  bookId: string;
  kind: BookCreditKind;
  projectKind: BookCreditProjectKind;
  policyId: string;
  policyVersion: string;
  textHash: string;
  wordCount: number;
  latestDecisions: Readonly<Record<BookCreditReviewRole, BookCreditDecision | "pending">>;
  status: BookCreditScriptStatus;
  readyForApproval: boolean;
  revision: number;
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
}

export class BookCreditScriptError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "BookCreditScriptError";
    this.code = code;
  }
}

export class BookCreditScriptStoreConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookCreditScriptStoreConflictError";
  }
}

const ENTITY_TYPE = "book-credit-script" as const;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const SAFE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const LANGUAGE_TAG = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const TOKEN_PATTERN = /\{([A-Za-z][A-Za-z0-9]*)\}/gu;
const WORD_PATTERN = /[\p{L}\p{N}]+(?:[’'][\p{L}\p{N}]+)*/gu;
const HUMAN_BLOCKLIST = /^(?:system|worker|automation|automated|bot)(?:[_-]|$)/iu;
const MAX_TEXT_LENGTH = 4_000;
const MAX_METADATA_LENGTH = 1_000;
const MAX_NOTES_LENGTH = 4_000;
const MAX_TEMPLATES = 4;
const ALLOWED_TOKENS: ReadonlySet<BookCreditToken> = new Set([
  "title",
  "seriesTitle",
  "volumeNumber",
  "authorCredit",
  "narratorCredit",
  "copyrightNotice",
  "productionCredit",
]);
const REQUIRED_TEMPLATE_TOKENS: Readonly<
  Record<BookCreditKind, readonly BookCreditToken[]>
> = Object.freeze({
  opening: Object.freeze(["title", "authorCredit", "narratorCredit"]),
  closing: Object.freeze([
    "title",
    "authorCredit",
    "narratorCredit",
    "copyrightNotice",
  ]),
});
const REQUIRED_REVIEW_CHECKS: Readonly<
  Record<BookCreditReviewRole, readonly string[]>
> = Object.freeze({
  editorial: Object.freeze([
    "title-exact",
    "author-credit-exact",
    "narrator-credit-exact",
    "pronunciations-confirmed",
  ]),
  rights: Object.freeze([
    "copyright-notice-confirmed",
    "credit-entitlements-confirmed",
    "commercial-use-confirmed",
  ]),
});
const REQUIRED_REVIEW_ROLES = Object.freeze([
  "editorial",
  "rights",
] as const satisfies readonly BookCreditReviewRole[]);

function requireIdentifier(value: string, code: string): string {
  if (!SAFE_IDENTIFIER.test(value)) throw new BookCreditScriptError(code);
  return value;
}

function requireDate(value: string, code: string): string {
  if (!value || Number.isNaN(Date.parse(value))) throw new BookCreditScriptError(code);
  return value;
}

function requireText(value: string, maximum: number, code: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maximum || CONTROL_CHARACTERS.test(trimmed)) {
    throw new BookCreditScriptError(code);
  }
  return trimmed;
}

function requireHuman(value: string, code: string): string {
  requireIdentifier(value, code);
  if (HUMAN_BLOCKLIST.test(value)) throw new BookCreditScriptError(code);
  return value;
}

function wordCount(value: string): number {
  return [...value.matchAll(WORD_PATTERN)].length;
}

function tokenSet(text: string): ReadonlySet<string> {
  return new Set([...text.matchAll(TOKEN_PATTERN)].map((match) => match[1]!));
}

function templateFingerprint(
  template: Omit<BookCreditTemplate, "fingerprint">,
): string {
  return stableHash(template);
}

function policyFingerprint(
  policy: Omit<BookCreditPolicy, "fingerprint">,
): string {
  return stableHash(policy);
}

function reviewFingerprint(
  review: Omit<BookCreditReviewEntry, "fingerprint">,
): string {
  return stableHash(review);
}

function approvalFingerprint(
  approval: Omit<BookCreditApproval, "fingerprint">,
): string {
  return stableHash(approval);
}

function scriptFingerprint(
  script: Omit<BookCreditScript, "fingerprint">,
): string {
  return stableHash(script);
}

function assertTemplate(template: BookCreditTemplate): void {
  if (template.kind !== "opening" && template.kind !== "closing") {
    throw new BookCreditScriptError("BOOK_CREDIT_TEMPLATE_KIND_INVALID");
  }
  if (template.projectKind !== "standalone" && template.projectKind !== "series") {
    throw new BookCreditScriptError("BOOK_CREDIT_TEMPLATE_PROJECT_KIND_INVALID");
  }
  requireText(template.text, MAX_TEXT_LENGTH, "BOOK_CREDIT_TEMPLATE_TEXT_INVALID");
  const tokens = tokenSet(template.text);
  for (const token of tokens) {
    if (!ALLOWED_TOKENS.has(token as BookCreditToken)) {
      throw new BookCreditScriptError("BOOK_CREDIT_TEMPLATE_TOKEN_UNKNOWN");
    }
  }
  if (!Array.isArray(template.requiredTokens) || template.requiredTokens.length === 0) {
    throw new BookCreditScriptError("BOOK_CREDIT_TEMPLATE_REQUIRED_TOKENS_INVALID");
  }
  const required = new Set<BookCreditToken>();
  for (const token of template.requiredTokens) {
    if (!ALLOWED_TOKENS.has(token) || required.has(token) || !tokens.has(token)) {
      throw new BookCreditScriptError("BOOK_CREDIT_TEMPLATE_REQUIRED_TOKENS_INVALID");
    }
    required.add(token);
  }
  for (const token of REQUIRED_TEMPLATE_TOKENS[template.kind]) {
    if (!required.has(token)) {
      throw new BookCreditScriptError("BOOK_CREDIT_TEMPLATE_SEMANTIC_TOKEN_MISSING");
    }
  }
  if (
    template.projectKind === "series"
    && (!required.has("seriesTitle") || !required.has("volumeNumber"))
  ) {
    throw new BookCreditScriptError("BOOK_CREDIT_TEMPLATE_SERIES_TOKEN_MISSING");
  }
  const { fingerprint, ...partial } = template;
  if (templateFingerprint(partial) !== fingerprint) {
    throw new BookCreditScriptError("BOOK_CREDIT_TEMPLATE_FINGERPRINT_INVALID");
  }
}

export function createBookCreditPolicy(input: Readonly<{
  id: string;
  version: string;
  languageTag: string;
  reviewedAt: string;
  sourceReference: string;
  maximumWords: number;
  templates: readonly Omit<BookCreditTemplate, "fingerprint">[];
  now?: Date;
}>): BookCreditPolicy {
  requireIdentifier(input.id, "BOOK_CREDIT_POLICY_ID_INVALID");
  if (!SAFE_VERSION.test(input.version)) {
    throw new BookCreditScriptError("BOOK_CREDIT_POLICY_VERSION_INVALID");
  }
  if (!LANGUAGE_TAG.test(input.languageTag)) {
    throw new BookCreditScriptError("BOOK_CREDIT_POLICY_LANGUAGE_INVALID");
  }
  const now = input.now ?? new Date();
  if (Number.isNaN(now.getTime())) throw new BookCreditScriptError("BOOK_CREDIT_DATE_INVALID");
  requireDate(input.reviewedAt, "BOOK_CREDIT_POLICY_REVIEW_DATE_INVALID");
  if (Date.parse(input.reviewedAt) > now.getTime()) {
    throw new BookCreditScriptError("BOOK_CREDIT_POLICY_REVIEW_IN_FUTURE");
  }
  const sourceReference = requireText(
    input.sourceReference,
    MAX_METADATA_LENGTH,
    "BOOK_CREDIT_POLICY_SOURCE_INVALID",
  );
  if (!Number.isSafeInteger(input.maximumWords) || input.maximumWords < 10 || input.maximumWords > 500) {
    throw new BookCreditScriptError("BOOK_CREDIT_POLICY_WORD_LIMIT_INVALID");
  }
  if (!Array.isArray(input.templates) || input.templates.length !== MAX_TEMPLATES) {
    throw new BookCreditScriptError("BOOK_CREDIT_POLICY_TEMPLATES_INVALID");
  }
  const templateKeys = new Set<string>();
  const templates = input.templates.map((template) => {
    const base = Object.freeze({
      kind: template.kind,
      projectKind: template.projectKind,
      text: template.text,
      requiredTokens: Object.freeze([...template.requiredTokens]),
    });
    const completed = Object.freeze({ ...base, fingerprint: templateFingerprint(base) });
    assertTemplate(completed);
    const key = `${completed.kind}:${completed.projectKind}`;
    if (templateKeys.has(key)) {
      throw new BookCreditScriptError("BOOK_CREDIT_POLICY_TEMPLATE_DUPLICATE");
    }
    templateKeys.add(key);
    return completed;
  });
  for (const kind of ["opening", "closing"] as const) {
    for (const projectKind of ["standalone", "series"] as const) {
      if (!templateKeys.has(`${kind}:${projectKind}`)) {
        throw new BookCreditScriptError("BOOK_CREDIT_POLICY_TEMPLATE_MISSING");
      }
    }
  }
  const partial: Omit<BookCreditPolicy, "fingerprint"> = {
    schemaVersion: BOOK_CREDIT_POLICY_SCHEMA_VERSION,
    id: input.id,
    version: input.version,
    languageTag: input.languageTag,
    reviewedAt: input.reviewedAt,
    sourceReference,
    maximumWords: input.maximumWords,
    templates: Object.freeze(templates),
  };
  const policy = Object.freeze({ ...partial, fingerprint: policyFingerprint(partial) });
  assertBookCreditPolicy(policy);
  return policy;
}

export function assertBookCreditPolicy(policy: BookCreditPolicy): void {
  if (policy.schemaVersion !== BOOK_CREDIT_POLICY_SCHEMA_VERSION) {
    throw new BookCreditScriptError("BOOK_CREDIT_POLICY_SCHEMA_UNSUPPORTED");
  }
  requireIdentifier(policy.id, "BOOK_CREDIT_POLICY_ID_INVALID");
  if (!SAFE_VERSION.test(policy.version)) {
    throw new BookCreditScriptError("BOOK_CREDIT_POLICY_VERSION_INVALID");
  }
  if (!LANGUAGE_TAG.test(policy.languageTag)) {
    throw new BookCreditScriptError("BOOK_CREDIT_POLICY_LANGUAGE_INVALID");
  }
  requireDate(policy.reviewedAt, "BOOK_CREDIT_POLICY_REVIEW_DATE_INVALID");
  requireText(policy.sourceReference, MAX_METADATA_LENGTH, "BOOK_CREDIT_POLICY_SOURCE_INVALID");
  if (!Number.isSafeInteger(policy.maximumWords) || policy.maximumWords < 10 || policy.maximumWords > 500) {
    throw new BookCreditScriptError("BOOK_CREDIT_POLICY_WORD_LIMIT_INVALID");
  }
  if (!Array.isArray(policy.templates) || policy.templates.length !== MAX_TEMPLATES) {
    throw new BookCreditScriptError("BOOK_CREDIT_POLICY_TEMPLATES_INVALID");
  }
  const keys = new Set<string>();
  for (const template of policy.templates) {
    assertTemplate(template);
    const key = `${template.kind}:${template.projectKind}`;
    if (keys.has(key)) throw new BookCreditScriptError("BOOK_CREDIT_POLICY_TEMPLATE_DUPLICATE");
    keys.add(key);
  }
  const { fingerprint, ...partial } = policy;
  if (policyFingerprint(partial) !== fingerprint) {
    throw new BookCreditScriptError("BOOK_CREDIT_POLICY_FINGERPRINT_INVALID");
  }
}

function metadataValues(metadata: BookCreditMetadata): Readonly<Record<BookCreditToken, string>> {
  requireIdentifier(metadata.bookId, "BOOK_CREDIT_BOOK_ID_INVALID");
  const title = requireText(metadata.title, MAX_METADATA_LENGTH, "BOOK_CREDIT_TITLE_INVALID");
  const authorCredit = requireText(
    metadata.authorCredit,
    MAX_METADATA_LENGTH,
    "BOOK_CREDIT_AUTHOR_INVALID",
  );
  const narratorCredit = requireText(
    metadata.narratorCredit,
    MAX_METADATA_LENGTH,
    "BOOK_CREDIT_NARRATOR_INVALID",
  );
  const copyrightNotice = requireText(
    metadata.copyrightNotice,
    MAX_METADATA_LENGTH,
    "BOOK_CREDIT_COPYRIGHT_INVALID",
  );
  if (metadata.projectKind !== "standalone" && metadata.projectKind !== "series") {
    throw new BookCreditScriptError("BOOK_CREDIT_PROJECT_KIND_INVALID");
  }
  let seriesTitle = "";
  let volumeNumber = "";
  if (metadata.projectKind === "series") {
    seriesTitle = requireText(
      metadata.seriesTitle ?? "",
      MAX_METADATA_LENGTH,
      "BOOK_CREDIT_SERIES_TITLE_INVALID",
    );
    if (!Number.isSafeInteger(metadata.volumeNumber) || metadata.volumeNumber! < 1 || metadata.volumeNumber! > 10_000) {
      throw new BookCreditScriptError("BOOK_CREDIT_VOLUME_NUMBER_INVALID");
    }
    volumeNumber = String(metadata.volumeNumber);
  }
  const productionCredit = metadata.productionCredit === undefined
    ? ""
    : requireText(
        metadata.productionCredit,
        MAX_METADATA_LENGTH,
        "BOOK_CREDIT_PRODUCTION_INVALID",
      );
  return Object.freeze({
    title,
    seriesTitle,
    volumeNumber,
    authorCredit,
    narratorCredit,
    copyrightNotice,
    productionCredit,
  });
}

function latestReviews(
  script: BookCreditScript,
): ReadonlyMap<BookCreditReviewRole, BookCreditReviewEntry> {
  const result = new Map<BookCreditReviewRole, BookCreditReviewEntry>();
  for (const review of script.reviews) result.set(review.role, review);
  return result;
}

function statusFromReviews(
  reviews: readonly BookCreditReviewEntry[],
): Exclude<BookCreditScriptStatus, "approved"> {
  const latest = new Map<BookCreditReviewRole, BookCreditReviewEntry>();
  for (const review of reviews) latest.set(review.role, review);
  if ([...latest.values()].some((review) => review.decision === "changes-requested")) {
    return "changes-requested";
  }
  if (
    REQUIRED_REVIEW_ROLES.every((role) => latest.get(role)?.decision === "approve")
    && new Set(REQUIRED_REVIEW_ROLES.map((role) => latest.get(role)!.reviewerId)).size
      === REQUIRED_REVIEW_ROLES.length
  ) {
    return "ready-for-approval";
  }
  return "draft";
}

function assertReview(review: BookCreditReviewEntry): void {
  requireIdentifier(review.id, "BOOK_CREDIT_REVIEW_ID_INVALID");
  if (review.role !== "editorial" && review.role !== "rights") {
    throw new BookCreditScriptError("BOOK_CREDIT_REVIEW_ROLE_INVALID");
  }
  requireHuman(review.reviewerId, "BOOK_CREDIT_REVIEWER_INVALID");
  if (review.decision !== "approve" && review.decision !== "changes-requested") {
    throw new BookCreditScriptError("BOOK_CREDIT_REVIEW_DECISION_INVALID");
  }
  if (!Array.isArray(review.checks)) {
    throw new BookCreditScriptError("BOOK_CREDIT_REVIEW_CHECKS_INVALID");
  }
  const checks = new Set<string>();
  for (const check of review.checks) {
    const checked = requireText(check, 120, "BOOK_CREDIT_REVIEW_CHECKS_INVALID");
    if (checks.has(checked)) throw new BookCreditScriptError("BOOK_CREDIT_REVIEW_CHECKS_DUPLICATE");
    checks.add(checked);
  }
  if (review.decision === "approve") {
    for (const required of REQUIRED_REVIEW_CHECKS[review.role]) {
      if (!checks.has(required)) {
        throw new BookCreditScriptError("BOOK_CREDIT_REVIEW_REQUIRED_CHECK_MISSING");
      }
    }
  }
  if (review.notes !== undefined) {
    requireText(review.notes, MAX_NOTES_LENGTH, "BOOK_CREDIT_REVIEW_NOTES_INVALID");
  } else if (review.decision === "changes-requested") {
    throw new BookCreditScriptError("BOOK_CREDIT_REVIEW_NOTES_REQUIRED");
  }
  requireDate(review.decidedAt, "BOOK_CREDIT_REVIEW_DATE_INVALID");
  const { fingerprint, ...partial } = review;
  if (reviewFingerprint(partial) !== fingerprint) {
    throw new BookCreditScriptError("BOOK_CREDIT_REVIEW_FINGERPRINT_INVALID");
  }
}

function reviseScript(
  script: BookCreditScript,
  updates: Partial<Pick<BookCreditScript, "reviews" | "status" | "approval">>,
  at: Date,
): BookCreditScript {
  assertBookCreditScript(script);
  if (at.getTime() < Date.parse(script.updatedAt)) {
    throw new BookCreditScriptError("BOOK_CREDIT_TRANSITION_TIME_REVERSED");
  }
  const { fingerprint: _fingerprint, previousFingerprint: _previous, ...base } = script;
  const partial: Omit<BookCreditScript, "fingerprint"> = {
    ...base,
    ...updates,
    revision: script.revision + 1,
    previousFingerprint: script.fingerprint,
    createdAt: script.createdAt,
    updatedAt: at.toISOString(),
  };
  const next = Object.freeze({ ...partial, fingerprint: scriptFingerprint(partial) });
  assertBookCreditScript(next);
  return next;
}

export function createBookCreditScript(input: Readonly<{
  id: string;
  projectId: string;
  kind: BookCreditKind;
  metadata: BookCreditMetadata;
  policy: BookCreditPolicy;
  createdAt?: Date;
}>): BookCreditScript {
  requireIdentifier(input.id, "BOOK_CREDIT_SCRIPT_ID_INVALID");
  requireIdentifier(input.projectId, "BOOK_CREDIT_PROJECT_ID_INVALID");
  assertBookCreditPolicy(input.policy);
  const values = metadataValues(input.metadata);
  const template = input.policy.templates.find((candidate) =>
    candidate.kind === input.kind
    && candidate.projectKind === input.metadata.projectKind
  );
  if (!template) throw new BookCreditScriptError("BOOK_CREDIT_TEMPLATE_NOT_FOUND");
  let text = template.text;
  for (const [token, value] of Object.entries(values) as [BookCreditToken, string][]) {
    text = text.replaceAll(`{${token}}`, value);
  }
  if (TOKEN_PATTERN.test(text)) {
    TOKEN_PATTERN.lastIndex = 0;
    throw new BookCreditScriptError("BOOK_CREDIT_UNRESOLVED_TOKEN");
  }
  TOKEN_PATTERN.lastIndex = 0;
  text = requireText(text, MAX_TEXT_LENGTH, "BOOK_CREDIT_RENDERED_TEXT_INVALID");
  const words = wordCount(text);
  if (words === 0 || words > input.policy.maximumWords) {
    throw new BookCreditScriptError("BOOK_CREDIT_RENDERED_WORD_COUNT_INVALID");
  }
  const createdAt = input.createdAt ?? new Date();
  if (Number.isNaN(createdAt.getTime())) throw new BookCreditScriptError("BOOK_CREDIT_DATE_INVALID");
  const metadataFingerprint = stableHash({ ...input.metadata, values });
  const partial: Omit<BookCreditScript, "fingerprint"> = {
    schemaVersion: BOOK_CREDIT_SCRIPT_SCHEMA_VERSION,
    id: input.id,
    projectId: input.projectId,
    bookId: input.metadata.bookId,
    kind: input.kind,
    projectKind: input.metadata.projectKind,
    policyId: input.policy.id,
    policyVersion: input.policy.version,
    policyFingerprint: input.policy.fingerprint,
    metadataFingerprint,
    text,
    textHash: stableHash(text),
    wordCount: words,
    reviews: Object.freeze([]),
    status: "draft",
    revision: 1,
    createdAt: createdAt.toISOString(),
    updatedAt: createdAt.toISOString(),
  };
  const script = Object.freeze({ ...partial, fingerprint: scriptFingerprint(partial) });
  assertBookCreditScript(script);
  return script;
}

export function recordBookCreditReview(
  script: BookCreditScript,
  input: Readonly<{
    id: string;
    role: BookCreditReviewRole;
    reviewerId: string;
    decision: BookCreditDecision;
    checks: readonly string[];
    notes?: string;
    decidedAt?: Date;
  }>,
): BookCreditScript {
  assertBookCreditScript(script);
  if (script.status === "approved") {
    throw new BookCreditScriptError("BOOK_CREDIT_APPROVED_IMMUTABLE");
  }
  if (script.reviews.some((review) => review.id === input.id)) {
    throw new BookCreditScriptError("BOOK_CREDIT_REVIEW_ID_DUPLICATE");
  }
  const reviewerId = requireHuman(input.reviewerId, "BOOK_CREDIT_REVIEWER_INVALID");
  const latest = latestReviews(script);
  for (const [role, review] of latest) {
    if (role !== input.role && review.reviewerId === reviewerId) {
      throw new BookCreditScriptError("BOOK_CREDIT_INDEPENDENT_REVIEWERS_REQUIRED");
    }
  }
  const decidedAt = input.decidedAt ?? new Date();
  if (Number.isNaN(decidedAt.getTime()) || decidedAt.getTime() < Date.parse(script.updatedAt)) {
    throw new BookCreditScriptError("BOOK_CREDIT_REVIEW_DATE_INVALID");
  }
  const notes = input.notes === undefined
    ? undefined
    : requireText(input.notes, MAX_NOTES_LENGTH, "BOOK_CREDIT_REVIEW_NOTES_INVALID");
  const reviewBase: Omit<BookCreditReviewEntry, "fingerprint"> = {
    id: requireIdentifier(input.id, "BOOK_CREDIT_REVIEW_ID_INVALID"),
    role: input.role,
    reviewerId,
    decision: input.decision,
    checks: Object.freeze([...input.checks]),
    ...(notes ? { notes } : {}),
    decidedAt: decidedAt.toISOString(),
  };
  const review = Object.freeze({ ...reviewBase, fingerprint: reviewFingerprint(reviewBase) });
  assertReview(review);
  const reviews = Object.freeze([...script.reviews, review]);
  return reviseScript(script, { reviews, status: statusFromReviews(reviews) }, decidedAt);
}

export function approveBookCreditScript(
  script: BookCreditScript,
  input: Readonly<{
    finalConfirmationId: string;
    approvedByActorId: string;
    humanConfirmation: true;
    approvedAt?: Date;
  }>,
): BookCreditScript {
  assertBookCreditScript(script);
  if (script.status === "approved") return script;
  if (input.humanConfirmation !== true) {
    throw new BookCreditScriptError("BOOK_CREDIT_HUMAN_CONFIRMATION_REQUIRED");
  }
  requireIdentifier(input.finalConfirmationId, "BOOK_CREDIT_CONFIRMATION_ID_INVALID");
  const approvedByActorId = requireHuman(input.approvedByActorId, "BOOK_CREDIT_APPROVER_INVALID");
  if (script.status !== "ready-for-approval") {
    throw new BookCreditScriptError("BOOK_CREDIT_NOT_READY_FOR_APPROVAL");
  }
  const approvedAt = input.approvedAt ?? new Date();
  if (Number.isNaN(approvedAt.getTime()) || approvedAt.getTime() < Date.parse(script.updatedAt)) {
    throw new BookCreditScriptError("BOOK_CREDIT_APPROVAL_DATE_INVALID");
  }
  const approvalBase: Omit<BookCreditApproval, "fingerprint"> = {
    finalConfirmationId: input.finalConfirmationId,
    approvedByActorId,
    approvedAt: approvedAt.toISOString(),
  };
  const approval = Object.freeze({ ...approvalBase, fingerprint: approvalFingerprint(approvalBase) });
  return reviseScript(script, { status: "approved", approval }, approvedAt);
}

export function assertBookCreditScript(script: BookCreditScript): void {
  if (script.schemaVersion !== BOOK_CREDIT_SCRIPT_SCHEMA_VERSION) {
    throw new BookCreditScriptError("BOOK_CREDIT_SCRIPT_SCHEMA_UNSUPPORTED");
  }
  requireIdentifier(script.id, "BOOK_CREDIT_SCRIPT_ID_INVALID");
  requireIdentifier(script.projectId, "BOOK_CREDIT_PROJECT_ID_INVALID");
  requireIdentifier(script.bookId, "BOOK_CREDIT_BOOK_ID_INVALID");
  if (script.kind !== "opening" && script.kind !== "closing") {
    throw new BookCreditScriptError("BOOK_CREDIT_KIND_INVALID");
  }
  if (script.projectKind !== "standalone" && script.projectKind !== "series") {
    throw new BookCreditScriptError("BOOK_CREDIT_PROJECT_KIND_INVALID");
  }
  requireIdentifier(script.policyId, "BOOK_CREDIT_POLICY_ID_INVALID");
  if (!SAFE_VERSION.test(script.policyVersion)) {
    throw new BookCreditScriptError("BOOK_CREDIT_POLICY_VERSION_INVALID");
  }
  if (!/^[a-f0-9]{64}$/u.test(script.policyFingerprint)
    || !/^[a-f0-9]{64}$/u.test(script.metadataFingerprint)
    || !/^[a-f0-9]{64}$/u.test(script.textHash)) {
    throw new BookCreditScriptError("BOOK_CREDIT_HASH_INVALID");
  }
  requireText(script.text, MAX_TEXT_LENGTH, "BOOK_CREDIT_RENDERED_TEXT_INVALID");
  if (stableHash(script.text) !== script.textHash || wordCount(script.text) !== script.wordCount) {
    throw new BookCreditScriptError("BOOK_CREDIT_TEXT_INTEGRITY_INVALID");
  }
  if (!Array.isArray(script.reviews) || script.reviews.length > 100) {
    throw new BookCreditScriptError("BOOK_CREDIT_REVIEWS_INVALID");
  }
  const ids = new Set<string>();
  let previousAt = Date.parse(script.createdAt);
  for (const review of script.reviews) {
    assertReview(review);
    if (ids.has(review.id)) throw new BookCreditScriptError("BOOK_CREDIT_REVIEW_ID_DUPLICATE");
    ids.add(review.id);
    const decidedAt = Date.parse(review.decidedAt);
    if (decidedAt < previousAt) throw new BookCreditScriptError("BOOK_CREDIT_TRANSITION_TIME_REVERSED");
    previousAt = decidedAt;
  }
  const expectedStatus = script.approval ? "approved" : statusFromReviews(script.reviews);
  if (script.status !== expectedStatus) throw new BookCreditScriptError("BOOK_CREDIT_STATUS_MISMATCH");
  if (script.approval) {
    requireIdentifier(script.approval.finalConfirmationId, "BOOK_CREDIT_CONFIRMATION_ID_INVALID");
    requireHuman(script.approval.approvedByActorId, "BOOK_CREDIT_APPROVER_INVALID");
    requireDate(script.approval.approvedAt, "BOOK_CREDIT_APPROVAL_DATE_INVALID");
    const { fingerprint, ...partial } = script.approval;
    if (approvalFingerprint(partial) !== fingerprint) {
      throw new BookCreditScriptError("BOOK_CREDIT_APPROVAL_FINGERPRINT_INVALID");
    }
  }
  if (
    Number.isNaN(Date.parse(script.createdAt))
    || Number.isNaN(Date.parse(script.updatedAt))
    || Date.parse(script.updatedAt) < previousAt
  ) {
    throw new BookCreditScriptError("BOOK_CREDIT_DATE_INVALID");
  }
  if (!Number.isSafeInteger(script.revision) || script.revision < 1) {
    throw new BookCreditScriptError("BOOK_CREDIT_REVISION_INVALID");
  }
  if (script.revision === 1 && script.previousFingerprint !== undefined) {
    throw new BookCreditScriptError("BOOK_CREDIT_REVISION_CHAIN_INVALID");
  }
  if (script.revision > 1 && !/^[a-f0-9]{64}$/u.test(script.previousFingerprint ?? "")) {
    throw new BookCreditScriptError("BOOK_CREDIT_REVISION_CHAIN_INVALID");
  }
  const { fingerprint, ...partial } = script;
  if (scriptFingerprint(partial) !== fingerprint) {
    throw new BookCreditScriptError("BOOK_CREDIT_SCRIPT_FINGERPRINT_INVALID");
  }
}

export function bookCreditScriptPublicView(
  script: BookCreditScript,
): BookCreditScriptPublicView {
  assertBookCreditScript(script);
  const latest = latestReviews(script);
  return Object.freeze({
    id: script.id,
    bookId: script.bookId,
    kind: script.kind,
    projectKind: script.projectKind,
    policyId: script.policyId,
    policyVersion: script.policyVersion,
    textHash: script.textHash,
    wordCount: script.wordCount,
    latestDecisions: Object.freeze({
      editorial: latest.get("editorial")?.decision ?? "pending",
      rights: latest.get("rights")?.decision ?? "pending",
    }),
    status: script.status,
    readyForApproval: script.status === "ready-for-approval",
    revision: script.revision,
    createdAt: script.createdAt,
    updatedAt: script.updatedAt,
    fingerprint: script.fingerprint,
  });
}

function payload(script: BookCreditScript): Record<string, unknown> {
  return script as unknown as Record<string, unknown>;
}

function toEnvelope(
  envelope: StoredEnvelope<Record<string, unknown>>,
): StoredEnvelope<BookCreditScript> {
  const script = envelope.payload as unknown as BookCreditScript;
  assertBookCreditScript(script);
  if (
    envelope.entityType !== ENTITY_TYPE
    || envelope.entityId !== script.id
    || envelope.revision !== script.revision
  ) {
    throw new BookCreditScriptStoreConflictError("BOOK_CREDIT_STORE_ENVELOPE_SCOPE_MISMATCH");
  }
  return envelope as unknown as StoredEnvelope<BookCreditScript>;
}

export class FileBookCreditScriptStore {
  readonly #store: FileProjectStore;

  constructor(store: FileProjectStore) {
    this.#store = store;
  }

  async create(script: BookCreditScript, actorId: string): Promise<StoredEnvelope<BookCreditScript>> {
    assertBookCreditScript(script);
    requireIdentifier(actorId, "BOOK_CREDIT_STORE_ACTOR_INVALID");
    const existing = await this.read(script.id);
    if (existing) {
      if (existing.payload.fingerprint === script.fingerprint) return existing;
      throw new BookCreditScriptStoreConflictError("BOOK_CREDIT_STORE_IDEMPOTENCY_CONFLICT");
    }
    try {
      const envelope = toEnvelope(await this.#store.create(
        ENTITY_TYPE,
        script.id,
        payload(script),
        new Date(script.createdAt),
      ));
      await this.#audit(actorId, "book_credit.created", envelope);
      return envelope;
    } catch (error) {
      if (error instanceof StoreConflictError) throw new BookCreditScriptStoreConflictError(error.message);
      throw error;
    }
  }

  async read(scriptId: string): Promise<StoredEnvelope<BookCreditScript> | null> {
    requireIdentifier(scriptId, "BOOK_CREDIT_STORE_ID_INVALID");
    const envelope = await this.#store.read<Record<string, unknown>>(ENTITY_TYPE, scriptId);
    return envelope ? toEnvelope(envelope) : null;
  }

  async require(scriptId: string): Promise<StoredEnvelope<BookCreditScript>> {
    const envelope = await this.read(scriptId);
    if (!envelope) throw new BookCreditScriptStoreConflictError("BOOK_CREDIT_STORE_NOT_FOUND");
    return envelope;
  }

  async save(
    script: BookCreditScript,
    input: Readonly<{ expectedRevision: number; actorId: string; action: string }>,
  ): Promise<StoredEnvelope<BookCreditScript>> {
    assertBookCreditScript(script);
    requireIdentifier(input.actorId, "BOOK_CREDIT_STORE_ACTOR_INVALID");
    if (!/^book_credit\.[a-z][a-z0-9._-]{1,80}$/u.test(input.action)) {
      throw new BookCreditScriptStoreConflictError("BOOK_CREDIT_STORE_ACTION_INVALID");
    }
    const current = await this.require(script.id);
    if (
      current.revision !== input.expectedRevision
      || script.revision !== current.payload.revision + 1
      || script.previousFingerprint !== current.payload.fingerprint
    ) {
      throw new BookCreditScriptStoreConflictError("BOOK_CREDIT_STORE_REVISION_CONFLICT");
    }
    try {
      const envelope = toEnvelope(await this.#store.replace(
        ENTITY_TYPE,
        script.id,
        input.expectedRevision,
        payload(script),
        new Date(script.updatedAt),
      ));
      await this.#audit(input.actorId, input.action, envelope);
      return envelope;
    } catch (error) {
      if (error instanceof StoreConflictError) throw new BookCreditScriptStoreConflictError(error.message);
      throw error;
    }
  }

  async #audit(
    actorId: string,
    action: string,
    envelope: StoredEnvelope<BookCreditScript>,
  ): Promise<void> {
    await this.#store.appendAuditEvent({
      actorId,
      action,
      entityType: ENTITY_TYPE,
      entityId: envelope.entityId,
      revision: envelope.revision,
      occurredAt: new Date(envelope.savedAt),
      metadata: {
        kind: envelope.payload.kind,
        status: envelope.payload.status,
        wordCount: envelope.payload.wordCount,
        reviewCount: envelope.payload.reviews.length,
      },
    });
  }
}
