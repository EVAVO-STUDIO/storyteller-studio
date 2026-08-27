import { stableHash } from "./index.js";
import {
  STORY_TRUTH_RETCON_SCHEMA_VERSION,
  type StoryTruthFact,
  type StoryTruthFinding,
  type StoryTruthLedger,
} from "./story-truth-types.js";
import {
  MAX_RATIONALE_LENGTH,
  addDuplicateFinding,
  finding,
  isHash,
  isSafeId,
  normalizedText,
  retconFingerprint,
  sortedUnique,
} from "./story-truth-internal.js";

export function validateStoryTruthRetcons(
  ledger: StoryTruthLedger,
  facts: ReadonlyMap<string, StoryTruthFact>,
  findings: StoryTruthFinding[],
): void {
  const retconIds = new Set<string>();
  const retconTargets = new Map<string, string>();
  const retconReplacements = new Map<string, string>();
  let priorRetconApprovedAt = Date.parse(ledger.createdAt);
  for (const retcon of ledger.retcons) {
    const context = { retconId: retcon.id };
    if (retcon.schemaVersion !== STORY_TRUTH_RETCON_SCHEMA_VERSION) {
      findings.push(finding("STORY_TRUTH_RETCON_SCHEMA_UNSUPPORTED", "error", "Retcon schema is unsupported.", context));
    }
    if (!isSafeId(retcon.id)) {
      findings.push(finding("STORY_TRUTH_RETCON_ID_INVALID", "error", "Retcon identifier is invalid.", context));
      continue;
    }
    addDuplicateFinding(retconIds, retcon.id, "STORY_TRUTH_RETCON_DUPLICATE", context, findings);
    if (retcon.targetFactIds.length === 0) {
      findings.push(finding("STORY_TRUTH_RETCON_TARGET_REQUIRED", "error", "Retcon must target at least one prior fact.", context));
    }
    if (new Set(retcon.targetFactIds).size !== retcon.targetFactIds.length) {
      findings.push(finding("STORY_TRUTH_RETCON_TARGET_DUPLICATE", "error", "Retcon target identifiers must be unique.", context));
    }
    if (new Set(retcon.replacementFactIds).size !== retcon.replacementFactIds.length) {
      findings.push(finding("STORY_TRUTH_RETCON_REPLACEMENT_DUPLICATE", "error", "Retcon replacement identifiers must be unique.", context));
    }
    for (const targetId of retcon.targetFactIds) {
      const existingRetconId = retconTargets.get(targetId);
      if (existingRetconId && existingRetconId !== retcon.id) {
        findings.push(finding(
          "STORY_TRUTH_RETCON_TARGET_REUSED",
          "error",
          `Fact ${targetId} is targeted by more than one retcon.`,
          { ...context, factId: targetId },
        ));
      }
      retconTargets.set(targetId, retcon.id);
      const target = facts.get(targetId);
      if (!target) {
        findings.push(finding("STORY_TRUTH_RETCON_TARGET_UNKNOWN", "error", `Retcon target ${targetId} is not registered.`, { ...context, factId: targetId }));
      } else if (target.status !== "superseded" || target.supersededByRetconId !== retcon.id) {
        findings.push(finding("STORY_TRUTH_RETCON_TARGET_STATE_INVALID", "error", `Retcon target ${targetId} is not bound to this retcon.`, { ...context, factId: targetId }));
      }
    }
    for (const replacementId of retcon.replacementFactIds) {
      const existingRetconId = retconReplacements.get(replacementId);
      if (existingRetconId && existingRetconId !== retcon.id) {
        findings.push(finding(
          "STORY_TRUTH_RETCON_REPLACEMENT_REUSED",
          "error",
          `Fact ${replacementId} is a replacement in more than one retcon.`,
          { ...context, factId: replacementId },
        ));
      }
      retconReplacements.set(replacementId, retcon.id);
      const replacement = facts.get(replacementId);
      if (!replacement) {
        findings.push(finding("STORY_TRUTH_RETCON_REPLACEMENT_UNKNOWN", "error", `Retcon replacement ${replacementId} is not registered.`, { ...context, factId: replacementId }));
      } else {
        const replacementTargets = sortedUnique(replacement.supersedesFactIds ?? []);
        const retconTargetIds = sortedUnique(retcon.targetFactIds);
        if (
          replacement.status !== "canonical"
          || stableHash(replacementTargets) !== stableHash(retconTargetIds)
        ) {
          findings.push(finding(
            "STORY_TRUTH_RETCON_REPLACEMENT_STATE_INVALID",
            "error",
            `Replacement fact ${replacementId} must supersede exactly this retcon's targets.`,
            { ...context, factId: replacementId },
          ));
        }
      }
    }
    if (
      typeof retcon.rationale !== "string"
      || normalizedText(retcon.rationale).length < 12
      || retcon.rationale.length > MAX_RATIONALE_LENGTH
    ) {
      findings.push(finding("STORY_TRUTH_RETCON_RATIONALE_INVALID", "error", "Retcon rationale must be meaningful and bounded.", context));
    }
    if (!isSafeId(retcon.approvedBy)) {
      findings.push(finding("STORY_TRUTH_RETCON_APPROVER_INVALID", "error", "Retcon approver identifier is invalid.", context));
    }
    const approvedAt = Date.parse(retcon.approvedAt);
    if (Number.isNaN(approvedAt)) {
      findings.push(finding("STORY_TRUTH_RETCON_APPROVED_AT_INVALID", "error", "Retcon approval time is invalid.", context));
    } else {
      if (approvedAt < priorRetconApprovedAt) {
        findings.push(finding(
          "STORY_TRUTH_RETCON_ORDER_REGRESSION",
          "error",
          "Retcon approval times must remain append-only and monotonic.",
          context,
        ));
      }
      if (!Number.isNaN(Date.parse(ledger.updatedAt)) && approvedAt > Date.parse(ledger.updatedAt)) {
        findings.push(finding(
          "STORY_TRUTH_RETCON_AFTER_LEDGER_UPDATE",
          "error",
          "A retcon cannot be approved after the ledger revision that contains it.",
          context,
        ));
      }
      priorRetconApprovedAt = Math.max(priorRetconApprovedAt, approvedAt);
    }
    if (!isHash(retcon.decisionEvidenceHash)) {
      findings.push(finding("STORY_TRUTH_RETCON_DECISION_HASH_INVALID", "error", "Retcon decision evidence hash is invalid.", context));
    }
    const { fingerprint: observedFingerprint, ...retconWithoutFingerprint } = retcon;
    if (retconFingerprint(retconWithoutFingerprint) !== observedFingerprint) {
      findings.push(finding("STORY_TRUTH_RETCON_FINGERPRINT_MISMATCH", "error", "Retcon fingerprint does not match its content.", context));
    }
  }

  for (const fact of ledger.facts) {
    if (fact.status === "superseded" && fact.supersededByRetconId) {
      if (!retconIds.has(fact.supersededByRetconId)) {
        findings.push(finding(
          "STORY_TRUTH_FACT_RETCON_UNKNOWN",
          "error",
          "Superseded fact references an unknown retcon.",
          { factId: fact.id, retconId: fact.supersededByRetconId },
        ));
      } else if (retconTargets.get(fact.id) !== fact.supersededByRetconId) {
        findings.push(finding(
          "STORY_TRUTH_FACT_RETCON_TARGET_LINK_MISSING",
          "error",
          "Superseded fact is not listed as a target of its approving retcon.",
          { factId: fact.id, retconId: fact.supersededByRetconId },
        ));
      }
    }
    if ((fact.supersedesFactIds?.length ?? 0) > 0 && !retconReplacements.has(fact.id)) {
      findings.push(finding(
        "STORY_TRUTH_FACT_RETCON_REPLACEMENT_LINK_MISSING",
        "error",
        "Fact claims to replace prior canon but is not listed by an approving retcon.",
        { factId: fact.id },
      ));
    }
    for (const targetId of fact.supersedesFactIds ?? []) {
      if (!facts.has(targetId)) {
        findings.push(finding(
          "STORY_TRUTH_FACT_SUPERSEDES_UNKNOWN",
          "error",
          `Replacement fact references unknown prior fact ${targetId}.`,
          { factId: fact.id, relatedFactId: targetId },
        ));
      }
    }
  }
}
