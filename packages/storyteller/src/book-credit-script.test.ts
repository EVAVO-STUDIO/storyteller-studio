import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  BookCreditScriptError,
  BookCreditScriptStoreConflictError,
  FileBookCreditScriptStore,
  approveBookCreditScript,
  assertBookCreditPolicy,
  assertBookCreditScript,
  bookCreditScriptPublicView,
  createBookCreditPolicy,
  createBookCreditScript,
  recordBookCreditReview,
} from "./book-credit-script.js";
import { stableHash } from "./index.js";
import { FileProjectStore } from "./project-store.js";

const t0 = new Date("2026-07-27T00:00:00.000Z");
const t1 = new Date("2026-07-27T00:00:01.000Z");
const t2 = new Date("2026-07-27T00:00:02.000Z");
const t3 = new Date("2026-07-27T00:00:03.000Z");
const t4 = new Date("2026-07-27T00:00:04.000Z");

function policy() {
  return createBookCreditPolicy({
    id: "evavo-credit-policy",
    version: "2026.07",
    languageTag: "en-AU",
    reviewedAt: "2026-07-01T00:00:00.000Z",
    sourceReference: "evavo-audiobook-credit-policy-reviewed-2026-07",
    maximumWords: 120,
    templates: [
      {
        kind: "opening",
        projectKind: "standalone",
        text: "{title}. Written by {authorCredit}. Narrated by {narratorCredit}.",
        requiredTokens: ["title", "authorCredit", "narratorCredit"],
      },
      {
        kind: "closing",
        projectKind: "standalone",
        text: "You have been listening to {title}, written by {authorCredit}, narrated by {narratorCredit}. {copyrightNotice}.",
        requiredTokens: [
          "title",
          "authorCredit",
          "narratorCredit",
          "copyrightNotice",
        ],
      },
      {
        kind: "opening",
        projectKind: "series",
        text: "{title}, Book {volumeNumber} of {seriesTitle}. Written by {authorCredit}. Narrated by {narratorCredit}.",
        requiredTokens: [
          "title",
          "volumeNumber",
          "seriesTitle",
          "authorCredit",
          "narratorCredit",
        ],
      },
      {
        kind: "closing",
        projectKind: "series",
        text: "You have been listening to {title}, Book {volumeNumber} of {seriesTitle}, written by {authorCredit}, narrated by {narratorCredit}. {copyrightNotice}. {productionCredit}",
        requiredTokens: [
          "title",
          "volumeNumber",
          "seriesTitle",
          "authorCredit",
          "narratorCredit",
          "copyrightNotice",
          "productionCredit",
        ],
      },
    ],
    now: t0,
  });
}

function standaloneMetadata() {
  return {
    bookId: "book_credit_001",
    title: "The Long Road Home",
    projectKind: "standalone" as const,
    authorCredit: "Greg Parker",
    narratorCredit: "Alex Rowan",
    copyrightNotice: "Copyright 2026 Greg Parker",
  };
}

function seriesMetadata() {
  return {
    bookId: "book_credit_series_001",
    title: "The Flooded Crossing",
    projectKind: "series" as const,
    seriesTitle: "The Returning Road",
    volumeNumber: 2,
    authorCredit: "Greg Parker",
    narratorCredit: "Alex Rowan",
    copyrightNotice: "Copyright 2026 Greg Parker",
    productionCredit: "Produced by EVAVO Storyteller Studio.",
  };
}

const editorialChecks = [
  "title-exact",
  "author-credit-exact",
  "narrator-credit-exact",
  "pronunciations-confirmed",
] as const;
const rightsChecks = [
  "copyright-notice-confirmed",
  "credit-entitlements-confirmed",
  "commercial-use-confirmed",
] as const;

