import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) {
    problems.push(`missing publication-operations-compose file: ${path}`);
  }
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(`${path} is missing publication-operations-compose token: ${token}`);
    }
  }
}

function serviceBlock(source, serviceName, nextServiceName) {
  const startToken = `\n  ${serviceName}:\n`;
  const start = source.indexOf(startToken);
  if (start < 0) return "";
  const end = nextServiceName
    ? source.indexOf(`\n  ${nextServiceName}:\n`, start + startToken.length)
    : source.indexOf("\nvolumes:\n", start + startToken.length);
  return source.slice(start, end < 0 ? source.length : end);
}

for (const path of [
  "Dockerfile.publication-operations",
  "compose.publication-operations.yml",
  ".dockerignore",
  ".gitignore",
  ".env.publication-operations.example",
  "package.json",
  "docs/PUBLICATION_OPERATIONS_DOCKER.md",
  "docs/PUBLICATION_OPERATIONS_MAINTENANCE_PROFILE.md",
]) requireFile(path);

requireTokens("Dockerfile.publication-operations", [
  "FROM node:24.18.0-bookworm-slim",
  "ARG STORYTELLER_APPLICATION_REVISION",
  "STORYTELLER_APPLICATION_REVISION_INVALID",
  'LABEL org.opencontainers.image.revision="${STORYTELLER_APPLICATION_REVISION}"',
  "STORYTELLER_APPLICATION_REVISION=${STORYTELLER_APPLICATION_REVISION}",
  "npm ci --no-audit --no-fund",
  "npm run typecheck",
  "npm run build",
  "mkdir -p /var/lib/storyteller",
  "chown -R node:node",
  "ENV NODE_ENV=production",
  "STORYTELLER_DATA_DIR=/var/lib/storyteller",
  "USER node",
  'CMD ["npm", "run", "start", "--workspace=@evavo/storyteller-worker"]',
]);

if (existsSync(fromRoot("Dockerfile.publication-operations"))) {
  const dockerfile = read("Dockerfile.publication-operations");
  const pinnedRuntime = existsSync(fromRoot(".nvmrc"))
    ? read(".nvmrc").trim()
    : "";
  if (!pinnedRuntime || !dockerfile.includes(`FROM node:${pinnedRuntime}-bookworm-slim`)) {
    problems.push("publication operations image runtime must exactly match .nvmrc");
  }
  for (const forbidden of ["EXPOSE ", "USER root", "npm install "]) {
    if (dockerfile.includes(forbidden)) {
      problems.push(`Dockerfile.publication-operations contains unsafe token: ${forbidden}`);
    }
  }
}

requireTokens("compose.publication-operations.yml", [
  "name: storyteller-publication-operations",
  "Dockerfile.publication-operations",
  "STORYTELLER_PUBLICATION_OPERATIONS_ENV_FILE",
  "STORYTELLER_APPLICATION_REVISION:?set STORYTELLER_APPLICATION_REVISION",
  "read_only: true",
  "user: node",
  "cap_drop:",
  "- ALL",
  "no-new-privileges:true",
  "publication-data:/var/lib/storyteller",
  "tmpfs:",
  "stop_grace_period: 45s",
  "publication-evidence-gateway:",
  "publication-operations-preflight:",
  "publication-refresh:",
  "publication-alerts:",
  "publication-backup:",
  "publication-backup-verify:",
  "publication-backup-retention-plan:",
  "publication-backup-prune:",
  "publication-restore:",
  "network_mode: service:publication-evidence-gateway",
  "condition: service_healthy",
  "condition: service_completed_successfully",
  "STORYTELLER_WORKER_ROLE: publication-evidence-gateway",
  "STORYTELLER_WORKER_ROLE: publication-operations-preflight",
  "STORYTELLER_WORKER_ROLE: publication-refresh",
  "STORYTELLER_WORKER_ROLE: publication-alerts",
  "STORYTELLER_PUBLICATION_EVIDENCE_GATEWAY_BIND_HOST: 127.0.0.1",
  "http://127.0.0.1:${STORYTELLER_PUBLICATION_EVIDENCE_GATEWAY_PORT:-8789}/v1/publication-evidence",
  "STORYTELLER_FILE_PUBLICATION_ALERT_SINGLE_HOST: \"true\"",
  "STORYTELLER_FILE_PUBLICATION_REFRESH_SINGLE_HOST: \"true\"",
  "STORYTELLER_FILE_PUBLICATION_EVIDENCE_GATEWAY_SINGLE_HOST: \"true\"",
  "STORYTELLER_PUBLICATION_DATA_VOLUME",
  "STORYTELLER_PUBLICATION_BACKUP_VOLUME",
  "STORYTELLER_PUBLICATION_MAINTENANCE_RECEIPT_VOLUME",
  "publication-backups:",
  "publication-maintenance-receipts:",
]);

