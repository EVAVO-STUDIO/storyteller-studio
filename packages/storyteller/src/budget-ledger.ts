import { stableHash } from "./index.js";
import {
  FileProjectStore,
  StoreConflictError,
  type StoredEnvelope,
} from "./project-store.js";

export const BUDGET_ACCOUNT_SCHEMA_VERSION = "storyteller-budget-account-v1" as const;
export const BUDGET_ACCOUNT_ENTITY_TYPE = "budget-account" as const;
export const BUDGET_MICROS_PER_MAJOR_UNIT = 1_000_000;

export type BudgetReservationStatus =
  | "reserved"
  | "committed"
  | "released"
  | "expired";

export interface BudgetReservation {
  id: string;
  jobId: string;
  queueItemId: string;
  attempt: number;
  requestedMicros: number;
  status: BudgetReservationStatus;
  reservedAt: string;
  expiresAt: string;
  committedMicros?: number;
  committedAt?: string;
  releasedAt?: string;
  releaseCode?: string;
  previousFingerprint?: string;
  fingerprint: string;
}

export interface BudgetAccount {
  schemaVersion: typeof BUDGET_ACCOUNT_SCHEMA_VERSION;
  id: string;
  projectId: string;
  currency: string;
  authorisedMicros: number;
  committedMicros: number;
  reservations: readonly BudgetReservation[];
  revision: number;
  createdAt: string;
  updatedAt: string;
  previousFingerprint?: string;
  fingerprint: string;
}

export interface BudgetAccountPublicView {
  currency: string;
  authorisedMicros: number;
  committedMicros: number;
  reservedMicros: number;
  availableMicros: number;
  authorisedMajorUnits: number;
  committedMajorUnits: number;
  reservedMajorUnits: number;
  availableMajorUnits: number;
  activeReservationCount: number;
  committedReservationCount: number;
  terminalReservationCount: number;
  revision: number;
  updatedAt: string;
  fingerprint: string;
}

export interface BudgetReservationReceipt {
  envelope: StoredEnvelope<BudgetAccount>;
  reservation: BudgetReservation;
  idempotent: boolean;
}

export class BudgetConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BudgetConflictError";
  }
}

export class BudgetIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BudgetIntegrityError";
  }
}

export class BudgetInsufficientFundsError extends Error {
  readonly requestedMicros: number;
  readonly availableMicros: number;

  constructor(requestedMicros: number, availableMicros: number) {
    super("BUDGET_INSUFFICIENT_AVAILABLE_FUNDS");
    this.name = "BudgetInsufficientFundsError";
    this.requestedMicros = requestedMicros;
    this.availableMicros = availableMicros;
  }
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const CURRENCY_PATTERN = /^[A-Z]{3}$/u;
const SAFE_CODE = /^[A-Z][A-Z0-9_]{2,95}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const MAX_MICROS = Number.MAX_SAFE_INTEGER;
const MAX_RESERVATIONS = 10_000;
const MAX_MUTATION_RETRIES = 12;
const MIN_RESERVATION_TTL_MS = 1_000;
const MAX_RESERVATION_TTL_MS = 7 * 24 * 60 * 60_000;

function requireIdentifier(value: string, code: string): string {
  if (!SAFE_IDENTIFIER.test(value)) throw new BudgetIntegrityError(code);
  return value;
}

function requireCurrency(value: string): string {
  if (!CURRENCY_PATTERN.test(value)) {
    throw new BudgetIntegrityError("BUDGET_CURRENCY_INVALID");
  }
  return value;
}

function requireCode(value: string, code: string): string {
  if (!SAFE_CODE.test(value)) throw new BudgetIntegrityError(code);
  return value;
}

function requireDate(value: string, code: string): string {
  if (!value || Number.isNaN(new Date(value).getTime())) {
    throw new BudgetIntegrityError(code);
  }
  return value;
}

function requireMicros(
  value: number,
  code: string,
  allowZero = true,
): number {
  if (
    !Number.isSafeInteger(value)
    || value < (allowZero ? 0 : 1)
    || value > MAX_MICROS
  ) {
    throw new BudgetIntegrityError(code);
  }
  return value;
}

function requireAttempt(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 1_000_000) {
    throw new BudgetIntegrityError("BUDGET_RESERVATION_ATTEMPT_INVALID");
  }
  return value;
}

function requireTtl(value: number): number {
  if (
    !Number.isSafeInteger(value)
    || value < MIN_RESERVATION_TTL_MS
    || value > MAX_RESERVATION_TTL_MS
  ) {
    throw new BudgetIntegrityError("BUDGET_RESERVATION_TTL_INVALID");
  }
  return value;
}

