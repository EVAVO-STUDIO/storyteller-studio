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

for (const path of [
  "Dockerfile.publication-operations",
  "compose.publication-operations.yml",
  ".dockerignore",
  ".gitignore",
  ".env.publication-operations.example",
  "package.json",
  "docs/PUBLICATION_OPERATIONS_DOCKER.md",
]) requireFile(path);

requireTokens("Dockerfile.publication-operations", [
  "FROM node:22.18.0-bookworm-slim",
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
  "name: storyteller-publication-data",
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
console.log("- one immutable worker image runs four explicit publication roles");
console.log("- gateway and refresh share a loopback-only network namespace with no published port");
console.log("- startup preflight blocks mutation roles when deployment contracts fail");
console.log("- one named local volume and file locks preserve the single-host boundary");
console.log("- containers run unprivileged with read-only roots and dropped capabilities");
console.log("- docker compose syntax is checked automatically when Docker Compose is available");