if (existsSync(fromRoot("compose.publication-operations.yml"))) {
  const compose = read("compose.publication-operations.yml");
  const networkNamespaceCount = (
    compose.match(/network_mode: service:publication-evidence-gateway/gu) ?? []
  ).length;
  if (networkNamespaceCount !== 2) {
    problems.push(
      `compose.publication-operations.yml must share the gateway network namespace exactly twice, found ${networkNamespaceCount}`,
    );
  }
  for (const forbidden of [
    "\n    ports:",
    "\n  ports:",
    "network_mode: host",
    "privileged: true",
    "cap_add:",
    "/var/run/docker.sock",
  ]) {
    if (compose.includes(forbidden)) {
      problems.push(`compose.publication-operations.yml exposes unsafe topology: ${forbidden.trim()}`);
    }
  }

  const maintenance = [
    ["publication-backup", "publication-backup-verify"],
    ["publication-backup-verify", "publication-backup-retention-plan"],
    ["publication-backup-retention-plan", "publication-backup-prune"],
    ["publication-backup-prune", "publication-restore"],
    ["publication-restore", null],
  ];
  for (const [serviceName, nextServiceName] of maintenance) {
    const block = serviceBlock(compose, serviceName, nextServiceName);
    if (!block) {
      problems.push(`maintenance service is missing: ${serviceName}`);
      continue;
    }
    for (const token of [
      "profiles:",
      "- maintenance",
      'restart: "no"',
      "network_mode: none",
    ]) {
      if (!block.includes(token)) {
        problems.push(`${serviceName} is missing maintenance isolation token: ${token}`);
      }
    }
    if (block.includes("depends_on:")) {
      problems.push(`${serviceName} must not start or depend on mutation services`);
    }
  }

  const backup = serviceBlock(
    compose,
    "publication-backup",
    "publication-backup-verify",
  );
  for (const token of [
    "publication-data:/var/lib/storyteller:ro",
    "publication-backups:/var/backups/storyteller",
    "publication-operations-backup",
    "--offline-confirmed",
    "STORYTELLER_PUBLICATION_MAINTENANCE_ACTOR_ID",
  ]) {
    if (!backup.includes(token)) {
      problems.push(`publication-backup is missing token: ${token}`);
    }
  }

  const verify = serviceBlock(
    compose,
    "publication-backup-verify",
    "publication-backup-retention-plan",
  );
  for (const token of [
    "publication-backups:/var/backups/storyteller:ro",
    "publication-operations-backup-verify",
    "STORYTELLER_PUBLICATION_BACKUP_SNAPSHOT_ID",
  ]) {
    if (!verify.includes(token)) {
      problems.push(`publication-backup-verify is missing token: ${token}`);
    }
  }
  if (verify.includes("publication-data:/var/lib/storyteller")) {
    problems.push("publication-backup-verify must not mount live publication data");
  }

  const retentionPlan = serviceBlock(
    compose,
    "publication-backup-retention-plan",
    "publication-backup-prune",
  );
  for (const token of [
    "publication-backups:/var/backups/storyteller:ro",
    "publication-maintenance-receipts:/var/lib/storyteller-maintenance",
    "publication-operations-backup-retention-plan",
    "STORYTELLER_PUBLICATION_RETENTION_EVALUATED_AT",
    "--application-revision",
    "STORYTELLER_APPLICATION_REVISION",
    "STORYTELLER_PUBLICATION_RETENTION_KEEP_LATEST",
    "STORYTELLER_PUBLICATION_RETENTION_KEEP_DAILY_DAYS",
    "STORYTELLER_PUBLICATION_RETENTION_KEEP_WEEKLY_WEEKS",
    "STORYTELLER_PUBLICATION_RETENTION_PLAN_FILE",
  ]) {
    if (!retentionPlan.includes(token)) {
      problems.push(`publication-backup-retention-plan is missing token: ${token}`);
    }
  }
  for (const forbidden of [
    "publication-data:/var/lib/storyteller",
    "STORYTELLER_PUBLICATION_RETENTION_PLAN_FINGERPRINT",
    "--offline-confirmed",
    "STORYTELLER_PUBLICATION_MAINTENANCE_ACTOR_ID",
  ]) {
    if (retentionPlan.includes(forbidden)) {
      problems.push(`publication-backup-retention-plan has forbidden mutation token: ${forbidden}`);
    }
  }

  const prune = serviceBlock(
    compose,
    "publication-backup-prune",
    "publication-restore",
  );
  for (const token of [
    "publication-backups:/var/backups/storyteller",
    "publication-maintenance-receipts:/var/lib/storyteller-maintenance",
    "publication-operations-backup-prune",
    "STORYTELLER_PUBLICATION_RETENTION_EVALUATED_AT",
    "--application-revision",
    "STORYTELLER_APPLICATION_REVISION",
    "STORYTELLER_PUBLICATION_RETENTION_KEEP_LATEST",
    "STORYTELLER_PUBLICATION_RETENTION_KEEP_DAILY_DAYS",
    "STORYTELLER_PUBLICATION_RETENTION_KEEP_WEEKLY_WEEKS",
    "STORYTELLER_PUBLICATION_RETENTION_PLAN_FINGERPRINT",
    "STORYTELLER_PUBLICATION_MAINTENANCE_ACTOR_ID",
    "STORYTELLER_PUBLICATION_RETENTION_RECEIPT_FILE",
    "--offline-confirmed",
  ]) {
    if (!prune.includes(token)) {
      problems.push(`publication-backup-prune is missing token: ${token}`);
    }
  }
  if (
    prune.includes("publication-backups:/var/backups/storyteller:ro")
    || prune.includes("publication-data:/var/lib/storyteller")
  ) {
    problems.push("publication-backup-prune must have backup write access and no live data mount");
  }

  const restore = serviceBlock(compose, "publication-restore", null);
  for (const token of [
    "publication-data:/var/lib/storyteller",
    "publication-backups:/var/backups/storyteller:ro",
    "publication-operations-restore",
    "--offline-confirmed",
    "STORYTELLER_PUBLICATION_MAINTENANCE_ACTOR_ID",
    "STORYTELLER_PUBLICATION_BACKUP_SNAPSHOT_ID",
  ]) {
    if (!restore.includes(token)) {
      problems.push(`publication-restore is missing token: ${token}`);
    }
  }
}

