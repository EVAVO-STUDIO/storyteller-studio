import {
  AUDIOBOOK_RETAIL_PUBLICATION_ALERT_ENTITY_TYPE,
  FileAudiobookRetailPublicationAlertStore,
  createAudiobookRetailPublicationAlert,
  resolveAudiobookRetailPublicationAlert,
  type AudiobookRetailPublicationAlert,
} from "./audiobook-retail-publication-alert.js";
import {
  AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_ENTITY_TYPE,
  FileAudiobookRetailPublicationMonitorStore,
  assertAudiobookRetailPublicationMonitor,
  markAudiobookRetailPublicationMonitorStale,
  recordAudiobookRetailPublicationRefresh,
  type AudiobookRetailPublicationMonitor,
} from "./audiobook-retail-publication-monitor.js";
import {
  assertAudiobookRetailPublicationVerification,
  type AudiobookRetailPublicationVerification,
} from "./audiobook-retail-publication-verification.js";
import type { FileProjectStore } from "./project-store.js";

export type AudiobookRetailPublicationRefreshDisposition =
  | "not-due"
  | "refreshed"
  | "marked-stale"
  | "already-stale"
  | "failed"
  | "conflict";

export interface AudiobookRetailPublicationVerificationProvider {
  acquire(
    monitor: AudiobookRetailPublicationMonitor,
    signal: AbortSignal,
  ): Promise<AudiobookRetailPublicationVerification | null>;
}

export interface AudiobookRetailPublicationRefreshDependencies {
  state: FileProjectStore;
  monitors: FileAudiobookRetailPublicationMonitorStore;
  alerts: FileAudiobookRetailPublicationAlertStore;
  verificationProvider: AudiobookRetailPublicationVerificationProvider;
}

export interface RefreshAudiobookRetailPublicationMonitorInput {
  monitorId: string;
  workerId: string;
  recipientReferenceHash: string;
  acquisitionTimeoutMs?: number;
  refreshedAt?: Date;
  signal?: AbortSignal;
}

export interface AudiobookRetailPublicationRefreshResult {
  monitorId: string;
  disposition: AudiobookRetailPublicationRefreshDisposition;
  currentHealth: AudiobookRetailPublicationMonitor["currentHealth"];
  monitorRevision: number;
  transitionKind: AudiobookRetailPublicationMonitor["transitions"][number]["kind"];
  verificationId?: string;
  alertCreated: boolean;
  alertsResolved: number;
  failureCode?: string;
  occurredAt: string;
}

export interface AudiobookRetailPublicationRefreshWorkerOptions {
  workerId: string;
  recipientReferenceHash: string;
  concurrency?: number;
  acquisitionTimeoutMs?: number;
  maximumBatchSize?: number;
  now?: () => Date;
}

export interface AudiobookRetailPublicationRefreshWorkerSnapshot {
  state: "idle" | "running" | "stopped" | "failed";
  dueMonitors: number;
  processedMonitors: number;
  refreshedMonitors: number;
  staleMonitors: number;
  failedMonitors: number;
  conflictMonitors: number;
  alertsCreated: number;
  alertsResolved: number;
  remainingDueMonitors: number;
  failureCode?: string;
  results: readonly AudiobookRetailPublicationRefreshResult[];
}

export class AudiobookRetailPublicationRefreshError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AudiobookRetailPublicationRefreshError";
    this.code = code;
  }
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const SAFE_CODE = /^[A-Z][A-Z0-9_]{2,95}$/u;

function requireIdentifier(value: string, code: string): string {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new AudiobookRetailPublicationRefreshError(code);
  }
  return value;
}

function requireHash(value: string, code: string): string {
  if (!HASH_PATTERN.test(value)) {
    throw new AudiobookRetailPublicationRefreshError(code);
  }
  return value;
}

function requireInteger(
  value: number,
  minimum: number,
  maximum: number,
  code: string,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new AudiobookRetailPublicationRefreshError(code);
  }
  return value;
}