export function budgetMicros(majorUnits: number): number {
  if (!Number.isFinite(majorUnits) || majorUnits < 0) {
    throw new BudgetIntegrityError("BUDGET_MAJOR_UNITS_INVALID");
  }
  const scaled = majorUnits * BUDGET_MICROS_PER_MAJOR_UNIT;
  const rounded = Math.round(scaled);
  if (
    !Number.isSafeInteger(rounded)
    || rounded > MAX_MICROS
    || Math.abs(scaled - rounded) > 0.000001
  ) {
    throw new BudgetIntegrityError("BUDGET_MAJOR_UNITS_PRECISION_INVALID");
  }
  return rounded;
}

export function budgetMajorUnits(micros: number): number {
  requireMicros(micros, "BUDGET_MICROS_INVALID");
  return micros / BUDGET_MICROS_PER_MAJOR_UNIT;
}

export function budgetAccountId(projectId: string, currency: string): string {
  requireIdentifier(projectId, "BUDGET_PROJECT_ID_INVALID");
  requireCurrency(currency);
  return `budget_${stableHash({ projectId, currency }).slice(0, 32)}`;
}

export function budgetReservationId(input: Readonly<{
  accountId: string;
  jobId: string;
  queueItemId: string;
  attempt: number;
}>): string {
  requireIdentifier(input.accountId, "BUDGET_ACCOUNT_ID_INVALID");
  requireIdentifier(input.jobId, "BUDGET_JOB_ID_INVALID");
  requireIdentifier(input.queueItemId, "BUDGET_QUEUE_ITEM_ID_INVALID");
  requireAttempt(input.attempt);
  return `reservation_${stableHash({
  accountId: input.accountId,
  jobId: input.jobId,
  queueItemId: input.queueItemId,
  attempt: input.attempt,
}).slice(0, 32)}`;
}

function reservationFingerprint(
  reservation: Omit<BudgetReservation, "fingerprint">,
): string {
  return stableHash(reservation);
}

function accountFingerprint(account: Omit<BudgetAccount, "fingerprint">): string {
  return stableHash(account);
}

function reservationWithoutFingerprint(
  reservation: BudgetReservation,
): Omit<BudgetReservation, "fingerprint"> {
  const { fingerprint: _fingerprint, ...partial } = reservation;
  return partial;
}

function accountWithoutFingerprint(
  account: BudgetAccount,
): Omit<BudgetAccount, "fingerprint"> {
  const { fingerprint: _fingerprint, ...partial } = account;
  return partial;
}

function assertReservation(
  reservation: BudgetReservation,
  accountId: string,
): void {
  requireIdentifier(reservation.id, "BUDGET_RESERVATION_ID_INVALID");
  requireIdentifier(reservation.jobId, "BUDGET_JOB_ID_INVALID");
  requireIdentifier(reservation.queueItemId, "BUDGET_QUEUE_ITEM_ID_INVALID");
  requireAttempt(reservation.attempt);
  requireMicros(
    reservation.requestedMicros,
    "BUDGET_RESERVATION_REQUEST_INVALID",
    false,
  );
  requireDate(reservation.reservedAt, "BUDGET_RESERVATION_RESERVED_AT_INVALID");
  requireDate(reservation.expiresAt, "BUDGET_RESERVATION_EXPIRES_AT_INVALID");
  if (Date.parse(reservation.expiresAt) <= Date.parse(reservation.reservedAt)) {
    throw new BudgetIntegrityError("BUDGET_RESERVATION_DATE_ORDER_INVALID");
  }
  if (
    reservation.id !== budgetReservationId({
      accountId,
      jobId: reservation.jobId,
      queueItemId: reservation.queueItemId,
      attempt: reservation.attempt,
    })
  ) {
    throw new BudgetIntegrityError("BUDGET_RESERVATION_SCOPE_INVALID");
  }
  if (reservation.previousFingerprint !== undefined) {
    if (!HASH_PATTERN.test(reservation.previousFingerprint)) {
      throw new BudgetIntegrityError("BUDGET_RESERVATION_PREVIOUS_FINGERPRINT_INVALID");
    }
  }

  switch (reservation.status) {
    case "reserved": {
      if (
        reservation.committedMicros !== undefined
        || reservation.committedAt
        || reservation.releasedAt
        || reservation.releaseCode
      ) {
        throw new BudgetIntegrityError("BUDGET_RESERVATION_ACTIVE_STATE_INVALID");
      }
      break;
    }
    case "committed": {
      if (
        reservation.committedMicros === undefined
        || !reservation.committedAt
        || reservation.releasedAt
        || reservation.releaseCode
      ) {
        throw new BudgetIntegrityError("BUDGET_RESERVATION_COMMITTED_STATE_INVALID");
      }
      requireMicros(
        reservation.committedMicros,
        "BUDGET_RESERVATION_COMMITTED_AMOUNT_INVALID",
      );
      requireDate(
        reservation.committedAt,
        "BUDGET_RESERVATION_COMMITTED_AT_INVALID",
      );
      if (
        reservation.committedMicros > reservation.requestedMicros
        || Date.parse(reservation.committedAt) < Date.parse(reservation.reservedAt)
        || Date.parse(reservation.committedAt) >= Date.parse(reservation.expiresAt)
      ) {
        throw new BudgetIntegrityError("BUDGET_RESERVATION_COMMIT_INVALID");
      }
      break;
    }
    case "released":
    case "expired": {
      if (
        reservation.committedMicros !== undefined
        || reservation.committedAt
        || !reservation.releasedAt
        || !reservation.releaseCode
      ) {
        throw new BudgetIntegrityError("BUDGET_RESERVATION_RELEASED_STATE_INVALID");
      }
      requireDate(
        reservation.releasedAt,
        "BUDGET_RESERVATION_RELEASED_AT_INVALID",
      );
      requireCode(
        reservation.releaseCode,
        "BUDGET_RESERVATION_RELEASE_CODE_INVALID",
      );
      if (Date.parse(reservation.releasedAt) < Date.parse(reservation.reservedAt)) {
        throw new BudgetIntegrityError("BUDGET_RESERVATION_RELEASE_DATE_INVALID");
      }
      break;
    }
  }

  if (
    !HASH_PATTERN.test(reservation.fingerprint)
    || reservation.fingerprint
      !== reservationFingerprint(reservationWithoutFingerprint(reservation))
  ) {
    throw new BudgetIntegrityError("BUDGET_RESERVATION_FINGERPRINT_INVALID");
  }
}