requireTokens(".dockerignore", [
  ".git",
  "node_modules",
  "storage",
  ".env.*",
  "!.env.example",
  "!.env.publication-operations.example",
]);

requireTokens(".gitignore", [
  ".env.*",
  "!.env.example",
  "!.env.publication-operations.example",
]);

requireTokens(".env.publication-operations.example", [
  "STORYTELLER_PUBLICATION_DATA_VOLUME=storyteller-publication-data",
  "STORYTELLER_PUBLICATION_BACKUP_VOLUME=storyteller-publication-backups",
  "STORYTELLER_PUBLICATION_MAINTENANCE_RECEIPT_VOLUME=storyteller-publication-maintenance-receipts",
  "STORYTELLER_PUBLICATION_MAINTENANCE_ACTOR_ID=",
  "STORYTELLER_PUBLICATION_BACKUP_SNAPSHOT_ID=",
  "STORYTELLER_PUBLICATION_RETENTION_EVALUATED_AT=",
  "STORYTELLER_PUBLICATION_RETENTION_KEEP_LATEST=",
  "STORYTELLER_PUBLICATION_RETENTION_KEEP_DAILY_DAYS=",
  "STORYTELLER_PUBLICATION_RETENTION_KEEP_WEEKLY_WEEKS=",
  "STORYTELLER_PUBLICATION_RETENTION_PLAN_FINGERPRINT=",
  "STORYTELLER_PUBLICATION_RETENTION_PLAN_FILE=",
  "STORYTELLER_PUBLICATION_RETENTION_RECEIPT_FILE=",
  "STORYTELLER_APPLICATION_REVISION=replace-with-40-character-git-commit-sha",
  "STORYTELLER_PUBLICATION_ALERT_WORKER_ID=",
  "STORYTELLER_PUBLICATION_REFRESH_WORKER_ID=",
  "STORYTELLER_PUBLICATION_EVIDENCE_GATEWAY_ID=",
  "STORYTELLER_PUBLICATION_REFRESH_RECIPIENT_REFERENCE_HASH=",
  "STORYTELLER_PUBLICATION_ALERT_RECIPIENT_BINDINGS=",
  "STORYTELLER_PUBLICATION_REFRESH_VERIFICATION_TOKEN_ENV=PUBLICATION_EVIDENCE_GATEWAY_TOKEN",
  "STORYTELLER_PUBLICATION_EVIDENCE_GATEWAY_TOKEN_ENV=PUBLICATION_EVIDENCE_GATEWAY_TOKEN",
  "PUBLICATION_EVIDENCE_GATEWAY_TOKEN=replace-with-a-long-random-private-token",
  "STORYTELLER_PUBLICATION_ALERT_EMAIL_TOKEN_ENV=PUBLICATION_ALERT_EMAIL_TOKEN",
  "PUBLICATION_ALERT_EMAIL_TOKEN=replace-with-private-email-gateway-token",
  "PUBLICATION_ALERT_RECIPIENT_EMAIL=operations@example.invalid",
]);

