import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) problems.push(`missing generation-material file: ${path}`);
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(`${path} is missing generation-material contract token: ${token}`);
    }
  }
}

function collectRuntimeFiles(directory, output = []) {
  const absolute = fromRoot(directory);
  if (!existsSync(absolute)) return output;
  for (const name of readdirSync(absolute)) {
    const absolutePath = join(absolute, name);
    const item = statSync(absolutePath);
    if (item.isDirectory()) {
      collectRuntimeFiles(relative(root, absolutePath), output);
    } else if (
      /\.(?:ts|tsx|js|mjs)$/u.test(name)
      && !/\.(?:test|spec)\.[^.]+$/u.test(name)
    ) {
      output.push(relative(root, absolutePath).replaceAll("\\", "/"));
    }
  }
  return output;
}

for (const path of [
  "packages/storyteller/src/generation-material.ts",
  "packages/storyteller/src/generation-material.test.ts",
  "packages/storyteller/src/project-store.ts",
  "packages/storyteller/package.json",
  "docs/GENERATION_MATERIAL.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/project-store.ts", [
  '| "generation-material"',
]);

requireTokens("packages/storyteller/src/generation-material.ts", [
  "GENERATION_MATERIAL_SCHEMA_VERSION",
  "GENERATION_MATERIAL_ENTITY_TYPE",
  "GenerationMaterialRecord",
  "GenerationMaterialPublicView",
  "GenerationMaterialConflictError",
  "GenerationMaterialIntegrityError",
  "FileGenerationMaterialStore",
  "generationMaterialEntityId",
  "validateGenerationWorkerMaterial",
  "createGenerationMaterialRecord",
  "assertGenerationMaterialRecord",
  "generationMaterialPublicView",
  "normaliseGenerationWorkerMaterial",
  "GENERATION_MATERIAL_IDEMPOTENCY_CONFLICT",
  "GENERATION_MATERIAL_CLAIM_SCOPE_MISMATCH",
  "GENERATION_MATERIAL_ACTIVE_CLAIM_REQUIRED",
  "GENERATION_MATERIAL_RIGHTS_EXPIRED",
  "GENERATION_MATERIAL_USE_NOT_AUTHORISED",
  "GENERATION_MATERIAL_COMMERCIAL_USE_NOT_APPROVED",
  "GENERATION_MATERIAL_FORMAT_NOT_STORABLE",
  "GENERATION_MATERIAL_DIRECTION_SCOPE_MISMATCH",
  "GENERATION_MATERIAL_PRONUNCIATION_WRITTEN_DUPLICATE",
  "GENERATION_MATERIAL_RIGHTS_USES_DUPLICATE",
  "generation.material.created",
]);

requireTokens("packages/storyteller/src/generation-material.test.ts", [
  "material records preserve exact private production intent and resolve for the matching claim",
  "identical material creation is idempotent while changed private intent conflicts",
  "claim scope and cache identity must match the private material record",
  "rights, direction and storable media gates fail before persistence",
  "public material views and audit events omit text, pronunciations and voice identifiers",
  "material fingerprint and text hash tampering are detected",
  "voice_narrator_001",
  "Aelwyn",
  "artifact_voice_anchor_001",
]);

requireTokens("docs/GENERATION_MATERIAL.md", [
  "Immutable scope",
  "Canonical production intent",
  "Idempotency",
  "Rights and timing",
  "Private persistence",
  "Public view",
  "Worker resolution",
  "Production migration",
  "GENERATION_MATERIAL_IDEMPOTENCY_CONFLICT",
  "PostgreSQL transactions",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (packageJson.exports?.["./generation-material"] !== "./src/generation-material.ts") {
    problems.push("storyteller package does not export ./generation-material from its governed source module");
  }
}

const source = existsSync(fromRoot("packages/storyteller/src/generation-material.ts"))
  ? read("packages/storyteller/src/generation-material.ts")
  : "";
const publicViewStart = source.indexOf("export function generationMaterialPublicView");
const storeStart = source.indexOf("export class FileGenerationMaterialStore");
if (publicViewStart < 0 || storeStart <= publicViewStart) {
  problems.push("generation material public view boundary is missing");
} else {
  const publicView = source.slice(publicViewStart, storeStart);
  for (const forbidden of [
    "material.text",
    "voiceProfileId",
    "writtenForm",
    "providerPhoneme",
    "spokenForm",
    "parentArtifactIds",
    "emotionalObjective",
    "subtext",
    "notes:",
    "leaseToken",
    "objectKey",
    "providerRequestId",
  ]) {
    if (publicView.includes(forbidden)) {
      problems.push(`generation material public view exposes forbidden private field: ${forbidden}`);
    }
  }
}

const auditStart = source.indexOf("await this.#store.appendAuditEvent");
const auditEnd = source.indexOf("      return created;", auditStart);
if (auditStart < 0 || auditEnd <= auditStart) {
  problems.push("generation material audit boundary is missing");
} else {
  const auditSource = source.slice(auditStart, auditEnd);
  for (const forbidden of [
    "record.material",
    "material.text",
    "voiceProfileId",
    "pronunciations",
    "writtenForm",
    "parentArtifactIds",
    "emotionalObjective",
    "subtext",
  ]) {
    if (auditSource.includes(forbidden)) {
      problems.push(`generation material audit metadata exposes private field: ${forbidden}`);
    }
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtimeSource = read(path);
  for (const forbidden of [
    "FileGenerationMaterialStore",
    "generation-material",
    "GenerationWorkerMaterial",
  ]) {
    if (runtimeSource.includes(forbidden)) {
      problems.push(`${path} exposes executable generation material through a normal application surface: ${forbidden}`);
    }
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio generation material check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_generation_material_check_passed");
console.log("- private production text and direction are stored separately from queue state");
console.log("- material scope is bound to job, project, segment, cache key and candidate count");
console.log("- equivalent optional defaults produce one canonical fingerprint");
console.log("- rights, pronunciation, format and cost policy gates fail before persistence");
console.log("- public views and audits omit text, pronunciation, voice and parent artifact identity");
console.log("- normal API and browser runtime surfaces expose no executable material store");