function safeFailureCode(error: unknown): string {
  if (error instanceof AudiobookRetailPublicationRefreshError) return error.code;
  const message = error instanceof Error ? error.message : "";
  const candidate = message.match(/^[A-Z][A-Z0-9_]{2,95}/u)?.[0];
  return candidate && SAFE_CODE.test(candidate)
    ? candidate
    : "AUDIOBOOK_RETAIL_PUBLICATION_REFRESH_FAILED";
}

async function runWithTimeout<T>(
  timeoutMs: number,
  signal: AbortSignal | undefined,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  if (signal?.aborted) {
    throw new AudiobookRetailPublicationRefreshError(
      "AUDIOBOOK_RETAIL_PUBLICATION_REFRESH_ABORTED",
    );
  }
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new AudiobookRetailPublicationRefreshError(
      "AUDIOBOOK_RETAIL_PUBLICATION_REFRESH_TIMEOUT",
    ));
  }, timeoutMs);
  timer.unref?.();
  const onAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise<T>((_resolve, reject) => {
        controller.signal.addEventListener("abort", () => {
          reject(controller.signal.reason instanceof Error
            ? controller.signal.reason
            : new AudiobookRetailPublicationRefreshError(
                "AUDIOBOOK_RETAIL_PUBLICATION_REFRESH_ABORTED",
              ));
        }, { once: true });
      }),
    ]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

function result(
  monitor: AudiobookRetailPublicationMonitor,
  disposition: AudiobookRetailPublicationRefreshDisposition,
  occurredAt: Date,
  input: Readonly<{
    verificationId?: string;
    alertCreated?: boolean;
    alertsResolved?: number;
    failureCode?: string;
  }> = {},
): AudiobookRetailPublicationRefreshResult {
  return Object.freeze({
    monitorId: monitor.id,
    disposition,
    currentHealth: monitor.currentHealth,
    monitorRevision: monitor.revision,
    transitionKind: monitor.transitions.at(-1)!.kind,
    ...(input.verificationId ? { verificationId: input.verificationId } : {}),
    alertCreated: input.alertCreated ?? false,
    alertsResolved: input.alertsResolved ?? 0,
    ...(input.failureCode ? { failureCode: input.failureCode } : {}),
    occurredAt: occurredAt.toISOString(),
  });
}

async function openAlertsForMonitor(
  state: FileProjectStore,
  alerts: FileAudiobookRetailPublicationAlertStore,
  monitorId: string,
): Promise<readonly AudiobookRetailPublicationAlert[]> {
  const rows = await state.list(AUDIOBOOK_RETAIL_PUBLICATION_ALERT_ENTITY_TYPE);
  const output: AudiobookRetailPublicationAlert[] = [];
  for (const row of rows) {
    const alert = (await alerts.require(row.entityId)).payload;
    if (alert.monitor.id === monitorId && alert.status !== "resolved") {
      output.push(alert);
    }
  }
  output.sort((left, right) =>
    Date.parse(left.createdAt) - Date.parse(right.createdAt)
    || left.id.localeCompare(right.id, "en-AU")
  );
  return Object.freeze(output);
}

async function createActionableAlert(
  dependencies: AudiobookRetailPublicationRefreshDependencies,
  monitor: AudiobookRetailPublicationMonitor,
  workerId: string,
  recipientReferenceHash: string,
  occurredAt: Date,
): Promise<boolean> {
  const transition = monitor.transitions.at(-1)!;
  if (
    monitor.currentHealth === "healthy-live"
    || transition.kind === "refresh"
    || transition.kind === "recovery"
  ) {
    return false;
  }
  const alert = createAudiobookRetailPublicationAlert({
    monitor,
    recipientReferenceHash,
    createdAt: occurredAt,
  });
  await dependencies.alerts.create(alert, workerId);
  return true;
}