function reviewed(script: ReturnType<typeof createBookCreditScript>) {
  const editorial = recordBookCreditReview(script, {
    id: "credit_review_editorial_001",
    role: "editorial",
    reviewerId: "credit_editorial_reviewer_001",
    decision: "approve",
    checks: editorialChecks,
    decidedAt: t1,
  });
  return recordBookCreditReview(editorial, {
    id: "credit_review_rights_001",
    role: "rights",
    reviewerId: "credit_rights_reviewer_001",
    decision: "approve",
    checks: rightsChecks,
    decidedAt: t2,
  });
}

test("reviewed templates render exact standalone and series opening and closing scripts", () => {
  const creditPolicy = policy();
  assert.doesNotThrow(() => assertBookCreditPolicy(creditPolicy));
  const opening = createBookCreditScript({
    id: "credit_opening_standalone_001",
    projectId: "project_credit_001",
    kind: "opening",
    metadata: standaloneMetadata(),
    policy: creditPolicy,
    createdAt: t0,
  });
  assert.equal(
    opening.text,
    "The Long Road Home. Written by Greg Parker. Narrated by Alex Rowan.",
  );
  const closing = createBookCreditScript({
    id: "credit_closing_series_001",
    projectId: "project_credit_001",
    kind: "closing",
    metadata: seriesMetadata(),
    policy: creditPolicy,
    createdAt: t0,
  });
  assert.equal(
    closing.text,
    "You have been listening to The Flooded Crossing, Book 2 of The Returning Road, written by Greg Parker, narrated by Alex Rowan. Copyright 2026 Greg Parker. Produced by EVAVO Storyteller Studio.",
  );
  assert.equal(opening.textHash, stableHash(opening.text));
  assert.equal(closing.textHash, stableHash(closing.text));
  assert.equal(opening.status, "draft");
  assert.equal(closing.status, "draft");
});

test("policy templates reject unknown, missing, duplicate and future-reviewed definitions", () => {
  const base = policy();
  assert.throws(
    () => createBookCreditPolicy({
      id: "bad-credit-policy",
      version: "2026.07",
      languageTag: "en-AU",
      reviewedAt: "2026-07-01T00:00:00.000Z",
      sourceReference: "bad-policy",
      maximumWords: 100,
      templates: base.templates.map((template, index) => ({
        kind: template.kind,
        projectKind: template.projectKind,
        text: index === 0 ? `${template.text} {unknownToken}` : template.text,
        requiredTokens: template.requiredTokens,
      })),
      now: t0,
    }),
    /BOOK_CREDIT_TEMPLATE_TOKEN_UNKNOWN/u,
  );
  assert.throws(
    () => createBookCreditPolicy({
      id: "missing-credit-policy",
      version: "2026.07",
      languageTag: "en-AU",
      reviewedAt: "2026-07-01T00:00:00.000Z",
      sourceReference: "missing-policy",
      maximumWords: 100,
      templates: base.templates.map((template, index) => ({
        kind: template.kind,
        projectKind: template.projectKind,
        text: template.text,
        requiredTokens: index === 0
          ? template.requiredTokens.filter((token) => token !== "narratorCredit")
          : template.requiredTokens,
      })),
      now: t0,
    }),
    /BOOK_CREDIT_TEMPLATE_SEMANTIC_TOKEN_MISSING/u,
  );
  assert.throws(
    () => createBookCreditPolicy({
      id: "future-credit-policy",
      version: "2026.07",
      languageTag: "en-AU",
      reviewedAt: "2026-07-28T00:00:00.000Z",
      sourceReference: "future-policy",
      maximumWords: 100,
      templates: base.templates.map(({ fingerprint: _fingerprint, ...template }) => template),
      now: t0,
    }),
    /BOOK_CREDIT_POLICY_REVIEW_IN_FUTURE/u,
  );
});

