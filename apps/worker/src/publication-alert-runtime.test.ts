import assert from "node:assert/strict";
import test from "node:test";
import type {
  AudiobookRetailPublicationAlertEmailMessage,
  AudiobookRetailPublicationAlertEmailProvider,
  AudiobookRetailPublicationAlertRecipientResolver,
} from "@evavo/storyteller-engine/audiobook-retail-publication-alert-delivery";
import type { FileAudiobookRetailPublicationAlertStore } from "@evavo/storyteller-engine/audiobook-retail-publication-alert";
import type { FileProjectStore } from "@evavo/storyteller-engine/project-store";
import type {
  WorkerProcessSignal,
  WorkerShutdownScheduler,
  WorkerSignalSource,
} from "./lifecycle.js";
import {
  resolvePublicationAlertRuntimeConfiguration,
  type PublicationAlertRuntimeConfiguration,
} from "./publication-alert-configuration.js";
import {
  EnvironmentPublicationAlertRecipientResolver,
  HttpPublicationAlertEmailProvider,
  runConfiguredPublicationAlertRuntime,
  type PublicationAlertRuntimeServiceControl,
  type PublicationAlertRuntimeServiceSnapshot,
  type PublicationAlertRuntimeWaiter,
} from "./publication-alert-runtime.js";
import type { WorkerEnvironment } from "./configuration.js";

const root = "C:/storyteller-publication-runtime-test";
const recipientHash = "a".repeat(64);
const emailToken = "private-email-gateway-token";
const recipientEmail = "publication-alerts@example.test";
const fromEmail = "storyteller@example.test";

function environment(
  overrides: WorkerEnvironment = {},
): WorkerEnvironment {
  return {
    NODE_ENV: "test",
    STORYTELLER_DATA_DIR: "./private-data",
    STORYTELLER_PUBLICATION_ALERT_MODE: "once",
    STORYTELLER_PUBLICATION_ALERT_WORKER_ID: "publication_runtime_worker_001",
    STORYTELLER_PUBLICATION_ALERT_RECIPIENT_BINDINGS: JSON.stringify({
      [recipientHash]: "PUBLICATION_RUNTIME_RECIPIENT_EMAIL",
    }),
    PUBLICATION_RUNTIME_RECIPIENT_EMAIL: recipientEmail,
    STORYTELLER_PUBLICATION_ALERT_EMAIL_ENDPOINT:
      "https://mail-gateway.example.test/v1/messages",
    STORYTELLER_PUBLICATION_ALERT_EMAIL_TOKEN_ENV:
      "PUBLICATION_RUNTIME_EMAIL_TOKEN",
    PUBLICATION_RUNTIME_EMAIL_TOKEN: emailToken,
    STORYTELLER_PUBLICATION_ALERT_FROM_EMAIL_ENV:
      "PUBLICATION_RUNTIME_FROM_EMAIL",
    PUBLICATION_RUNTIME_FROM_EMAIL: fromEmail,
    STORYTELLER_PUBLICATION_ALERT_FROM_NAME: "Storyteller Operations",
    ...overrides,
  };
}

function enabledConfiguration(
  overrides: WorkerEnvironment = {},
): Extract<PublicationAlertRuntimeConfiguration, { enabled: true }> {
  const configuration = resolvePublicationAlertRuntimeConfiguration(
    environment(overrides),
    root,
  );
  if (!configuration.enabled) throw new Error("enabled configuration required");
  return configuration;
}

function message(): AudiobookRetailPublicationAlertEmailMessage {
  return Object.freeze({
    to: recipientEmail,
    subject: "[HIGH] Publication degraded",
    textBody: "A publication issue was detected.\nReview the incident.",
    htmlBody: "<p>A publication issue was detected.</p>",
    templateCode: "publication-regional-degradation",
    idempotencyKey: "b".repeat(64),
    messageFingerprint: "c".repeat(64),
  });
}

class FakeSignalSource implements WorkerSignalSource {
  listener: ((signal: WorkerProcessSignal) => void) | undefined;
  unsubscribed = false;