function budgetTotals(account: Pick<BudgetAccount, "reservations">): Readonly<{
  committedMicros: number;
  reservedMicros: number;
  activeReservationCount: number;
  committedReservationCount: number;
  terminalReservationCount: number;
}> {
  let committedMicros = 0;
  let reservedMicros = 0;
  let activeReservationCount = 0;
  let committedReservationCount = 0;
  let terminalReservationCount = 0;
  for (const reservation of account.reservations) {
    if (reservation.status === "reserved") {
      reservedMicros += reservation.requestedMicros;
      activeReservationCount += 1;
    } else if (reservation.status === "committed") {
      committedMicros += reservation.committedMicros ?? 0;
      committedReservationCount += 1;
    } else {
      terminalReservationCount += 1;
    }
    if (
      !Number.isSafeInteger(reservedMicros)
      || !Number.isSafeInteger(committedMicros)
    ) {
      throw new BudgetIntegrityError("BUDGET_ACCOUNT_TOTAL_OVERFLOW");
    }
  }
  return {
    committedMicros,
    reservedMicros,
    activeReservationCount,
    committedReservationCount,
    terminalReservationCount,
  };
}

export function assertBudgetAccount(account: BudgetAccount): void {
  if (account.schemaVersion !== BUDGET_ACCOUNT_SCHEMA_VERSION) {
    throw new BudgetIntegrityError("BUDGET_ACCOUNT_SCHEMA_UNSUPPORTED");
  }
  requireIdentifier(account.id, "BUDGET_ACCOUNT_ID_INVALID");
  requireIdentifier(account.projectId, "BUDGET_PROJECT_ID_INVALID");
  requireCurrency(account.currency);
  if (account.id !== budgetAccountId(account.projectId, account.currency)) {
    throw new BudgetIntegrityError("BUDGET_ACCOUNT_SCOPE_INVALID");
  }
  requireMicros(account.authorisedMicros, "BUDGET_ACCOUNT_LIMIT_INVALID");
  requireMicros(account.committedMicros, "BUDGET_ACCOUNT_COMMITTED_INVALID");
  if (!Array.isArray(account.reservations) || account.reservations.length > MAX_RESERVATIONS) {
    throw new BudgetIntegrityError("BUDGET_ACCOUNT_RESERVATIONS_INVALID");
  }
  if (!Number.isSafeInteger(account.revision) || account.revision < 1) {
    throw new BudgetIntegrityError("BUDGET_ACCOUNT_REVISION_INVALID");
  }
  requireDate(account.createdAt, "BUDGET_ACCOUNT_CREATED_AT_INVALID");
  requireDate(account.updatedAt, "BUDGET_ACCOUNT_UPDATED_AT_INVALID");
  if (Date.parse(account.updatedAt) < Date.parse(account.createdAt)) {
    throw new BudgetIntegrityError("BUDGET_ACCOUNT_TIMESTAMP_ORDER_INVALID");
  }
  if (account.revision === 1 && account.previousFingerprint !== undefined) {
    throw new BudgetIntegrityError("BUDGET_ACCOUNT_INITIAL_CHAIN_INVALID");
  }
  if (
    account.revision > 1
    && (!account.previousFingerprint || !HASH_PATTERN.test(account.previousFingerprint))
  ) {
    throw new BudgetIntegrityError("BUDGET_ACCOUNT_PREVIOUS_FINGERPRINT_INVALID");
  }

  const reservationIds = new Set<string>();
  const attemptKeys = new Set<string>();
  for (const reservation of account.reservations) {
    assertReservation(reservation, account.id);
    if (reservationIds.has(reservation.id)) {
      throw new BudgetIntegrityError("BUDGET_RESERVATION_ID_DUPLICATE");
    }
    reservationIds.add(reservation.id);
    const attemptKey = `${reservation.queueItemId}:${reservation.attempt}`;
    if (attemptKeys.has(attemptKey)) {
      throw new BudgetIntegrityError("BUDGET_RESERVATION_ATTEMPT_DUPLICATE");
    }
    attemptKeys.add(attemptKey);
  }

  const totals = budgetTotals(account);
  if (totals.committedMicros !== account.committedMicros) {
    throw new BudgetIntegrityError("BUDGET_ACCOUNT_COMMITTED_TOTAL_MISMATCH");
  }
  if (
    account.committedMicros + totals.reservedMicros > account.authorisedMicros
  ) {
    throw new BudgetIntegrityError("BUDGET_ACCOUNT_OBLIGATIONS_EXCEED_LIMIT");
  }
  if (
    !HASH_PATTERN.test(account.fingerprint)
    || account.fingerprint !== accountFingerprint(accountWithoutFingerprint(account))
  ) {
    throw new BudgetIntegrityError("BUDGET_ACCOUNT_FINGERPRINT_INVALID");
  }
}