async function resolveRecoveredAlerts(
  dependencies: AudiobookRetailPublicationRefreshDependencies,
  monitor: AudiobookRetailPublicationMonitor,
  workerId: string,
  resolvedAt: Date,
): Promise<number> {
  const latest = monitor.transitions.at(-1)!;
  if (
    monitor.currentHealth !== "healthy-live"
    || latest.kind !== "recovery"
  ) {
    return 0;
  }
  const alerts = await openAlertsForMonitor(
    dependencies.state,
    dependencies.alerts,
    monitor.id,
  );
  let resolved = 0;
  for (const alert of alerts) {
    const next = resolveAudiobookRetailPublicationAlert(alert, {
      recoveryMonitor: monitor,
      resolvedByActorId: workerId,
      resolvedAt,
    });
    if (next.fingerprint === alert.fingerprint) continue;
    await dependencies.alerts.save(next, {
      expectedRevision: alert.revision,
      actorId: workerId,
      action: "audiobook_retail_publication_alert.resolved_by_refresh",
    });
    resolved += 1;
  }
  return resolved;
}

async function saveMonitor(
  dependencies: AudiobookRetailPublicationRefreshDependencies,
  previous: AudiobookRetailPublicationMonitor,
  next: AudiobookRetailPublicationMonitor,
  workerId: string,
  action: string,
): Promise<AudiobookRetailPublicationMonitor> {
  try {
    return (await dependencies.monitors.save(next, {
      expectedRevision: previous.revision,
      actorId: workerId,
      action,
    })).payload;
  } catch {
    throw new AudiobookRetailPublicationRefreshError(
      "AUDIOBOOK_RETAIL_PUBLICATION_REFRESH_SAVE_CONFLICT",
    );
  }
}

export async function refreshAudiobookRetailPublicationMonitor(
  dependencies: AudiobookRetailPublicationRefreshDependencies,
  input: RefreshAudiobookRetailPublicationMonitorInput,
): Promise<AudiobookRetailPublicationRefreshResult> {
  const monitorId = requireIdentifier(
    input.monitorId,
    "AUDIOBOOK_RETAIL_PUBLICATION_REFRESH_MONITOR_ID_INVALID",
  );
  const workerId = requireIdentifier(
    input.workerId,
    "AUDIOBOOK_RETAIL_PUBLICATION_REFRESH_WORKER_ID_INVALID",
  );
  const recipientReferenceHash = requireHash(
    input.recipientReferenceHash,
    "AUDIOBOOK_RETAIL_PUBLICATION_REFRESH_RECIPIENT_HASH_INVALID",
  );
  const acquisitionTimeoutMs = requireInteger(
    input.acquisitionTimeoutMs ?? 60_000,
    100,
    10 * 60_000,
    "AUDIOBOOK_RETAIL_PUBLICATION_REFRESH_TIMEOUT_INVALID",
  );
  const refreshedAt = input.refreshedAt ?? new Date();
  if (Number.isNaN(refreshedAt.getTime())) {
    throw new AudiobookRetailPublicationRefreshError(
      "AUDIOBOOK_RETAIL_PUBLICATION_REFRESH_DATE_INVALID",
    );
  }
  const envelope = await dependencies.monitors.require(monitorId);
  const monitor = envelope.payload;
  assertAudiobookRetailPublicationMonitor(monitor);
  if (refreshedAt.getTime() < Date.parse(monitor.nextRefreshDueAt)) {
    return result(monitor, "not-due", refreshedAt);
  }

  let verification: AudiobookRetailPublicationVerification | null;
  try {
    verification = await runWithTimeout(
      acquisitionTimeoutMs,
      input.signal,
      (signal) => dependencies.verificationProvider.acquire(monitor, signal),
    );
  } catch (error) {
    if (
      input.signal?.aborted
      || safeFailureCode(error) === "AUDIOBOOK_RETAIL_PUBLICATION_REFRESH_ABORTED"
    ) {
      throw new AudiobookRetailPublicationRefreshError(
        "AUDIOBOOK_RETAIL_PUBLICATION_REFRESH_ABORTED",
      );
    }
    return result(monitor, "failed", refreshedAt, {
      failureCode: safeFailureCode(error),
    });
  }

  if (verification) {
    try {
      assertAudiobookRetailPublicationVerification(verification);
      const next = recordAudiobookRetailPublicationRefresh(
        monitor,
        verification,
        refreshedAt,
      );
      const saved = await saveMonitor(
        dependencies,
        monitor,
        next,
        workerId,
        "audiobook_retail_publication_monitor.refresh_recorded",
      );
      const alertCreated = await createActionableAlert(
        dependencies,
        saved,
        workerId,
        recipientReferenceHash,
        refreshedAt,
      );
      const alertsResolved = await resolveRecoveredAlerts(
        dependencies,
        saved,
        workerId,
        refreshedAt,
      );
      return result(saved, "refreshed", refreshedAt, {
        verificationId: verification.id,
        alertCreated,
        alertsResolved,
      });
    } catch (error) {
      if (
        safeFailureCode(error)
          === "AUDIOBOOK_RETAIL_PUBLICATION_REFRESH_SAVE_CONFLICT"
      ) {
        const latest = (await dependencies.monitors.require(monitorId)).payload;
        return result(latest, "conflict", refreshedAt, {
          failureCode: safeFailureCode(error),
        });
      }
      return result(monitor, "failed", refreshedAt, {
        verificationId: verification.id,
        failureCode: safeFailureCode(error),
      });
    }
  }

  if (monitor.currentHealth === "stale") {
    return result(monitor, "already-stale", refreshedAt);
  }
  try {
    const next = markAudiobookRetailPublicationMonitorStale(monitor, refreshedAt);
    const saved = await saveMonitor(
      dependencies,
      monitor,
      next,
      workerId,
      "audiobook_retail_publication_monitor.marked_stale",
    );
    const alertCreated = await createActionableAlert(
      dependencies,
      saved,
      workerId,
      recipientReferenceHash,
      refreshedAt,
    );
    return result(saved, "marked-stale", refreshedAt, { alertCreated });
  } catch (error) {
    if (
      safeFailureCode(error)
        === "AUDIOBOOK_RETAIL_PUBLICATION_REFRESH_SAVE_CONFLICT"
    ) {
      const latest = (await dependencies.monitors.require(monitorId)).payload;
      return result(latest, "conflict", refreshedAt, {
        failureCode: safeFailureCode(error),
      });
    }
    return result(monitor, "failed", refreshedAt, {
      failureCode: safeFailureCode(error),
    });
  }
}