  subscribe(listener: (signal: WorkerProcessSignal) => void): () => void {
    this.listener = listener;
    return () => {
      this.unsubscribed = true;
      this.listener = undefined;
    };
  }

  emit(signal: WorkerProcessSignal): void {
    this.listener?.(signal);
  }
}

class FakeScheduler implements WorkerShutdownScheduler {
  readonly delays: number[] = [];
  callback: (() => void) | undefined;
  cancelled = false;

  schedule(callback: () => void, delayMs: number) {
    this.callback = callback;
    this.delays.push(delayMs);
    return {
      cancel: () => {
        this.cancelled = true;
      },
    };
  }
}

class FakeRuntimeService implements PublicationAlertRuntimeServiceControl {
  state: PublicationAlertRuntimeServiceSnapshot["state"] = "idle";
  runUntilIdleCalls = 0;
  startCalls = 0;
  drainCalls = 0;
  abortCodes: string[] = [];
  readonly #continuous: boolean;
  #resolveStart: (() => void) | undefined;

  constructor(continuous = false) {
    this.#continuous = continuous;
  }

  async runUntilIdle(): Promise<void> {
    this.runUntilIdleCalls += 1;
    this.state = "running";
    this.state = "stopped";
  }

  start(): Promise<void> {
    this.startCalls += 1;
    this.state = "running";
    if (!this.#continuous) {
      this.state = "stopped";
      return Promise.resolve();
    }
    return new Promise<void>((resolvePromise) => {
      this.#resolveStart = () => {
        this.state = "stopped";
        resolvePromise();
      };
    });
  }

  requestDrain(): void {
    this.drainCalls += 1;
    this.state = "draining";
    this.#resolveStart?.();
  }

  abortActive(reason = new Error("PUBLICATION_ALERT_RUNTIME_ABORTED")): void {
    this.abortCodes.push(reason.message);
    this.#resolveStart?.();
  }

  snapshot(): PublicationAlertRuntimeServiceSnapshot {
    return Object.freeze({
      state: this.state,
      passes: this.runUntilIdleCalls + this.startCalls,
      discoveredAlerts: 3,
      processedAlerts: 3,
      sentAlerts: 2,
      failedAlerts: 1,
      skippedAlerts: 0,
      conflictAlerts: 0,
      remainingPendingAlerts: 1,
      lastPassAt: "2026-07-29T00:00:00.000Z",
    });
  }
}

function serviceFactory(service: FakeRuntimeService) {
  return (
    _configuration: Extract<PublicationAlertRuntimeConfiguration, { enabled: true }>,
    dependencies: Readonly<{
      state: FileProjectStore;
      alerts: FileAudiobookRetailPublicationAlertStore;
      recipients: AudiobookRetailPublicationAlertRecipientResolver;
      provider: AudiobookRetailPublicationAlertEmailProvider;
      waiter: PublicationAlertRuntimeWaiter;
      now: () => Date;
    }>,
  ): PublicationAlertRuntimeServiceControl => {
    assert.ok(dependencies.state);
    assert.ok(dependencies.alerts);
    assert.ok(dependencies.recipients);
    assert.ok(dependencies.provider);
    return service;
  };
}

test("environment recipient resolution keeps raw addresses outside configuration and returns exact routes", async () => {
  const resolver = new EnvironmentPublicationAlertRecipientResolver(
    environment(),
    { [recipientHash]: "PUBLICATION_RUNTIME_RECIPIENT_EMAIL" },
  );
  const route = await resolver.resolve(recipientHash, new AbortController().signal);
  assert.deepEqual(route, {
    recipientReferenceHash: recipientHash,
    emailAddress: recipientEmail,
  });
  assert.equal(await resolver.resolve("b".repeat(64), new AbortController().signal), null);
  await assert.rejects(
    resolver.resolve("unsafe", new AbortController().signal),
    /PUBLICATION_ALERT_RUNTIME_RECIPIENT_HASH_INVALID/u,
  );

  const missing = new EnvironmentPublicationAlertRecipientResolver(
    {},
    { [recipientHash]: "PUBLICATION_RUNTIME_RECIPIENT_EMAIL" },
  );
  assert.equal(await missing.resolve(recipientHash, new AbortController().signal), null);
});