function createReservation(input: Readonly<{
  accountId: string;
  jobId: string;
  queueItemId: string;
  attempt: number;
  requestedMicros: number;
  now: Date;
  ttlMs: number;
}>): BudgetReservation {
  requireTtl(input.ttlMs);
  const reservedAt = input.now.toISOString();
  const partial: Omit<BudgetReservation, "fingerprint"> = {
    id: budgetReservationId(input),
    jobId: input.jobId,
    queueItemId: input.queueItemId,
    attempt: input.attempt,
    requestedMicros: input.requestedMicros,
    status: "reserved",
    reservedAt,
    expiresAt: new Date(input.now.getTime() + input.ttlMs).toISOString(),
  };
  const reservation = {
    ...partial,
    fingerprint: reservationFingerprint(partial),
  };
  assertReservation(reservation, input.accountId);
  return Object.freeze(reservation);
}

function reviseReservation(
  reservation: BudgetReservation,
  updates: Partial<Omit<BudgetReservation,
    | "id"
    | "jobId"
    | "queueItemId"
    | "attempt"
    | "requestedMicros"
    | "reservedAt"
    | "fingerprint"
  >>,
): BudgetReservation {
  const { fingerprint: _fingerprint, previousFingerprint: _previous, ...base } = reservation;
  const partial: Omit<BudgetReservation, "fingerprint"> = {
    ...base,
    ...updates,
    previousFingerprint: reservation.fingerprint,
  };
  return Object.freeze({
    ...partial,
    fingerprint: reservationFingerprint(partial),
  });
}

function reviseAccount(
  account: BudgetAccount,
  input: Readonly<{
    authorisedMicros?: number;
    reservations?: readonly BudgetReservation[];
    now: Date;
  }>,
): BudgetAccount {
  assertBudgetAccount(account);
  if (input.now.getTime() < Date.parse(account.updatedAt)) {
    throw new BudgetConflictError("BUDGET_TRANSITION_TIME_REVERSED");
  }
  const reservations = Object.freeze([
    ...(input.reservations ?? account.reservations),
  ]);
  const totals = budgetTotals({ reservations });
  const { fingerprint: _fingerprint, previousFingerprint: _previous, ...base } = account;
  const partial: Omit<BudgetAccount, "fingerprint"> = {
    ...base,
    authorisedMicros: input.authorisedMicros ?? account.authorisedMicros,
    committedMicros: totals.committedMicros,
    reservations,
    revision: account.revision + 1,
    updatedAt: input.now.toISOString(),
    previousFingerprint: account.fingerprint,
  };
  const next = {
    ...partial,
    fingerprint: accountFingerprint(partial),
  };
  assertBudgetAccount(next);
  return Object.freeze(next);
}

function asPayload(account: BudgetAccount): Record<string, unknown> {
  return account as unknown as Record<string, unknown>;
}

function typedEnvelope(
  envelope: StoredEnvelope<Record<string, unknown>>,
): StoredEnvelope<BudgetAccount> {
  const account = envelope.payload as unknown as BudgetAccount;
  try {
    assertBudgetAccount(account);
  } catch (error) {
    throw new BudgetIntegrityError(
      `BUDGET_ACCOUNT_RECORD_INVALID:${error instanceof Error ? error.message : "UNKNOWN"}`,
    );
  }
  if (
    envelope.entityType !== BUDGET_ACCOUNT_ENTITY_TYPE
    || envelope.entityId !== account.id
    || envelope.revision !== account.revision
  ) {
    throw new BudgetIntegrityError("BUDGET_ACCOUNT_ENVELOPE_SCOPE_INVALID");
  }
  return envelope as unknown as StoredEnvelope<BudgetAccount>;
}