export async function listDueAudiobookRetailPublicationMonitorIds(
  state: FileProjectStore,
  monitors: FileAudiobookRetailPublicationMonitorStore,
  now = new Date(),
  maximum = 1_000,
): Promise<readonly string[]> {
  if (Number.isNaN(now.getTime())) {
    throw new AudiobookRetailPublicationRefreshError(
      "AUDIOBOOK_RETAIL_PUBLICATION_REFRESH_DATE_INVALID",
    );
  }
  requireInteger(
    maximum,
    1,
    10_000,
    "AUDIOBOOK_RETAIL_PUBLICATION_REFRESH_LIST_LIMIT_INVALID",
  );
  const rows = await state.list(AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_ENTITY_TYPE);
  const due: AudiobookRetailPublicationMonitor[] = [];
  for (const row of rows) {
    const monitor = (await monitors.require(row.entityId)).payload;
    if (now.getTime() >= Date.parse(monitor.nextRefreshDueAt)) due.push(monitor);
  }
  due.sort((left, right) =>
    Date.parse(left.nextRefreshDueAt) - Date.parse(right.nextRefreshDueAt)
    || left.id.localeCompare(right.id, "en-AU")
  );
  return Object.freeze(due.slice(0, maximum).map((monitor) => monitor.id));
}

export class AudiobookRetailPublicationRefreshWorker {
  readonly #dependencies: AudiobookRetailPublicationRefreshDependencies;
  readonly #workerId: string;
  readonly #recipientReferenceHash: string;
  readonly #concurrency: number;
  readonly #acquisitionTimeoutMs: number;
  readonly #maximumBatchSize: number;
  readonly #now: () => Date;
  #state: AudiobookRetailPublicationRefreshWorkerSnapshot["state"] = "idle";
  #running = false;
  #failureCode: string | undefined;