test("HTTP email adapter sends one bounded idempotent request and accepts header receipts", async () => {
  const calls: Array<Readonly<{ url: string; init: RequestInit }>> = [];
  const provider = new HttpPublicationAlertEmailProvider({
    providerId: "private_mail_gateway",
    adapterVersion: "2.0.0",
    endpoint: "https://mail-gateway.example.test/v1/messages",
    token: emailToken,
    fromEmail,
    fromName: "Storyteller Operations",
    fetch: async (input, init) => {
      calls.push({ url: String(input), init: init ?? {} });
      return new Response("", {
        status: 202,
        headers: { "x-message-id": "message-receipt-001" },
      });
    },
  });
  const receipt = await provider.send(message(), new AbortController().signal);
  assert.deepEqual(receipt, { receiptReference: "message-receipt-001" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "https://mail-gateway.example.test/v1/messages");
  const headers = new Headers(calls[0]?.init.headers);
  assert.equal(headers.get("authorization"), `Bearer ${emailToken}`);
  assert.equal(headers.get("idempotency-key"), message().idempotencyKey);
  const body = JSON.parse(String(calls[0]?.init.body)) as Record<string, unknown>;
  assert.equal(body.from, `Storyteller Operations <${fromEmail}>`);
  assert.deepEqual(body.to, [recipientEmail]);
  assert.equal(body.subject, message().subject);
  assert.equal(body.idempotencyKey, message().idempotencyKey);
});

test("HTTP adapter accepts bounded JSON receipts and maps provider failures to safe codes", async () => {
  const jsonProvider = new HttpPublicationAlertEmailProvider({
    providerId: "private_mail_gateway",
    adapterVersion: "2.0.0",
    endpoint: "https://mail-gateway.example.test/v1/messages",
    token: emailToken,
    fromEmail,
    fetch: async () => new Response(JSON.stringify({ id: "json-receipt-001" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  });
  assert.deepEqual(
    await jsonProvider.send(message(), new AbortController().signal),
    { receiptReference: "json-receipt-001" },
  );

  for (const [status, expected] of [
    [429, /PUBLICATION_ALERT_RUNTIME_PROVIDER_RATE_LIMITED/u],
    [503, /PUBLICATION_ALERT_RUNTIME_PROVIDER_UNAVAILABLE/u],
    [400, /PUBLICATION_ALERT_RUNTIME_PROVIDER_REJECTED/u],
  ] as const) {
    const provider = new HttpPublicationAlertEmailProvider({
      providerId: "private_mail_gateway",
      adapterVersion: "2.0.0",
      endpoint: "https://mail-gateway.example.test/v1/messages",
      token: emailToken,
      fromEmail,
      fetch: async () => new Response("rejected", { status }),
    });
    await assert.rejects(
      provider.send(message(), new AbortController().signal),
      expected,
    );
  }
});

test("disabled publication runtime does not evaluate secrets, routes or network dependencies", async () => {
  const configuration = resolvePublicationAlertRuntimeConfiguration({}, root);
  const result = await runConfiguredPublicationAlertRuntime(configuration, {
    environment: {
      PUBLICATION_RUNTIME_EMAIL_TOKEN: "should-not-be-read",
    },
    fetch: async () => {
      throw new Error("network must not be called");
    },
  });
  assert.deepEqual(result, {
    status: "disabled",
    configuration: {
      mode: "disabled",
      enabled: false,
      persistence: "none",
      executionApiExposed: false,
      concurrency: 0,
      maximumBatchSize: 0,
      pollIntervalMs: 0,
      providerTimeoutMs: 0,
      shutdownGraceMs: 0,
      recipientBindingCount: 0,
      emailProviderConfigured: false,
      productionSingleHostAcknowledged: false,
    },
  });
});

test("once mode resolves secrets privately and returns only a safe service snapshot", async () => {
  const configuration = enabledConfiguration();
  const service = new FakeRuntimeService();
  const result = await runConfiguredPublicationAlertRuntime(configuration, {
    environment: environment(),
    fetch: async () => new Response(JSON.stringify({ id: "unused" }), { status: 200 }),
    serviceFactory: serviceFactory(service),
  });
  assert.equal(result.status, "stopped");
  assert.equal(service.runUntilIdleCalls, 1);
  assert.equal(service.startCalls, 0);
  const serialised = JSON.stringify(result);
  for (const forbidden of [
    emailToken,
    recipientEmail,
    fromEmail,
    "PUBLICATION_RUNTIME_RECIPIENT_EMAIL",
    "PUBLICATION_RUNTIME_EMAIL_TOKEN",
    "PUBLICATION_RUNTIME_FROM_EMAIL",
    "mail-gateway.example.test",
    configuration.workerId,
    configuration.stateRootDirectory,
    recipientHash,
  ]) {
    assert.equal(serialised.includes(forbidden), false);
  }
});

test("enabled runtime fails before service creation when required environment secrets are missing", async () => {
  const configuration = enabledConfiguration();
  await assert.rejects(
    runConfiguredPublicationAlertRuntime(configuration, {
      environment: environment({ PUBLICATION_RUNTIME_EMAIL_TOKEN: undefined }),
      serviceFactory: serviceFactory(new FakeRuntimeService()),
    }),
    /PUBLICATION_ALERT_RUNTIME_EMAIL_TOKEN_MISSING/u,
  );
  await assert.rejects(
    runConfiguredPublicationAlertRuntime(configuration, {
      environment: environment({ PUBLICATION_RUNTIME_FROM_EMAIL: undefined }),
      serviceFactory: serviceFactory(new FakeRuntimeService()),
    }),
    /PUBLICATION_ALERT_RUNTIME_FROM_EMAIL_MISSING/u,
  );
});

test("continuous mode drains on the first signal and unsubscribes cleanly", async () => {
  const configuration = enabledConfiguration({
    STORYTELLER_PUBLICATION_ALERT_MODE: "continuous",
  });
  const service = new FakeRuntimeService(true);
  const signals = new FakeSignalSource();
  const scheduler = new FakeScheduler();
  const running = runConfiguredPublicationAlertRuntime(configuration, {
    environment: environment({
      STORYTELLER_PUBLICATION_ALERT_MODE: "continuous",
    }),
    serviceFactory: serviceFactory(service),
    signals,
    shutdownScheduler: scheduler,
  });
  await Promise.resolve();
  signals.emit("SIGTERM");
  const result = await running;
  assert.equal(result.status, "stopped");
  assert.equal(result.shutdownSignal, "SIGTERM");
  assert.equal(result.forcedAbort, false);
  assert.equal(service.startCalls, 1);
  assert.equal(service.drainCalls, 1);
  assert.deepEqual(scheduler.delays, [configuration.shutdownGraceMs]);
  assert.equal(scheduler.cancelled, true);
  assert.equal(signals.unsubscribed, true);
});

test("a second process signal forces an active publication delivery abort", async () => {
  const configuration = enabledConfiguration({
    STORYTELLER_PUBLICATION_ALERT_MODE: "continuous",
  });
  const service = new FakeRuntimeService(true);
  const signals = new FakeSignalSource();
  const scheduler = new FakeScheduler();
  const running = runConfiguredPublicationAlertRuntime(configuration, {
    environment: environment({
      STORYTELLER_PUBLICATION_ALERT_MODE: "continuous",
    }),
    serviceFactory: serviceFactory(service),
    signals,
    shutdownScheduler: scheduler,
  });
  await Promise.resolve();
  signals.emit("SIGINT");
  signals.emit("SIGTERM");
  const result = await running;
  assert.equal(result.status, "stopped");
  assert.equal(result.shutdownSignal, "SIGINT");
  assert.equal(result.forcedAbort, true);
  assert.deepEqual(service.abortCodes, [
    "PUBLICATION_ALERT_RUNTIME_SECOND_SIGNAL_ABORT",
  ]);
});
