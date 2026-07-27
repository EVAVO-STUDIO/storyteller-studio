import {
  BudgetConflictError,
  BudgetInsufficientFundsError,
  FileBudgetLedger,
  budgetMicros,
  type BudgetReservation,
  type BudgetReservationReceipt,
} from "./budget-ledger.js";
import type { GenerationQueueClaim } from "./generation-queue.js";
import type {
  GenerationWorkerMaterial,
  GenerationWorkerQueueTransition,
} from "./generation-worker.js";

export interface GenerationBudgetReservation {
  projectId: string;
  currency: string;
  reservationId: string;
  maximumMicros: number;
  reservationFingerprint: string;
  expiresAt: string;
}

export interface GenerationBudgetSettlement {
  reservation: GenerationBudgetReservation;
  status: "committed" | "released" | "expired";
  committedMicros?: number;
  conservative: boolean;
  settlementCode: string;
  ledgerRevision: number;
  reservationFingerprint: string;
}

export interface GenerationBudgetSession {
  readonly reservation: GenerationBudgetReservation;
  settle(
    transition: GenerationWorkerQueueTransition,
  ): Promise<GenerationBudgetSettlement>;
  settleInterrupted(input: Readonly<{
    code: string;
    at?: Date;
  }>): Promise<GenerationBudgetSettlement>;
}

export interface GenerationBudgetControllerOptions {
  baseReservationTtlMs?: number;
  providerTimeoutMarginMs?: number;
}

const SAFE_CODE = /^[A-Z][A-Z0-9_]{2,95}$/u;
const CURRENCY_PATTERN = /^[A-Z]{3}$/u;
const MIN_TTL_MS = 1_000;
const MAX_TTL_MS = 7 * 24 * 60 * 60_000;
const DEFAULT_RESERVATION_TTL_MS = 3 * 60 * 60_000;
const DEFAULT_PROVIDER_TIMEOUT_MARGIN_MS = 5 * 60_000;

function requireCode(value: string): string {
  if (!SAFE_CODE.test(value)) throw new Error("GENERATION_BUDGET_SETTLEMENT_CODE_INVALID");
  return value;
}

function requireTimestamp(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("GENERATION_BUDGET_TRANSITION_TIME_INVALID");
  return date;
}

function requireDuration(
  value: number,
  minimum: number,
  maximum: number,
  code: string,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(code);
  }
  return value;
}

function reservationView(
  receipt: BudgetReservationReceipt,
  projectId: string,
  currency: string,
): GenerationBudgetReservation {
  return Object.freeze({
    projectId,
    currency,
    reservationId: receipt.reservation.id,
    maximumMicros: receipt.reservation.requestedMicros,
    reservationFingerprint: receipt.reservation.fingerprint,
    expiresAt: receipt.reservation.expiresAt,
  });
}

function settlementView(
  receipt: BudgetReservationReceipt,
  reservation: GenerationBudgetReservation,
  settlementCode: string,
  conservative: boolean,
): GenerationBudgetSettlement {
  const status = receipt.reservation.status;
  if (status !== "committed" && status !== "released" && status !== "expired") {
    throw new Error("GENERATION_BUDGET_SETTLEMENT_NOT_TERMINAL");
  }
  return Object.freeze({
    reservation,
    status,
    ...(receipt.reservation.committedMicros !== undefined
      ? { committedMicros: receipt.reservation.committedMicros }
      : {}),
    conservative,
    settlementCode,
    ledgerRevision: receipt.envelope.revision,
    reservationFingerprint: receipt.reservation.fingerprint,
  });
}

