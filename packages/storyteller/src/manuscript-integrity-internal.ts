import { createHash } from "node:crypto";
import type { ManuscriptIntegrityFinding } from "./manuscript-integrity-types.js";

export const HASH_PATTERN = /^[a-f0-9]{64}$/u;
export const SAFE_SOURCE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
export const DEFAULT_TARGET_CHUNK_BYTES = 256 * 1024;
export const MIN_TARGET_CHUNK_BYTES = 64;
export const MAX_TARGET_CHUNK_BYTES = 8 * 1024 * 1024;
export const DEFAULT_MAX_DETAILED_FINDINGS = 40;
export const MAX_MAX_DETAILED_FINDINGS = 200;
export const CHAIN_SEED = "storyteller-manuscript-integrity-chain-v1";

function canonicalise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalise);
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      output[key] = canonicalise((value as Record<string, unknown>)[key]);
    }
    return output;
  }
  return value;
}

export function stableHash(value: unknown): string {
  const source = typeof value === "string"
    ? value
    : JSON.stringify(canonicalise(value));
  return createHash("sha256").update(source, "utf8").digest("hex");
}

export function hashUtf8(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function requireSource(source: string): void {
  if (typeof source !== "string" || source.trim().length === 0) {
    throw new Error("MANUSCRIPT_INTEGRITY_SOURCE_EMPTY");
  }
}

export function requireSafeInteger(
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

export function requireHash(value: string, code: string): void {
  if (!HASH_PATTERN.test(value)) throw new Error(code);
}

export function canonicalLocale(value: string | undefined): string {
  const requested = value?.trim() || "und";
  try {
    return Intl.getCanonicalLocales(requested)[0] ?? "und";
  } catch {
    throw new Error("MANUSCRIPT_SEGMENT_LOCALE_INVALID");
  }
}

export function boundedFindingCollector(maximum: number): Readonly<{
  findings: ManuscriptIntegrityFinding[];
  add: (finding: ManuscriptIntegrityFinding) => void;
  omitted: () => number;
}> {
  const findings: ManuscriptIntegrityFinding[] = [];
  let omittedCount = 0;
  return {
    findings,
    add(finding) {
      if (findings.length < maximum) findings.push(Object.freeze({ ...finding }));
      else omittedCount += 1;
    },
    omitted() {
      return omittedCount;
    },
  };
}
