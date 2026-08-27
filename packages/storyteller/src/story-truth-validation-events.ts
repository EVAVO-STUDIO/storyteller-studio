import type {
  StoryTruthEntity,
  StoryTruthEvent,
  StoryTruthFinding,
  StoryTruthLedger,
  StoryTruthManuscriptReference,
} from "./story-truth-types.js";
import {
  MAX_NAME_LENGTH,
  addDuplicateFinding,
  finding,
  isInteger,
  isSafeId,
  isSafePredicate,
  normalizedText,
  verifyEvidence,
} from "./story-truth-internal.js";
import { causalCycleFindings } from "./story-truth-contradictions.js";

export function validateStoryTruthEvents(
  ledger: StoryTruthLedger,
  manuscripts: ReadonlyMap<string, StoryTruthManuscriptReference>,
  entities: ReadonlyMap<string, StoryTruthEntity>,
  findings: StoryTruthFinding[],
): ReadonlyMap<string, StoryTruthEvent> {
  const eventIds = new Set<string>();
  const narrativeOrders = new Set<string>();
  const events = new Map<string, StoryTruthEvent>();
  for (const event of ledger.events) {
    const context = { eventId: event.id, bookId: event.bookId };
    if (!isSafeId(event.id)) {
      findings.push(finding("STORY_TRUTH_EVENT_ID_INVALID", "error", "Event identifier is invalid.", context));
      continue;
    }
    addDuplicateFinding(eventIds, event.id, "STORY_TRUTH_EVENT_DUPLICATE", context, findings);
    if (!manuscripts.has(event.bookId)) {
      findings.push(finding("STORY_TRUTH_EVENT_BOOK_UNKNOWN", "error", "Event references a book outside this ledger.", context));
    }
    if (!isSafePredicate(event.eventType)) {
      findings.push(finding("STORY_TRUTH_EVENT_TYPE_INVALID", "error", "Event type must use a stable machine identifier.", context));
    }
    if (typeof event.label !== "string" || normalizedText(event.label).length === 0 || event.label.length > MAX_NAME_LENGTH) {
      findings.push(finding("STORY_TRUTH_EVENT_LABEL_INVALID", "error", "Event label is missing or too long.", context));
    }
    if (!isInteger(event.worldOrder)) {
      findings.push(finding("STORY_TRUTH_EVENT_WORLD_ORDER_INVALID", "error", "Event world order must be a non-negative integer.", context));
    }
    if (!isInteger(event.narrativeOrder)) {
      findings.push(finding("STORY_TRUTH_EVENT_NARRATIVE_ORDER_INVALID", "error", "Event narrative order must be a non-negative integer.", context));
    } else {
      const narrativeKey = `${event.bookId}|${event.narrativeOrder}`;
      if (narrativeOrders.has(narrativeKey)) {
        findings.push(finding(
          "STORY_TRUTH_EVENT_NARRATIVE_ORDER_DUPLICATE",
          "error",
          "Two events in the same book cannot occupy the same narrative order.",
          context,
        ));
      }
      narrativeOrders.add(narrativeKey);
    }
    if (event.worldTimeLabel !== undefined && (typeof event.worldTimeLabel !== "string" || event.worldTimeLabel.length > MAX_NAME_LENGTH)) {
      findings.push(finding("STORY_TRUTH_EVENT_TIME_LABEL_INVALID", "error", "Event world-time label is invalid.", context));
    }
    const participants = new Set<string>();
    for (const participant of event.participants) {
      const key = `${participant.entityId}|${participant.role}`;
      if (participants.has(key)) {
        findings.push(finding("STORY_TRUTH_EVENT_PARTICIPANT_DUPLICATE", "warning", "Event repeats an identical participant role.", context));
      }
      participants.add(key);
      if (!entities.has(participant.entityId)) {
        findings.push(finding(
          "STORY_TRUTH_EVENT_PARTICIPANT_UNKNOWN",
          "error",
          `Event participant ${participant.entityId} is not a canonical entity.`,
          { ...context, entityId: participant.entityId },
        ));
      }
      if (!isSafePredicate(participant.role)) {
        findings.push(finding("STORY_TRUTH_EVENT_PARTICIPANT_ROLE_INVALID", "error", "Event participant role is invalid.", context));
      }
    }
    if (event.locationEntityId !== undefined && !entities.has(event.locationEntityId)) {
      findings.push(finding(
        "STORY_TRUTH_EVENT_LOCATION_UNKNOWN",
        "error",
        `Event location ${event.locationEntityId} is not a canonical entity.`,
        { ...context, entityId: event.locationEntityId },
      ));
    }
    for (const evidence of event.evidence) verifyEvidence(evidence, manuscripts, context, findings);
    if (event.evidence.length === 0) {
      findings.push(finding("STORY_TRUTH_EVENT_EVIDENCE_REQUIRED", "error", "Canonical events require immutable source evidence.", context));
    }
    events.set(event.id, event);
  }

  for (const event of ledger.events) {
    const context = { eventId: event.id, bookId: event.bookId };
    const causes = new Set<string>();
    for (const causeId of event.causedByEventIds) {
      if (causes.has(causeId)) {
        findings.push(finding("STORY_TRUTH_EVENT_CAUSE_DUPLICATE", "warning", "Event repeats an identical causal edge.", context));
      }
      causes.add(causeId);
      if (causeId === event.id) {
        findings.push(finding("STORY_TRUTH_EVENT_SELF_CAUSE", "error", "An event cannot cause itself.", context));
      } else if (!events.has(causeId)) {
        findings.push(finding("STORY_TRUTH_EVENT_CAUSE_UNKNOWN", "error", `Causal event ${causeId} is not registered.`, context));
      }
    }
  }
  findings.push(...causalCycleFindings(ledger.events));

  return events;
}