requireTokens("docs/PUBLICATION_OPERATIONS_DOCKER.md", [
  "Included roles",
  "Image revision binding",
  "org.opencontainers.image.revision",
  "Private evidence route",
  "Shared state",
  "Container hardening",
  "Environment setup",
  "Validate resolved Compose configuration",
  "Startup ordering is fail closed",
  "Backup",
  "Upgrade",
  "Rollback",
  "Secret handling",
  "Health boundary",
  "Current boundary",
  "No Compose `ports` entry publishes the gateway to the host",
  "does not provide multi-host locking",
]);

requireTokens("docs/PUBLICATION_OPERATIONS_MAINTENANCE_PROFILE.md", [
  "Services",
  "Named volumes",
  "Required maintenance inputs",
  "Stop mutation roles",
  "Create an offline backup",
  "Verify the snapshot",
  "Plan backup retention",
  "Apply backup retention",
  "Isolated restore rehearsal",
  "Production restore by volume cutover",
  "Rollback",
  "Off-host and encrypted backup",
  "No network boundary",
  "No automatic service control",
  "Current boundary",
  "publication-maintenance-receipts",
  "network_mode: none",
  "Retention is never invoked automatically",
]);

if (existsSync(fromRoot("package.json"))) {
  const packageJson = JSON.parse(read("package.json"));
  if (
    packageJson.scripts?.["verify:publication-operations-compose"]
      !== "node scripts/check-publication-operations-compose.mjs"
  ) {
    problems.push("root package does not expose verify:publication-operations-compose");
  }
  if (
    !packageJson.scripts?.["verify:runtime"]?.includes(
      "npm run verify:publication-operations-compose",
    )
  ) {
    problems.push("worker runtime verification omits publication operations Compose topology");
  }
}

const dockerVersion = spawnSync(
  "docker",
  ["compose", "version"],
  { cwd: root, encoding: "utf8" },
);
if (dockerVersion.status === 0) {
  const composeConfig = spawnSync(
    "docker",
    [
      "compose",
      "--profile",
      "maintenance",
      "--env-file",
      ".env.publication-operations.example",
      "-f",
      "compose.publication-operations.yml",
      "config",
      "--quiet",
    ],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        STORYTELLER_PUBLICATION_OPERATIONS_ENV_FILE:
          ".env.publication-operations.example",
      },
    },
  );
  if (composeConfig.status !== 0) {
    problems.push(
      `docker compose config failed: ${(composeConfig.stderr || composeConfig.stdout || "unknown error").trim()}`,
    );
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio publication-operations-compose check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_publication_operations_compose_check_passed");
console.log("- one immutable worker image runs four long-lived or startup publication roles");
console.log("- image runtime matches .nvmrc and build provenance is bound to one exact source revision");
console.log("- five offline maintenance services are profile-gated and networkless");
console.log("- retention planning mounts backups read-only and writes a separate private plan receipt");
console.log("- retention apply alone receives backup write access and requires the reviewed plan fingerprint");
console.log("- verification mounts no live state and restore requires a selected data volume");
console.log("- gateway and refresh share a loopback-only network namespace with no published port");
console.log("- startup preflight blocks mutation roles when deployment contracts fail");
console.log("- containers run unprivileged with read-only roots and dropped capabilities");
console.log("- Docker Compose syntax including maintenance profiles is checked when available");