  constructor(
    dependencies: AudiobookRetailPublicationRefreshDependencies,
    options: AudiobookRetailPublicationRefreshWorkerOptions,
  ) {
    this.#dependencies = dependencies;
    this.#workerId = requireIdentifier(
      options.workerId,
      "AUDIOBOOK_RETAIL_PUBLICATION_REFRESH_WORKER_ID_INVALID",
    );
    this.#recipientReferenceHash = requireHash(
      options.recipientReferenceHash,
      "AUDIOBOOK_RETAIL_PUBLICATION_REFRESH_RECIPIENT_HASH_INVALID",
    );
    this.#concurrency = requireInteger(
      options.concurrency ?? 2,
      1,
      16,
      "AUDIOBOOK_RETAIL_PUBLICATION_REFRESH_CONCURRENCY_INVALID",
    );
    this.#acquisitionTimeoutMs = requireInteger(
      options.acquisitionTimeoutMs ?? 60_000,
      100,
      10 * 60_000,
      "AUDIOBOOK_RETAIL_PUBLICATION_REFRESH_TIMEOUT_INVALID",
    );
    this.#maximumBatchSize = requireInteger(
      options.maximumBatchSize ?? 100,
      1,
      1_000,
      "AUDIOBOOK_RETAIL_PUBLICATION_REFRESH_BATCH_INVALID",
    );
    this.#now = options.now ?? (() => new Date());
  }

  get state(): AudiobookRetailPublicationRefreshWorkerSnapshot["state"] {
    return this.#state;
  }

  async runUntilIdle(
    signal?: AbortSignal,
  ): Promise<AudiobookRetailPublicationRefreshWorkerSnapshot> {
    if (this.#running) {
      throw new AudiobookRetailPublicationRefreshError(
        "AUDIOBOOK_RETAIL_PUBLICATION_REFRESH_WORKER_ALREADY_RUNNING",
      );
    }
    this.#running = true;
    this.#state = "running";
    this.#failureCode = undefined;
    const results: AudiobookRetailPublicationRefreshResult[] = [];
    let dueMonitors = 0;
    try {
      const passTime = this.#now();
      const ids = await listDueAudiobookRetailPublicationMonitorIds(
        this.#dependencies.state,
        this.#dependencies.monitors,
        passTime,
        this.#maximumBatchSize,
      );
      dueMonitors = ids.length;
      let cursor = 0;
      const workers = Array.from(
        { length: Math.min(this.#concurrency, ids.length) },
        async () => {
          while (cursor < ids.length) {
            if (signal?.aborted) {
              throw new AudiobookRetailPublicationRefreshError(
                "AUDIOBOOK_RETAIL_PUBLICATION_REFRESH_ABORTED",
              );
            }
            const index = cursor++;
            results[index] = await refreshAudiobookRetailPublicationMonitor(
              this.#dependencies,
              {
                monitorId: ids[index]!,
                workerId: this.#workerId,
                recipientReferenceHash: this.#recipientReferenceHash,
                acquisitionTimeoutMs: this.#acquisitionTimeoutMs,
                refreshedAt: this.#now(),
                ...(signal ? { signal } : {}),
              },
            );
          }
        },
      );
      await Promise.all(workers);
      this.#state = "stopped";
    } catch (error) {
      this.#failureCode = safeFailureCode(error);
      this.#state = "failed";
      throw error;
    } finally {
      this.#running = false;
    }
    const remainingDueMonitors = (
      await listDueAudiobookRetailPublicationMonitorIds(
        this.#dependencies.state,
        this.#dependencies.monitors,
        this.#now(),
        10_000,
      )
    ).length;
    return Object.freeze({
      state: this.#state,
      dueMonitors,
      processedMonitors: results.length,
      refreshedMonitors: results.filter(
        (item) => item.disposition === "refreshed",
      ).length,
      staleMonitors: results.filter((item) => [
        "marked-stale",
        "already-stale",
      ].includes(item.disposition)).length,
      failedMonitors: results.filter(
        (item) => item.disposition === "failed",
      ).length,
      conflictMonitors: results.filter(
        (item) => item.disposition === "conflict",
      ).length,
      alertsCreated: results.reduce(
        (total, item) => total + (item.alertCreated ? 1 : 0),
        0,
      ),
      alertsResolved: results.reduce(
        (total, item) => total + item.alertsResolved,
        0,
      ),
      remainingDueMonitors,
      ...(this.#failureCode ? { failureCode: this.#failureCode } : {}),
      results: Object.freeze([...results]),
    });
  }
}