function findReservation(
  account: BudgetAccount,
  reservationId: string,
): BudgetReservation {
  requireIdentifier(reservationId, "BUDGET_RESERVATION_ID_INVALID");
  const reservation = account.reservations.find(
    (candidate) => candidate.id === reservationId,
  );
  if (!reservation) throw new BudgetConflictError("BUDGET_RESERVATION_NOT_FOUND");
  return reservation;
}

function replaceReservation(
  account: BudgetAccount,
  reservation: BudgetReservation,
): readonly BudgetReservation[] {
  return Object.freeze(account.reservations.map((candidate) =>
    candidate.id === reservation.id ? reservation : candidate
  ));
}

function accountMetadata(account: BudgetAccount): Readonly<Record<
  string,
  string | number | boolean | null
>> {
  const totals = budgetTotals(account);
  return {
    projectId: account.projectId,
    currency: account.currency,
    authorisedMicros: account.authorisedMicros,
    committedMicros: account.committedMicros,
    reservedMicros: totals.reservedMicros,
    availableMicros:
      account.authorisedMicros - account.committedMicros - totals.reservedMicros,
    activeReservationCount: totals.activeReservationCount,
    accountFingerprint: account.fingerprint,
  };
}

interface MutationResult<T> {
  changed: boolean;
  account: BudgetAccount;
  value: T;
  action: string;
  metadata?: Readonly<Record<string, string | number | boolean | null>>;
}

export class FileBudgetLedger {
  readonly #store: FileProjectStore;

  constructor(store: FileProjectStore) {
    this.#store = store;
  }

