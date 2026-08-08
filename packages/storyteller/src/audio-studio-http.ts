import type { AudioStudioFetch } from "./audio-studio-types.js";

const MAX_CREDENTIAL_CHARACTERS = 4_096;
const MAX_RESPONSE_BYTES_ABSOLUTE = 2 * 1024 * 1024 * 1024;

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
  if (
    !trimmed
    || trimmed.length > MAX_CREDENTIAL_CHARACTERS
    || /\s|[\u0000-\u001f\u007f]/u.test(trimmed)
  ) {
    throw new Error("AUDIO_STUDIO_CREDENTIAL_INVALID");
  }
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
  const abort = (): void => controller.abort(
    signal?.reason ?? new Error("AUDIO_STUDIO_REQUEST_ABORTED"),
  );
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

function validateMaximumResponseBytes(maximumBytes: number, code: string): void {
  if (
    !Number.isSafeInteger(maximumBytes)
    || maximumBytes < 1
    || maximumBytes > MAX_RESPONSE_BYTES_ABSOLUTE
  ) {
    throw new Error(`${code}_LIMIT_INVALID`);
  }
}

export async function readAudioStudioResponseBytes(
  response: Response,
  maximumBytes: number,
  code: string,
): Promise<Uint8Array> {
  validateMaximumResponseBytes(maximumBytes, code);
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null) {
    const parsed = Number(declaredLength);
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
      throw new Error(`${code}_CONTENT_LENGTH_INVALID`);
    }
    if (parsed > maximumBytes) throw new Error(`${code}_TOO_LARGE`);
  }
  if (!response.body) throw new Error(`${code}_BODY_MISSING`);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) {
        throw new Error(`${code}_BODY_INVALID`);
      }
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        try {
          await reader.cancel(`${code}_TOO_LARGE`);
        } catch {
          // The size policy failure remains authoritative even if cancellation fails.
        }
        throw new Error(`${code}_TOO_LARGE`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function parseAudioStudioEnvelope<T>(
  response: Response,
  code: string,
  maximumBytes = 2 * 1024 * 1024,
): Promise<T> {
  const contentType = response.headers.get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLocaleLowerCase("en-AU");
  if (contentType && contentType !== "application/json") {
    throw new Error(`${code}_CONTENT_TYPE_INVALID`);
  }
  const bytes = await readAudioStudioResponseBytes(response, maximumBytes, code);
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
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
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal: deadlineSignal,
    })
  );
}