function settlementCost(
  transition: GenerationWorkerQueueTransition,
  reservation: GenerationBudgetReservation,
): Readonly<{
  action: "commit" | "release";
  committedMicros?: number;
  conservative: boolean;
  code: string;
}> {
  const accounting = transition.accounting;
  if (transition.kind === "complete") {
    if (
      accounting.blockedCode
      || accounting.totalEstimatedCost === undefined
      || accounting.currency !== reservation.currency
    ) {
      throw new Error("GENERATION_BUDGET_COMPLETION_ACCOUNTING_INVALID");
    }
    const actualMicros = budgetMicros(accounting.totalEstimatedCost);
    if (actualMicros > reservation.maximumMicros) {
      throw new Error("GENERATION_BUDGET_COMPLETION_EXCEEDS_RESERVATION");
    }
    return {
      action: "commit",
      committedMicros: actualMicros,
      conservative: false,
      code: "GENERATION_BUDGET_COMPLETED",
    };
  }

  if (accounting.successfulResultCount > 0) {
    if (
      accounting.totalEstimatedCost !== undefined
      && accounting.currency === reservation.currency
    ) {
      const observedMicros = budgetMicros(accounting.totalEstimatedCost);
      return {
        action: "commit",
        committedMicros: Math.min(observedMicros, reservation.maximumMicros),
        conservative: observedMicros > reservation.maximumMicros,
        code: observedMicros > reservation.maximumMicros
          ? "GENERATION_BUDGET_OBSERVED_COST_CAPPED"
          : "GENERATION_BUDGET_PARTIAL_COST_COMMITTED",
      };
    }
    return {
      action: "commit",
      committedMicros: reservation.maximumMicros,
      conservative: true,
      code: "GENERATION_BUDGET_RESULT_COST_UNRECONCILED",
    };
  }

  if (accounting.attemptedProviderCount > 0) {
    return {
      action: "commit",
      committedMicros: reservation.maximumMicros,
      conservative: true,
      code: "GENERATION_BUDGET_PROVIDER_ATTEMPT_UNRECONCILED",
    };
  }

  return {
    action: "release",
    conservative: false,
    code: transition.kind === "retry"
      ? "GENERATION_BUDGET_RETRY_WITHOUT_PROVIDER"
      : "GENERATION_BUDGET_BLOCKED_BEFORE_PROVIDER",
  };
}

class FileGenerationBudgetSession implements GenerationBudgetSession {
  readonly reservation: GenerationBudgetReservation;
  readonly #ledger: FileBudgetLedger;
  readonly #actorId: string;
  #settlement: GenerationBudgetSettlement | undefined;

  constructor(
    ledger: FileBudgetLedger,
    receipt: BudgetReservationReceipt,
    input: Readonly<{
      projectId: string;
      currency: string;
      actorId: string;
    }>,
  ) {
    this.#ledger = ledger;
    this.#actorId = input.actorId;
    this.reservation = reservationView(
      receipt,
      input.projectId,
      input.currency,
    );
  }

  async settle(
    transition: GenerationWorkerQueueTransition,
  ): Promise<GenerationBudgetSettlement> {
    if (this.#settlement) return this.#settlement;
    const at = requireTimestamp(transition.at);
    const decision = settlementCost(transition, this.reservation);
    const receipt = decision.action === "commit"
      ? await this.#ledger.commit({
          projectId: this.reservation.projectId,
          currency: this.reservation.currency,
          reservationId: this.reservation.reservationId,
          actualMicros: decision.committedMicros ?? 0,
          actorId: this.#actorId,
          now: at,
        })
      : await this.#ledger.release({
          projectId: this.reservation.projectId,
          currency: this.reservation.currency,
          reservationId: this.reservation.reservationId,
          releaseCode: decision.code,
          actorId: this.#actorId,
          now: at,
        });
    this.#settlement = settlementView(
      receipt,
      this.reservation,
      decision.code,
      decision.conservative,
    );
    return this.#settlement;
  }

  async settleInterrupted(input: Readonly<{
    code: string;
    at?: Date;
  }>): Promise<GenerationBudgetSettlement> {
    if (this.#settlement) return this.#settlement;
    const code = requireCode(input.code);
    const receipt = await this.#ledger.commit({
      projectId: this.reservation.projectId,
      currency: this.reservation.currency,
      reservationId: this.reservation.reservationId,
      actualMicros: this.reservation.maximumMicros,
      actorId: this.#actorId,
      now: input.at ?? new Date(),
    });
    this.#settlement = settlementView(
      receipt,
      this.reservation,
      code,
      true,
    );
    return this.#settlement;
  }
}

