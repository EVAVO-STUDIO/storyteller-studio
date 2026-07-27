import type { CalibrationStatus } from "@evavo/storyteller-engine/calibration-workflow";
import {
  CalibrationStoreConflictError,
  storedCalibrationSessionPublicView,
  type FileCalibrationSessionStore,
} from "@evavo/storyteller-engine/calibration-store";

export interface CalibrationRouteResult {
  status: number;
  body: Readonly<Record<string, unknown>>;
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const CALIBRATION_STATUSES: ReadonlySet<CalibrationStatus> = new Set([
  "draft",
  "collecting",
  "review",
  "approved",
  "rejected",
]);

function decodeCalibrationId(value: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    throw new Error("CALIBRATION_SESSION_ID_ENCODING_INVALID");
  }
  if (!SAFE_IDENTIFIER.test(decoded)) {
    throw new Error("CALIBRATION_SESSION_ID_INVALID");
  }
  return decoded;
}

function optionalIdentifier(url: URL, key: string, code: string): string | undefined {
  const value = url.searchParams.get(key)?.trim();
  if (!value) return undefined;
  if (!SAFE_IDENTIFIER.test(value)) throw new Error(code);
  return value;
}

function statusFilter(
  url: URL,
): CalibrationStatus | readonly CalibrationStatus[] | undefined {
  const values = url.searchParams
    .getAll("status")
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
  if (values.length === 0) return undefined;
  const unique = [...new Set(values)];
  if (unique.some((value) => !CALIBRATION_STATUSES.has(value as CalibrationStatus))) {
    throw new Error("CALIBRATION_STATUS_FILTER_INVALID");
  }
  return unique.length === 1
    ? unique[0] as CalibrationStatus
    : unique as CalibrationStatus[];
}

function limitFilter(url: URL): number {
  const value = url.searchParams.get("limit");
  if (!value) return 100;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 200) {
    throw new Error("CALIBRATION_LIMIT_INVALID");
  }
  return parsed;
}

function calibrationIdRoute(pathname: string): string | null {
  const match = pathname.match(/^\/v1\/calibrations\/([^/]+)$/u);
  return match?.[1] ? decodeCalibrationId(match[1]) : null;
}

export async function handleCalibrationReadRoute(input: Readonly<{
  method: string | undefined;
  url: URL;
  store: FileCalibrationSessionStore | null;
  requestId: string;
}>): Promise<CalibrationRouteResult | null> {
  if (!input.url.pathname.startsWith("/v1/calibrations")) return null;

  if (input.method !== "GET") {
    return {
      status: 405,
      body: {
        error: {
          code: "CALIBRATION_MUTATION_API_NOT_EXPOSED",
          requestId: input.requestId,
        },
        mutationApiExposed: false,
        privateEvidenceApiExposed: false,
      },
    };
  }

  if (!input.store) throw new Error("CALIBRATION_STORE_NOT_CONFIGURED");

  if (input.url.pathname === "/v1/calibrations") {
    const projectId = optionalIdentifier(
      input.url,
      "projectId",
      "CALIBRATION_PROJECT_FILTER_INVALID",
    );
    const seriesId = optionalIdentifier(
      input.url,
      "seriesId",
      "CALIBRATION_SERIES_FILTER_INVALID",
    );
    const status = statusFilter(input.url);
    const limit = limitFilter(input.url);
    const rows = await input.store.listPublic({
      ...(projectId ? { projectId } : {}),
      ...(seriesId ? { seriesId } : {}),
      ...(status ? { status } : {}),
    });
    return {
      status: 200,
      body: {
        data: rows.slice(0, limit),
        meta: {
          total: rows.length,
          returned: Math.min(rows.length, limit),
          truncated: rows.length > limit,
        },
        mutationApiExposed: false,
        privateEvidenceApiExposed: false,
        requestId: input.requestId,
      },
    };
  }

  const sessionId = calibrationIdRoute(input.url.pathname);
  if (!sessionId) {
    return {
      status: 404,
      body: {
        error: {
          code: "API_ROUTE_NOT_FOUND",
          requestId: input.requestId,
        },
      },
    };
  }

  try {
    const envelope = await input.store.require(sessionId);
    return {
      status: 200,
      body: {
        data: storedCalibrationSessionPublicView(envelope),
        mutationApiExposed: false,
        privateEvidenceApiExposed: false,
        requestId: input.requestId,
      },
    };
  } catch (error) {
    if (
      error instanceof CalibrationStoreConflictError
      && error.message === "CALIBRATION_STORE_SESSION_NOT_FOUND"
    ) {
      return {
        status: 404,
        body: {
          error: {
            code: "CALIBRATION_SESSION_NOT_FOUND",
            requestId: input.requestId,
          },
        },
      };
    }
    throw error;
  }
}