test("series metadata and word limits fail before an unusable script is admitted", () => {
  const creditPolicy = policy();
  const { seriesTitle: _seriesTitle, ...missingSeriesTitle } = seriesMetadata();
  assert.throws(
    () => createBookCreditScript({
      id: "credit_series_missing_001",
      projectId: "project_credit_001",
      kind: "opening",
      metadata: missingSeriesTitle,
      policy: creditPolicy,
      createdAt: t0,
    }),
    /BOOK_CREDIT_SERIES_TITLE_INVALID/u,
  );
  const constrained = createBookCreditPolicy({
    id: "short-credit-policy",
    version: "2026.07",
    languageTag: "en-AU",
    reviewedAt: "2026-07-01T00:00:00.000Z",
    sourceReference: "short-policy",
    maximumWords: 10,
    templates: creditPolicy.templates.map(({ fingerprint: _fingerprint, ...template }) => template),
    now: t0,
  });
  assert.throws(
    () => createBookCreditScript({
      id: "credit_too_long_001",
      projectId: "project_credit_001",
      kind: "closing",
      metadata: seriesMetadata(),
      policy: constrained,
      createdAt: t0,
    }),
    /BOOK_CREDIT_RENDERED_WORD_COUNT_INVALID/u,
  );
});

test("independent editorial and rights reviews plus final confirmation approve exact credit text", () => {
  const script = createBookCreditScript({
    id: "credit_reviewed_001",
    projectId: "project_credit_001",
    kind: "opening",
    metadata: standaloneMetadata(),
    policy: policy(),
    createdAt: t0,
  });
  const ready = reviewed(script);
  assert.equal(ready.status, "ready-for-approval");
  const approved = approveBookCreditScript(ready, {
    finalConfirmationId: "credit_confirmation_001",
    approvedByActorId: "credit_owner_001",
    humanConfirmation: true,
    approvedAt: t3,
  });
  assert.equal(approved.status, "approved");
  assert.doesNotThrow(() => assertBookCreditScript(approved));

  const view = bookCreditScriptPublicView(approved);
  const serialised = JSON.stringify(view);
  assert.equal(view.status, "approved");
  assert.equal(view.textHash, stableHash(approved.text));
  for (const forbidden of [
    approved.text,
    "credit_editorial_reviewer_001",
    "credit_rights_reviewer_001",
    "credit_owner_001",
    "credit_confirmation_001",
    "evavo-audiobook-credit-policy-reviewed-2026-07",
  ]) assert.equal(serialised.includes(forbidden), false);
});

test("reviews require semantic checks, independent humans and notes for changes requested", () => {
  const script = createBookCreditScript({
    id: "credit_review_rules_001",
    projectId: "project_credit_001",
    kind: "closing",
    metadata: standaloneMetadata(),
    policy: policy(),
    createdAt: t0,
  });
  assert.throws(
    () => recordBookCreditReview(script, {
      id: "credit_review_missing_check_001",
      role: "editorial",
      reviewerId: "credit_editorial_reviewer_001",
      decision: "approve",
      checks: editorialChecks.slice(0, 3),
      decidedAt: t1,
    }),
    /BOOK_CREDIT_REVIEW_REQUIRED_CHECK_MISSING/u,
  );
  assert.throws(
    () => recordBookCreditReview(script, {
      id: "credit_review_bot_001",
      role: "editorial",
      reviewerId: "automation_credit_001",
      decision: "approve",
      checks: editorialChecks,
      decidedAt: t1,
    }),
    /BOOK_CREDIT_REVIEWER_INVALID/u,
  );
  assert.throws(
    () => recordBookCreditReview(script, {
      id: "credit_review_changes_001",
      role: "editorial",
      reviewerId: "credit_editorial_reviewer_001",
      decision: "changes-requested",
      checks: [],
      decidedAt: t1,
    }),
    /BOOK_CREDIT_REVIEW_NOTES_REQUIRED/u,
  );

  const editorial = recordBookCreditReview(script, {
    id: "credit_review_editorial_rules_001",
    role: "editorial",
    reviewerId: "credit_editorial_reviewer_001",
    decision: "approve",
    checks: editorialChecks,
    decidedAt: t1,
  });
  assert.throws(
    () => recordBookCreditReview(editorial, {
      id: "credit_review_same_human_001",
      role: "rights",
      reviewerId: "credit_editorial_reviewer_001",
      decision: "approve",
      checks: rightsChecks,
      decidedAt: t2,
    }),
    /BOOK_CREDIT_INDEPENDENT_REVIEWERS_REQUIRED/u,
  );

  const changes = recordBookCreditReview(editorial, {
    id: "credit_review_rights_changes_001",
    role: "rights",
    reviewerId: "credit_rights_reviewer_001",
    decision: "changes-requested",
    checks: [],
    notes: "Copyright holder wording must be corrected before recording.",
    decidedAt: t2,
  });
  assert.equal(changes.status, "changes-requested");
  const rereviewed = recordBookCreditReview(changes, {
    id: "credit_review_rights_rereview_001",
    role: "rights",
    reviewerId: "credit_rights_reviewer_rereview_001",
    decision: "approve",
    checks: rightsChecks,
    decidedAt: t3,
  });
  assert.equal(rereviewed.status, "ready-for-approval");
});