export class FileGenerationBudgetController {
  readonly #ledger: FileBudgetLedger;
  readonly #baseReservationTtlMs: number;
  readonly #providerTimeoutMarginMs: number;

  constructor(
    ledger: FileBudgetLedger,
    options: GenerationBudgetControllerOptions = {},
  ) {
    this.#ledger = ledger;
    this.#baseReservationTtlMs = requireDuration(
      options.baseReservationTtlMs ?? DEFAULT_RESERVATION_TTL_MS,
      MIN_TTL_MS,
      MAX_TTL_MS,
      "GENERATION_BUDGET_RESERVATION_TTL_INVALID",
    );
    this.#providerTimeoutMarginMs = requireDuration(
      options.providerTimeoutMarginMs ?? DEFAULT_PROVIDER_TIMEOUT_MARGIN_MS,
      0,
      24 * 60 * 60_000,
      "GENERATION_BUDGET_TIMEOUT_MARGIN_INVALID",
    );
  }

  async reserve(input: Readonly<{
    claim: GenerationQueueClaim;
    material: GenerationWorkerMaterial;
    actorId: string;
    providerTimeoutMs: number;
    now?: Date;
  }>): Promise<GenerationBudgetSession> {
    const policy = input.material.costPolicy;
    if (!policy) throw new Error("GENERATION_BUDGET_POLICY_REQUIRED");
    if (!CURRENCY_PATTERN.test(policy.currency)) {
      throw new Error("GENERATION_BUDGET_POLICY_CURRENCY_INVALID");
    }
    if (
      input.claim.item.status !== "leased"
      || input.claim.item.jobId !== input.claim.item.job.id
      || input.claim.item.projectId !== input.claim.item.job.projectId
      || input.claim.item.segmentId !== input.claim.item.job.segmentId
    ) {
      throw new Error("GENERATION_BUDGET_ACTIVE_CLAIM_REQUIRED");
    }
    const maximumMicros = budgetMicros(policy.maximumTotalEstimatedCost);
    if (maximumMicros < 1) {
      throw new Error("GENERATION_BUDGET_MAXIMUM_REQUIRED");
    }
    const providerTimeoutMs = requireDuration(
      input.providerTimeoutMs,
      1_000,
      2 * 60 * 60_000,
      "GENERATION_BUDGET_PROVIDER_TIMEOUT_INVALID",
    );
    const reservationTtlMs = Math.max(
      this.#baseReservationTtlMs,
      providerTimeoutMs + this.#providerTimeoutMarginMs,
    );
    if (reservationTtlMs > MAX_TTL_MS) {
      throw new Error("GENERATION_BUDGET_RESERVATION_TTL_INVALID");
    }

    const receipt = await this.#ledger.reserve({
      projectId: input.claim.item.projectId,
      currency: policy.currency,
      jobId: input.claim.item.jobId,
      queueItemId: input.claim.item.id,
      attempt: input.claim.item.attempt,
      maximumMicros,
      reservationTtlMs,
      actorId: input.actorId,
      now: input.now ?? new Date(),
    });
    return new FileGenerationBudgetSession(this.#ledger, receipt, {
      projectId: input.claim.item.projectId,
      currency: policy.currency,
      actorId: input.actorId,
    });
  }
}

export function isGenerationBudgetAdmissionError(error: unknown): boolean {
  return error instanceof BudgetInsufficientFundsError
    || error instanceof BudgetConflictError
    || (error instanceof Error && error.message.startsWith("GENERATION_BUDGET_"));
}

export function generationBudgetReservationPublicView(
  reservation: GenerationBudgetReservation,
): Readonly<{
  currency: string;
  maximumMicros: number;
  expiresAt: string;
  reservationFingerprint: string;
}> {
  return Object.freeze({
    currency: reservation.currency,
    maximumMicros: reservation.maximumMicros,
    expiresAt: reservation.expiresAt,
    reservationFingerprint: reservation.reservationFingerprint,
  });
}
