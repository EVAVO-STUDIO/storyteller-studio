import type { AudioStudioFetch } from "./audio-studio-types.js";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function requireString(
  value: unknown,
  code: string,
  minimum = 1,
  maximum = 4_096,
): string {
  if (
    typeof value !== "string"
    || value.length < minimum
    || value.length > maximum
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)
  ) {
    throw new Error(code);
  }
  return value;
}

export function requireBoolean(value: unknown, code: string): boolean {
  if (typeof value !== "boolean") throw new Error(code);
  return value;
}

export function requireInteger(
  value: unknown,
  code: string,
  minimum: number,
  maximum: number,
): number {
  if (
    !Number.isSafeInteger(value)
    || (value as number) < minimum
    || (value as number) > maximum
  ) {
    throw new Error(code);
  }
  return value as number;
}

export function requireArray(value: unknown, code: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(code);
  return value;
}

export function validateAudioStudioBaseUrl(value: string): URL {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("AUDIO_STUDIO_BASE_URL_CREDENTIALS_OR_QUERY_FORBIDDEN");
  }
  const loopback = new Set(["127.0.0.1", "localhost", "::1"]);
  if (url.protocol === "http:" && !loopback.has(url.hostname)) {
    throw new Error("AUDIO_STUDIO_HTTP_REQUIRES_LOOPBACK");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("AUDIO_STUDIO_BASE_URL_PROTOCOL_UNSUPPORTED");
  }
  if (url.pathname !== "/" && url.pathname !== "") {
    throw new Error("AUDIO_STUDIO_BASE_URL_PATH_UNSUPPORTED");
  }
  url.pathname = "/";
  return url;
}

export function resolveAudioStudioUrl(
  baseUrl: URL,
  value: string,
  code: string,
): URL {
  const resolved = new URL(value, baseUrl);
  if (
    resolved.origin !== baseUrl.origin
    || resolved.username
    || resolved.password
    || resolved.protocol !== baseUrl.protocol
  ) {
    throw new Error(code);
  }
  return resolved;
}

export function audioStudioHeaders(
  credential: string,
  additional: HeadersInit = {},
): Headers {
  const trimmed = credential.trim();
  if (!trimmed) throw new Error("AUDIO_STUDIO_CREDENTIAL_MISSING");
  const headers = new Headers({ authorization: `Bearer ${trimmed}` });
  new Headers(additional).forEach((value, key) => headers.set(key, value));
  return headers;
}

export async function withAudioStudioDeadline<T>(
  timeoutMs: number,
  signal: AbortSignal | undefined,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("AUDIO_STUDIO_TIMEOUT_INVALID");
  }
  const controller = new AbortController();
  const abort = (): void => controller.abort(signal?.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(
    () => controller.abort(new Error("AUDIO_STUDIO_REQUEST_TIMEOUT")),
    timeoutMs,
  );
  try {
    return await operation(controller.signal);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

export async function parseAudioStudioEnvelope<T>(
  response: Response,
  code: string,
): Promise<T> {
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new Error(`${code}_JSON_INVALID`);
  }
  if (!isRecord(value) || typeof value.ok !== "boolean") {
    throw new Error(`${code}_ENVELOPE_INVALID`);
  }
  if (!response.ok || value.ok !== true) {
    const publicError = typeof value.error === "string"
      ? value.error.slice(0, 500)
      : "request rejected";
    throw new Error(`${code}:${publicError}`);
  }
  if (!("result" in value)) throw new Error(`${code}_RESULT_MISSING`);
  return value.result as T;
}

export function audioStudioSleep(
  delayMs: number,
  signal: AbortSignal | undefined,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("AUDIO_STUDIO_REQUEST_ABORTED"));
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const abort = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(signal?.reason ?? new Error("AUDIO_STUDIO_REQUEST_ABORTED"));
    };
    timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, delayMs);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

export async function fetchAudioStudio(
  fetcher: AudioStudioFetch,
  url: URL,
  init: RequestInit,
  timeoutMs: number,
  signal: AbortSignal | undefined,
): Promise<Response> {
  return withAudioStudioDeadline(timeoutMs, signal, (deadlineSignal) =>
    fetcher(url, {
      ...init,
      redirect: "error",
      signal: deadlineSignal,
    })
  );
}
