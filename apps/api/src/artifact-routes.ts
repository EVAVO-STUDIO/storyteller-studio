import { artifactPublicView, type ArtifactKind, type ArtifactReviewStatus, type ArtifactVerificationStatus } from "@evavo/storyteller-engine/artifact-registry";
import { ArtifactStoreConflictError, type FileArtifactRegistry } from "@evavo/storyteller-engine/artifact-store";

export interface ArtifactRouteResult {
  status: number;
  body: Readonly<Record<string, unknown>>;
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const ARTIFACT_KINDS: ReadonlySet<ArtifactKind> = new Set([
  "audio-candidate",
  "transcript",
  "word-alignment",
  "waveform",
  "audio-analysis",
  "illustration-layer",
  "visual-render",
  "chapter-master",
  "release-package",
]);
const VERIFICATION_STATUSES: ReadonlySet<ArtifactVerificationStatus> = new Set([
  "pending",
  "verified",
  "quarantined",
  "rejected",
]);
const REVIEW_STATUSES: ReadonlySet<ArtifactReviewStatus> = new Set([
  "not-required",
  "pending",
  "approved",
  "changes-requested",
]);

function decodeArtifactId(value: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    throw new Error("ARTIFACT_ID_ENCODING_INVALID");
  }
  if (!SAFE_IDENTIFIER.test(decoded)) throw new Error("ARTIFACT_ID_INVALID");
  return decoded;
}

function optionalIdentifier(url: URL, key: string, code: string): string | undefined {
  const value = url.searchParams.get(key)?.trim();
  if (!value) return undefined;
  if (!SAFE_IDENTIFIER.test(value)) throw new Error(code);
  return value;
}

function optionalEnum<T extends string>(
  url: URL,
  key: string,
  allowed: ReadonlySet<T>,
  code: string,
): T | readonly T[] | undefined {
  const values = url.searchParams
    .getAll(key)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
  if (values.length === 0) return undefined;
  const unique = [...new Set(values)];
  if (unique.some((value) => !allowed.has(value as T))) throw new Error(code);
  return unique.length === 1 ? unique[0] as T : unique as T[];
}

function releasedFilter(url: URL): boolean | undefined {
  const value = url.searchParams.get("released")?.trim().toLocaleLowerCase("en-AU");
  if (!value) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error("ARTIFACT_RELEASE_FILTER_INVALID");
}

function limitFilter(url: URL): number {
  const value = url.searchParams.get("limit");
  if (!value) return 100;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 200) {
    throw new Error("ARTIFACT_LIMIT_INVALID");
  }
  return parsed;
}

function artifactIdRoute(pathname: string): string | null {
  const match = pathname.match(/^\/v1\/artifacts\/([^/]+)$/u);
  return match?.[1] ? decodeArtifactId(match[1]) : null;
}

export async function handleArtifactReadRoute(input: Readonly<{
  method: string | undefined;
  url: URL;
  registry: FileArtifactRegistry | null;
  requestId: string;
}>): Promise<ArtifactRouteResult | null> {
  if (!input.url.pathname.startsWith("/v1/artifacts")) return null;

  if (input.method !== "GET") {
    return {
      status: 405,
      body: {
        error: {
          code: "ARTIFACT_WRITE_API_NOT_EXPOSED",
          requestId: input.requestId,
        },
        workerWriteApiExposed: false,
        releaseApiExposed: false,
      },
    };
  }

  if (!input.registry) throw new Error("ARTIFACT_REGISTRY_NOT_CONFIGURED");

  if (input.url.pathname === "/v1/artifacts") {
    const projectId = optionalIdentifier(input.url, "projectId", "ARTIFACT_PROJECT_FILTER_INVALID");
    const jobId = optionalIdentifier(input.url, "jobId", "ARTIFACT_JOB_FILTER_INVALID");
    const kind = optionalEnum(input.url, "kind", ARTIFACT_KINDS, "ARTIFACT_KIND_FILTER_INVALID");
    const verificationStatus = optionalEnum(
      input.url,
      "verificationStatus",
      VERIFICATION_STATUSES,
      "ARTIFACT_VERIFICATION_FILTER_INVALID",
    );
    const reviewStatus = optionalEnum(
      input.url,
      "reviewStatus",
      REVIEW_STATUSES,
      "ARTIFACT_REVIEW_FILTER_INVALID",
    );
    const released = releasedFilter(input.url);
    const limit = limitFilter(input.url);
    const rows = await input.registry.publicViews({
      ...(projectId ? { projectId } : {}),
      ...(jobId ? { jobId } : {}),
      ...(kind ? { kind } : {}),
      ...(verificationStatus ? { verificationStatus } : {}),
      ...(reviewStatus ? { reviewStatus } : {}),
      ...(released !== undefined ? { released } : {}),
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
        workerWriteApiExposed: false,
        releaseApiExposed: false,
        requestId: input.requestId,
      },
    };
  }

  const artifactId = artifactIdRoute(input.url.pathname);
  if (!artifactId) {
    return {
      status: 404,
      body: { error: { code: "API_ROUTE_NOT_FOUND", requestId: input.requestId } },
    };
  }
  try {
    const envelope = await input.registry.require(artifactId);
    return {
      status: 200,
      body: {
        data: artifactPublicView(envelope.payload),
        workerWriteApiExposed: false,
        releaseApiExposed: false,
        requestId: input.requestId,
      },
    };
  } catch (error) {
    if (error instanceof ArtifactStoreConflictError && error.message === "ARTIFACT_STORE_RECORD_NOT_FOUND") {
      return {
        status: 404,
        body: { error: { code: "ARTIFACT_NOT_FOUND", requestId: input.requestId } },
      };
    }
    throw error;
  }
}
