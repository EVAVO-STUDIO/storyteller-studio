import { stableHash } from "./index.js";
import type {
  StoryTruthFinding,
  StoryTruthLedger,
  StoryTruthValidation,
} from "./story-truth-types.js";
import {
  ambiguousAliasFindings,
  analyseStoryTruthContradictions,
} from "./story-truth-contradictions.js";
import { finding, ledgerFingerprint } from "./story-truth-internal.js";
import { validateStoryTruthEvents } from "./story-truth-validation-events.js";
import { validateStoryTruthFacts } from "./story-truth-validation-facts.js";
import { validateStoryTruthFoundation } from "./story-truth-validation-foundation.js";
import { validateStoryTruthRetcons } from "./story-truth-validation-retcons.js";

export function verifyStoryTruthLedger(ledger: StoryTruthLedger): StoryTruthValidation {
  const findings: StoryTruthFinding[] = [];
  const { manuscripts, entities } = validateStoryTruthFoundation(ledger, findings);
  const events = validateStoryTruthEvents(ledger, manuscripts, entities, findings);
  const facts = validateStoryTruthFacts(ledger, manuscripts, entities, events, findings);
  validateStoryTruthRetcons(ledger, facts, findings);

  const contradictionFindings = analyseStoryTruthContradictions(ledger);
  const aliasFindings = ambiguousAliasFindings(ledger.entities);
  findings.push(...contradictionFindings, ...aliasFindings);

  const { fingerprint: observedFingerprint, ...ledgerWithoutFingerprint } = ledger;
  const expectedFingerprint = ledgerFingerprint(ledgerWithoutFingerprint);
  if (expectedFingerprint !== observedFingerprint) {
    findings.push(finding("STORY_TRUTH_FINGERPRINT_MISMATCH", "error", "Story truth ledger fingerprint does not match its content."));
  }

  const contradictionCount = contradictionFindings.filter(
    (item) => item.code === "STORY_TRUTH_FACT_CONTRADICTION",
  ).length;
  const resultFingerprint = stableHash({
    ledgerFingerprint: observedFingerprint,
    findingCodes: findings.map((item) => item.code),
    contradictionCount,
    ambiguousAliasCount: aliasFindings.length,
  });

  return Object.freeze({
    ok: !findings.some((item) => item.severity === "error"),
    findings: Object.freeze(findings),
    contradictionCount,
    ambiguousAliasCount: aliasFindings.length,
    fingerprint: resultFingerprint,
  });
}