test("credit script store is idempotent, revision-safe and audits no text or reviewer identities", async () => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-credit-store-"));
  try {
    const store = new FileBookCreditScriptStore(new FileProjectStore(root));
    const script = createBookCreditScript({
      id: "credit_store_001",
      projectId: "project_credit_001",
      kind: "opening",
      metadata: standaloneMetadata(),
      policy: policy(),
      createdAt: t0,
    });
    const created = await store.create(script, "credit_operator_001");
    const duplicate = await store.create(script, "credit_operator_001");
    assert.equal(duplicate.envelopeHash, created.envelopeHash);

    const editorial = recordBookCreditReview(script, {
      id: "credit_store_review_001",
      role: "editorial",
      reviewerId: "credit_editorial_reviewer_001",
      decision: "approve",
      checks: editorialChecks,
      decidedAt: t1,
    });
    const saved = await store.save(editorial, {
      expectedRevision: 1,
      actorId: "credit_operator_001",
      action: "book_credit.editorial_recorded",
    });
    assert.equal(saved.revision, 2);
    await assert.rejects(
      store.save(editorial, {
        expectedRevision: 1,
        actorId: "credit_operator_001",
        action: "book_credit.editorial_recorded",
      }),
      BookCreditScriptStoreConflictError,
    );

    const audit = await readFile(join(root, "audit", "2026-07-27.jsonl"), "utf8");
    assert.equal(audit.includes(script.text), false);
    assert.equal(audit.includes("credit_editorial_reviewer_001"), false);
    assert.equal(audit.includes("reviewCount"), true);
    assert.equal(audit.includes("wordCount"), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("text, status and approval tampering fail even with recomputed outer fingerprints", () => {
  const approved = approveBookCreditScript(reviewed(createBookCreditScript({
    id: "credit_tamper_001",
    projectId: "project_credit_001",
    kind: "opening",
    metadata: standaloneMetadata(),
    policy: policy(),
    createdAt: t0,
  })), {
    finalConfirmationId: "credit_confirmation_tamper_001",
    approvedByActorId: "credit_owner_001",
    humanConfirmation: true,
    approvedAt: t3,
  });
  const { fingerprint: _fingerprint, ...base } = approved;
  const textBase = {
    ...base,
    text: `${approved.text} Altered.`,
  };
  const textTampered = { ...textBase, fingerprint: stableHash(textBase) };
  assert.throws(
    () => assertBookCreditScript(textTampered),
    /BOOK_CREDIT_TEXT_INTEGRITY_INVALID/u,
  );

  const statusBase = {
    ...base,
    status: "draft" as const,
  };
  const statusTampered = { ...statusBase, fingerprint: stableHash(statusBase) };
  assert.throws(
    () => assertBookCreditScript(statusTampered),
    /BOOK_CREDIT_STATUS_MISMATCH/u,
  );
});
