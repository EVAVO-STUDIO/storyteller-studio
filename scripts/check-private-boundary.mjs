import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const root = process.cwd();
const problems = [];

function fromRoot(path) {
  return resolve(root, path);
}

function read(path) {
  return readFileSync(fromRoot(path), "utf8");
}

function requireToken(path, token) {
  if (!existsSync(fromRoot(path))) {
    problems.push(`missing private-boundary file: ${path}`);
    return;
  }
  const source = read(path);
  if (!source.includes(token)) problems.push(`${path} is missing private-boundary token: ${token}`);
}

function collectTextFiles(directory, result = []) {
  const absolute = fromRoot(directory);
  if (!existsSync(absolute)) return result;
  for (const name of readdirSync(absolute)) {
    const path = join(absolute, name);
    const relative = path.slice(root.length + 1).replaceAll("\\", "/");
    const stats = statSync(path);
    if (stats.isDirectory()) collectTextFiles(relative, result);
    else if (/\.(?:ts|tsx|js|mjs|json|md|css)$/u.test(name)) result.push(relative);
  }
  return result;
}

for (const [path, tokens] of Object.entries({
  "apps/web/src/app/layout.tsx": [
    "index: false",
    "follow: false",
    "nocache: true",
    "noarchive: true",
    "noimageindex: true",
    "nosnippet: true",
    'referrer: "no-referrer"',
  ],
  "apps/web/src/app/robots.ts": [
    'userAgent: "*"',
    'disallow: "/"',
  ],
  "apps/web/next.config.ts": [
    "frame-ancestors 'none'",
    'key: "X-Frame-Options"',
    'value: "DENY"',
    'key: "Referrer-Policy"',
    'value: "no-referrer"',
    'key: "X-Robots-Tag"',
    "noindex, nofollow, noarchive, nosnippet, noimageindex",
  ],
  "apps/api/src/server.ts": [
    "environment.STORYTELLER_API_TOKEN",
    "environment.NODE_ENV === \"production\"",
    "configuredActorId",
    "timingSafeEqual",
    'STORYTELLER_API_HOST ?? "127.0.0.1"',
    '"Cache-Control", "no-store, max-age=0"',
    '"X-Frame-Options", "DENY"',
    "API_REQUEST_BODY_TOO_LARGE",
    "workerApiExposed: false",
  ],
  "apps/api/src/queue-runtime.ts": [
    "STORYTELLER_FILE_QUEUE_SINGLE_HOST",
    "GENERATION_QUEUE_FILE_DRIVER_SINGLE_HOST_ACK_REQUIRED",
    "workerApiExposed: false",
  ],
  ".env.example": [
    "STORYTELLER_API_ACTOR_ID=local_operator",
    "STORYTELLER_QUEUE_DRIVER=disabled",
    "STORYTELLER_FILE_QUEUE_SINGLE_HOST=false",
    "STORYTELLER_HUB_LAUNCH_SECRET=",
    "STORYTELLER_SESSION_SIGNING_SECRET=",
  ],
})) {
  for (const token of tokens) requireToken(path, token);
}

const envSource = existsSync(fromRoot(".env.example")) ? read(".env.example") : "";
if (!envSource.includes("STORYTELLER_HUB_LAUNCH_SECRET=") || !envSource.includes("STORYTELLER_SESSION_SIGNING_SECRET=")) {
  problems.push("launch and session signing variables must both be declared");
}
if (/NEXT_PUBLIC_[A-Z0-9_]*(?:SECRET|TOKEN|KEY)/u.test(envSource)) {
  problems.push("secret, token or key material must never use a NEXT_PUBLIC_ variable");
}

const webFiles = collectTextFiles("apps/web");
for (const path of webFiles) {
  const source = read(path);
  for (const forbidden of [
    "OPENAI_API_KEY",
    "ELEVENLABS_API_KEY",
    "AZURE_SPEECH_KEY",
    "AWS_SECRET_ACCESS_KEY",
    "STORYTELLER_HUB_LAUNCH_SECRET",
    "STORYTELLER_SESSION_SIGNING_SECRET",
    "STORYTELLER_API_TOKEN",
    "STORYTELLER_FILE_QUEUE_SINGLE_HOST",
    "document.cookie",
    "localStorage",
    "sessionStorage",
  ]) {
    if (source.includes(forbidden)) problems.push(`${path} exposes or references forbidden browser-side material: ${forbidden}`);
  }
}

const apiSource = existsSync(fromRoot("apps/api/src/server.ts")) ? read("apps/api/src/server.ts") : "";
for (const forbidden of [
  "console.log(request",
  "console.info(request",
  "console.log(body",
  "console.info(body",
  "console.log(payload",
  "console.info(payload",
  "request.headers.authorization }",
  "claimNext(",
  "leaseToken",
  "heartbeat(",
]) {
  if (apiSource.includes(forbidden)) problems.push(`API source contains a sensitive logging or worker-control pattern: ${forbidden}`);
}

const queueRuntimeSource = existsSync(fromRoot("apps/api/src/queue-runtime.ts"))
  ? read("apps/api/src/queue-runtime.ts")
  : "";
for (const forbidden of ["tokenHash", "leaseToken", "workerId:"]) {
  if (queueRuntimeSource.includes(forbidden)) {
    problems.push(`public queue runtime contains a worker-secret field or identifier: ${forbidden}`);
  }
}

const cardPath = "apps/web/public/hub/storyteller-studio.card.json";
if (existsSync(fromRoot(cardPath))) {
  const card = JSON.parse(read(cardPath));
  const forbiddenKeys = new Set([
    "token",
    "secret",
    "apiKey",
    "accessToken",
    "refreshToken",
    "password",
    "credential",
    "credentials",
    "cookie",
    "session",
    "manuscriptText",
    "voiceSample",
    "providerSettings",
    "executionControls",
  ]);

  function scan(value, path = "hubCard") {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => scan(item, `${path}[${index}]`));
      return;
    }
    for (const [key, nested] of Object.entries(value)) {
      if (forbiddenKeys.has(key)) problems.push(`hub metadata contains forbidden key: ${path}.${key}`);
      scan(nested, `${path}.${key}`);
    }
  }

  scan(card);
  if (card.defaultVisible !== false) problems.push("hub card must remain hidden by default");
  if (card.clientRelease !== false) problems.push("hub card must not claim client release");
  if (card.launchHref !== null) problems.push("hub card must not claim a launch route before signed launch is implemented");
}

if (problems.length > 0) {
  console.error("Storyteller Studio private-boundary check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_private_boundary_check_passed");
console.log("- the studio is noindex at metadata, robots and response-header layers");
console.log("- browser source contains no provider, queue or launch credentials");
console.log("- API defaults to loopback, production authentication and bounded request bodies");
console.log("- file queue production use requires an explicit single-host acknowledgement");
console.log("- public operator surfaces expose no worker lease controls or secret material");
console.log("- hub metadata remains hidden, non-launching and free of private production content");