  async createAccount(input: Readonly<{
    projectId: string;
    currency: string;
    authorisedMicros: number;
    actorId: string;
    now?: Date;
  }>): Promise<StoredEnvelope<BudgetAccount>> {
    const projectId = requireIdentifier(input.projectId, "BUDGET_PROJECT_ID_INVALID");
    const currency = requireCurrency(input.currency);
    const authorisedMicros = requireMicros(
      input.authorisedMicros,
      "BUDGET_ACCOUNT_LIMIT_INVALID",
    );
    const actorId = requireIdentifier(input.actorId, "BUDGET_ACTOR_ID_INVALID");
    const now = input.now ?? new Date();
    const instant = now.toISOString();
    const partial: Omit<BudgetAccount, "fingerprint"> = {
      schemaVersion: BUDGET_ACCOUNT_SCHEMA_VERSION,
      id: budgetAccountId(projectId, currency),
      projectId,
      currency,
      authorisedMicros,
      committedMicros: 0,
      reservations: Object.freeze([]),
      revision: 1,
      createdAt: instant,
      updatedAt: instant,
    };
    const account = Object.freeze({
      ...partial,
      fingerprint: accountFingerprint(partial),
    });
    assertBudgetAccount(account);

    try {
      const created = typedEnvelope(await this.#store.create(
        BUDGET_ACCOUNT_ENTITY_TYPE,
        account.id,
        asPayload(account),
        now,
      ));
      await this.#audit(actorId, "budget.account.created", created);
      return created;
    } catch (error) {
      if (!(error instanceof StoreConflictError)) throw error;
      const existing = await this.read(projectId, currency);
      if (!existing) throw error;
      if (
        existing.payload.authorisedMicros !== authorisedMicros
        || existing.payload.projectId !== projectId
        || existing.payload.currency !== currency
      ) {
        throw new BudgetConflictError("BUDGET_ACCOUNT_IDEMPOTENCY_CONFLICT");
      }
      return existing;
    }
  }

  async read(
    projectId: string,
    currency: string,
  ): Promise<StoredEnvelope<BudgetAccount> | null> {
    const id = budgetAccountId(projectId, currency);
    const envelope = await this.#store.read<Record<string, unknown>>(
      BUDGET_ACCOUNT_ENTITY_TYPE,
      id,
    );
    return envelope ? typedEnvelope(envelope) : null;
  }

  async require(
    projectId: string,
    currency: string,
  ): Promise<StoredEnvelope<BudgetAccount>> {
    const envelope = await this.read(projectId, currency);
    if (!envelope) throw new BudgetConflictError("BUDGET_ACCOUNT_NOT_FOUND");
    return envelope;
  }

  async updateAuthorisedLimit(input: Readonly<{
    projectId: string;
    currency: string;
    authorisedMicros: number;
    actorId: string;
    now?: Date;
  }>): Promise<StoredEnvelope<BudgetAccount>> {
    const now = input.now ?? new Date();
    await this.reapExpired({
      projectId: input.projectId,
      currency: input.currency,
      actorId: input.actorId,
      now,
    });
    const authorisedMicros = requireMicros(
      input.authorisedMicros,
      "BUDGET_ACCOUNT_LIMIT_INVALID",
    );
    return (await this.#mutate({
      projectId: input.projectId,
      currency: input.currency,
      actorId: input.actorId,
      now,
      apply: (account): MutationResult<null> => {
        if (account.authorisedMicros === authorisedMicros) {
          return {
            changed: false,
            account,
            value: null,
            action: "budget.limit.updated",
          };
        }
        const totals = budgetTotals(account);
        if (authorisedMicros < account.committedMicros + totals.reservedMicros) {
          throw new BudgetConflictError("BUDGET_LIMIT_BELOW_OBLIGATIONS");
        }
        const next = reviseAccount(account, { authorisedMicros, now });
        return {
          changed: true,
          account: next,
          value: null,
          action: "budget.limit.updated",
        };
      },
    })).envelope;
  }

  async reserve(input: Readonly<{
    projectId: string;
    currency: string;
    jobId: string;
    queueItemId: string;
    attempt: number;
    maximumMicros: number;
    reservationTtlMs: number;
    actorId: string;
    now?: Date;
  }>): Promise<BudgetReservationReceipt> {
    const now = input.now ?? new Date();
    await this.reapExpired({
      projectId: input.projectId,
      currency: input.currency,
      actorId: input.actorId,
      now,
    });
    const maximumMicros = requireMicros(
      input.maximumMicros,
      "BUDGET_RESERVATION_REQUEST_INVALID",
      false,
    );
    const ttlMs = requireTtl(input.reservationTtlMs);
    const jobId = requireIdentifier(input.jobId, "BUDGET_JOB_ID_INVALID");
    const queueItemId = requireIdentifier(
      input.queueItemId,
      "BUDGET_QUEUE_ITEM_ID_INVALID",
    );
    const attempt = requireAttempt(input.attempt);

    const result = await this.#mutate({
      projectId: input.projectId,
      currency: input.currency,
      actorId: input.actorId,
      now,
      apply: (account): MutationResult<Readonly<{
        reservation: BudgetReservation;
        idempotent: boolean;
      }>> => {
        const id = budgetReservationId({
          accountId: account.id,
          jobId,
          queueItemId,
          attempt,
        });
        const existing = account.reservations.find(
          (candidate) => candidate.id === id,
        );
        if (existing) {
          if (existing.requestedMicros !== maximumMicros) {
            throw new BudgetConflictError("BUDGET_RESERVATION_IDEMPOTENCY_CONFLICT");
          }
          if (existing.status === "reserved" || existing.status === "committed") {
            return {
              changed: false,
              account,
              value: { reservation: existing, idempotent: true },
              action: "budget.reservation.created",
            };
          }
          throw new BudgetConflictError("BUDGET_RESERVATION_TERMINAL");
        }
        if (account.reservations.length >= MAX_RESERVATIONS) {
          throw new BudgetConflictError("BUDGET_RESERVATION_CAPACITY_EXCEEDED");
        }
        const totals = budgetTotals(account);
        const availableMicros =
          account.authorisedMicros - account.committedMicros - totals.reservedMicros;
        if (maximumMicros > availableMicros) {
          throw new BudgetInsufficientFundsError(maximumMicros, availableMicros);
        }
        const reservation = createReservation({
          accountId: account.id,
          jobId,
          queueItemId,
          attempt,
          requestedMicros: maximumMicros,
          now,
          ttlMs,
        });
        const next = reviseAccount(account, {
          reservations: Object.freeze([...account.reservations, reservation]),
          now,
        });
        return {
          changed: true,
          account: next,
          value: { reservation, idempotent: false },
          action: "budget.reservation.created",
          metadata: {
            reservationFingerprint: reservation.fingerprint,
            requestedMicros: maximumMicros,
          },
        };
      },
    });
    return {
      envelope: result.envelope,
      reservation: result.value.reservation,
      idempotent: result.value.idempotent,
    };
  }

  async renew(input: Readonly<{
    projectId: string;
    currency: string;
    reservationId: string;
    reservationTtlMs: number;
    actorId: string;
    now?: Date;
  }>): Promise<BudgetReservationReceipt> {
    const now = input.now ?? new Date();
    await this.reapExpired({
      projectId: input.projectId,
      currency: input.currency,
      actorId: input.actorId,
      now,
    });
    const ttlMs = requireTtl(input.reservationTtlMs);
    const result = await this.#mutate({
      projectId: input.projectId,
      currency: input.currency,
      actorId: input.actorId,
      now,
      apply: (account): MutationResult<Readonly<{
        reservation: BudgetReservation;
        idempotent: boolean;
      }>> => {
        const current = findReservation(account, input.reservationId);
        if (current.status !== "reserved") {
          throw new BudgetConflictError("BUDGET_RESERVATION_NOT_ACTIVE");
        }
        const nextExpiry = new Date(now.getTime() + ttlMs).toISOString();
        if (Date.parse(nextExpiry) <= Date.parse(current.expiresAt)) {
          return {
            changed: false,
            account,
            value: { reservation: current, idempotent: true },
            action: "budget.reservation.renewed",
          };
        }
        const reservation = reviseReservation(current, { expiresAt: nextExpiry });
        assertReservation(reservation, account.id);
        const next = reviseAccount(account, {
          reservations: replaceReservation(account, reservation),
          now,
        });
        return {
          changed: true,
          account: next,
          value: { reservation, idempotent: false },
          action: "budget.reservation.renewed",
          metadata: {
            reservationFingerprint: reservation.fingerprint,
            requestedMicros: reservation.requestedMicros,
          },
        };
      },
    });
    return {
      envelope: result.envelope,
      reservation: result.value.reservation,
      idempotent: result.value.idempotent,
    };
  }

  async commit(input: Readonly<{
    projectId: string;
    currency: string;
    reservationId: string;
    actualMicros: number;
    actorId: string;
    now?: Date;
  }>): Promise<BudgetReservationReceipt> {
    const now = input.now ?? new Date();
    await this.reapExpired({
      projectId: input.projectId,
      currency: input.currency,
      actorId: input.actorId,
      now,
    });
    const actualMicros = requireMicros(
      input.actualMicros,
      "BUDGET_COMMIT_AMOUNT_INVALID",
    );
    const result = await this.#mutate({
      projectId: input.projectId,
      currency: input.currency,
      actorId: input.actorId,
      now,
      apply: (account): MutationResult<Readonly<{
        reservation: BudgetReservation;
        idempotent: boolean;
      }>> => {
        const current = findReservation(account, input.reservationId);
        if (current.status === "committed") {
          if (current.committedMicros !== actualMicros) {
            throw new BudgetConflictError("BUDGET_COMMIT_IDEMPOTENCY_CONFLICT");
          }
          return {
            changed: false,
            account,
            value: { reservation: current, idempotent: true },
            action: "budget.reservation.committed",
          };
        }
        if (current.status !== "reserved") {
          throw new BudgetConflictError("BUDGET_RESERVATION_NOT_ACTIVE");
        }
        if (actualMicros > current.requestedMicros) {
          throw new BudgetConflictError("BUDGET_COMMIT_EXCEEDS_RESERVATION");
        }
        const reservation = reviseReservation(current, {
          status: "committed",
          committedMicros: actualMicros,
          committedAt: now.toISOString(),
        });
        assertReservation(reservation, account.id);
        const next = reviseAccount(account, {
          reservations: replaceReservation(account, reservation),
          now,
        });
        return {
          changed: true,
          account: next,
          value: { reservation, idempotent: false },
          action: "budget.reservation.committed",
          metadata: {
            reservationFingerprint: reservation.fingerprint,
            requestedMicros: reservation.requestedMicros,
            committedMicros: actualMicros,
          },
        };
      },
    });
    return {
      envelope: result.envelope,
      reservation: result.value.reservation,
      idempotent: result.value.idempotent,
    };
  }

  async release(input: Readonly<{
    projectId: string;
    currency: string;
    reservationId: string;
    releaseCode: string;
    actorId: string;
    now?: Date;
  }>): Promise<BudgetReservationReceipt> {
    const now = input.now ?? new Date();
    await this.reapExpired({
      projectId: input.projectId,
      currency: input.currency,
      actorId: input.actorId,
      now,
    });
    const releaseCode = requireCode(
      input.releaseCode,
      "BUDGET_RESERVATION_RELEASE_CODE_INVALID",
    );
    const result = await this.#mutate({
      projectId: input.projectId,
      currency: input.currency,
      actorId: input.actorId,
      now,
      apply: (account): MutationResult<Readonly<{
        reservation: BudgetReservation;
        idempotent: boolean;
      }>> => {
        const current = findReservation(account, input.reservationId);
        if (current.status === "released") {
          if (current.releaseCode !== releaseCode) {
            throw new BudgetConflictError("BUDGET_RELEASE_IDEMPOTENCY_CONFLICT");
          }
          return {
            changed: false,
            account,
            value: { reservation: current, idempotent: true },
            action: "budget.reservation.released",
          };
        }
        if (current.status === "expired") {
          return {
            changed: false,
            account,
            value: { reservation: current, idempotent: true },
            action: "budget.reservation.released",
          };
        }
        if (current.status !== "reserved") {
          throw new BudgetConflictError("BUDGET_RESERVATION_NOT_ACTIVE");
        }
        const reservation = reviseReservation(current, {
          status: "released",
          releasedAt: now.toISOString(),
          releaseCode,
        });
        assertReservation(reservation, account.id);
        const next = reviseAccount(account, {
          reservations: replaceReservation(account, reservation),
          now,
        });
        return {
          changed: true,
          account: next,
          value: { reservation, idempotent: false },
          action: "budget.reservation.released",
          metadata: {
            reservationFingerprint: reservation.fingerprint,
            releasedMicros: reservation.requestedMicros,
          },
        };
      },
    });
    return {
      envelope: result.envelope,
      reservation: result.value.reservation,
      idempotent: result.value.idempotent,
    };
  }

  async reapExpired(input: Readonly<{
    projectId: string;
    currency: string;
    actorId: string;
    now?: Date;
  }>): Promise<Readonly<{
    envelope: StoredEnvelope<BudgetAccount>;
    expiredCount: number;
  }>> {
    const now = input.now ?? new Date();
    const result = await this.#mutate({
      projectId: input.projectId,
      currency: input.currency,
      actorId: input.actorId,
      now,
      apply: (account): MutationResult<number> => {
        let expiredCount = 0;
        const reservations = account.reservations.map((reservation) => {
          if (
            reservation.status !== "reserved"
            || Date.parse(reservation.expiresAt) > now.getTime()
          ) {
            return reservation;
          }
          expiredCount += 1;
          const expired = reviseReservation(reservation, {
            status: "expired",
            releasedAt: now.toISOString(),
            releaseCode: "BUDGET_RESERVATION_EXPIRED",
          });
          assertReservation(expired, account.id);
          return expired;
        });
        if (expiredCount === 0) {
          return {
            changed: false,
            account,
            value: 0,
            action: "budget.reservation.expired",
          };
        }
        const next = reviseAccount(account, {
          reservations: Object.freeze(reservations),
          now,
        });
        return {
          changed: true,
          account: next,
          value: expiredCount,
          action: "budget.reservation.expired",
          metadata: { expiredCount },
        };
      },
    });
    return { envelope: result.envelope, expiredCount: result.value };
  }

  async publicView(
    projectId: string,
    currency: string,
  ): Promise<BudgetAccountPublicView> {
    return budgetAccountPublicView((await this.require(projectId, currency)).payload);
  }

  async #mutate<T>(input: Readonly<{
    projectId: string;
    currency: string;
    actorId: string;
    now: Date;
    apply: (account: BudgetAccount) => MutationResult<T>;
  }>): Promise<Readonly<{
    envelope: StoredEnvelope<BudgetAccount>;
    value: T;
  }>> {
    const actorId = requireIdentifier(input.actorId, "BUDGET_ACTOR_ID_INVALID");
    for (let attempt = 0; attempt < MAX_MUTATION_RETRIES; attempt += 1) {
      const current = await this.require(input.projectId, input.currency);
      const mutation = input.apply(current.payload);
      assertBudgetAccount(mutation.account);
      if (!mutation.changed) {
        return { envelope: current, value: mutation.value };
      }
      try {
        const saved = typedEnvelope(await this.#store.replace(
          BUDGET_ACCOUNT_ENTITY_TYPE,
          current.payload.id,
          current.revision,
          asPayload(mutation.account),
          input.now,
        ));
        await this.#audit(
          actorId,
          mutation.action,
          saved,
          mutation.metadata,
        );
        return { envelope: saved, value: mutation.value };
      } catch (error) {
        if (
          error instanceof StoreConflictError
          && error.message.startsWith("STORE_REVISION_CONFLICT:")
        ) {
          continue;
        }
        if (error instanceof StoreConflictError) {
          throw new BudgetConflictError(error.message);
        }
        throw error;
      }
    }
    throw new BudgetConflictError("BUDGET_MUTATION_RETRY_EXHAUSTED");
  }

  async #audit(
    actorId: string,
    action: string,
    envelope: StoredEnvelope<BudgetAccount>,
    metadata: Readonly<Record<string, string | number | boolean | null>> = {},
  ): Promise<void> {
    await this.#store.appendAuditEvent({
      actorId,
      action,
      entityType: BUDGET_ACCOUNT_ENTITY_TYPE,
      entityId: envelope.entityId,
      revision: envelope.revision,
      occurredAt: new Date(envelope.payload.updatedAt),
      metadata: {
        ...accountMetadata(envelope.payload),
        ...metadata,
      },
    });
  }
}

export function budgetAccountPublicView(
  account: BudgetAccount,
): BudgetAccountPublicView {
  assertBudgetAccount(account);
  const totals = budgetTotals(account);
  const availableMicros =
    account.authorisedMicros - account.committedMicros - totals.reservedMicros;
  return Object.freeze({
    currency: account.currency,
    authorisedMicros: account.authorisedMicros,
    committedMicros: account.committedMicros,
    reservedMicros: totals.reservedMicros,
    availableMicros,
    authorisedMajorUnits: budgetMajorUnits(account.authorisedMicros),
    committedMajorUnits: budgetMajorUnits(account.committedMicros),
    reservedMajorUnits: budgetMajorUnits(totals.reservedMicros),
    availableMajorUnits: budgetMajorUnits(availableMicros),
    activeReservationCount: totals.activeReservationCount,
    committedReservationCount: totals.committedReservationCount,
    terminalReservationCount: totals.terminalReservationCount,
    revision: account.revision,
    updatedAt: account.updatedAt,
    fingerprint: account.fingerprint,
  });
}
