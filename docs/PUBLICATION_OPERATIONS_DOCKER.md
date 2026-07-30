# One-host Docker deployment for publication operations

This topology runs the private Storyteller publication operations roles on one Docker host with one named local volume.

It is intended for controlled one-host production or operator-managed staging. It is not a horizontally scaled deployment.

## Included roles

`compose.publication-operations.yml` starts:

1. `publication-evidence-gateway`;
2. `publication-operations-preflight` as a one-shot startup gate;
3. `publication-refresh` after successful preflight;
4. `publication-alerts` after successful preflight.

Each role uses the existing Storyteller worker entry point and a distinct `STORYTELLER_WORKER_ROLE`.

## Image

`Dockerfile.publication-operations` uses Node.js 22.18, installs the locked workspace dependencies, runs strict TypeScript and workspace builds, then runs the worker as the unprivileged `node` user.

The image contains source and `tsx` because the repository's production worker entry point currently executes TypeScript directly.

The image does not publish a port or include an HTTP proxy.

## Private evidence route

The evidence gateway binds only to `127.0.0.1` inside its container network namespace.

The refresh container uses:

```text
network_mode: service:publication-evidence-gateway
```

This gives refresh the same network namespace as the gateway. Its configured endpoint is therefore:

```text
http://127.0.0.1:8789/v1/publication-evidence
```

No Compose `ports` entry publishes the gateway to the host.

The preflight container shares the same gateway network namespace so it validates the exact direct-loopback topology used by refresh.

## Shared state

Every role mounts the named local volume:

```text
storyteller-publication-data
```

at:

```text
/var/lib/storyteller
```

The publication stores resolve beneath:

```text
/var/lib/storyteller/publication-operations
```

The volume is shared only among processes on one Docker host. File locks and revision checks remain single-host controls.

## Container hardening

The common service profile uses:

- the unprivileged `node` user;
- a read-only root filesystem;
- a bounded `/tmp` tmpfs;
- all Linux capabilities dropped;
- `no-new-privileges`;
- Docker init for signal forwarding;
- bounded JSON-file logs;
- a 45-second stop grace period.

The named data volume is the only writable persistent filesystem.

## Environment setup

Create the private environment file:

```bash
cp .env.publication-operations.example .env.publication-operations
chmod 600 .env.publication-operations
```

Replace every placeholder, especially:

- evidence-gateway bearer token;
- email-gateway bearer token;
- incident recipient email;
- sender email;
- email gateway endpoint;
- route reference hash;
- distinct alert, refresh and gateway identities.

Do not commit `.env.publication-operations`.

The checked-in template is intentionally non-secret and uses invalid example addresses.

## Validate resolved Compose configuration

Use the private environment file for Compose interpolation:

```bash
docker compose \
  --env-file .env.publication-operations \
  -f compose.publication-operations.yml \
  config
```

Review the resolved output in a secure terminal. It may contain injected secret values, so do not redirect it to logs or commit it.

## Build

```bash
docker compose \
  --env-file .env.publication-operations \
  -f compose.publication-operations.yml \
  build --pull
```

The build runs repository type-checking and workspace builds inside the image.

## Start

```bash
docker compose \
  --env-file .env.publication-operations \
  -f compose.publication-operations.yml \
  up -d
```

Startup ordering is fail closed:

1. evidence gateway starts;
2. the gateway health check verifies structurally readable publication state and a listening private TCP socket;
3. preflight runs once;
4. preflight validates shared state, token pairing, route mapping, endpoint alignment, identities and deadlines;
5. refresh and alert delivery start only after preflight exits successfully.

A failed readiness scan or preflight leaves refresh and alert delivery stopped.

## Application-level readiness

The evidence-gateway health check runs:

```bash
npm run publication-operations-readiness -- \
  --data-dir /var/lib/storyteller \
  --readiness-only
```

before opening a loopback TCP connection to the gateway.

The readiness diagnostic:

- reopens every publication monitor, evidence-inbox item and alert through the existing integrity-checked store;
- runs the existing domain assertion for every payload;
- verifies envelope and payload revision scope;
- reads every dated audit JSONL partition;
- rejects malformed entity and audit data;
- rejects symbolic links and special filesystem entries;
- rejects stale atomic temporary files;
- emits no path, identity, evidence, recipient, provider or audit details.

A current publication problem is represented as aggregate operational `attention`. It does not fail infrastructure readiness or create a container restart loop. Structural corruption and unsafe filesystem state do fail readiness.

The readiness check does not contact the retailer, email gateway or evidence provider. External availability remains governed by the publication monitor and alert lifecycle.

## Status and logs

```bash
docker compose \
  --env-file .env.publication-operations \
  -f compose.publication-operations.yml \
  ps
```

```bash
docker compose \
  --env-file .env.publication-operations \
  -f compose.publication-operations.yml \
  logs --tail 200 publication-operations-preflight
```

```bash
docker compose \
  --env-file .env.publication-operations \
  -f compose.publication-operations.yml \
  logs -f publication-evidence-gateway publication-refresh publication-alerts
```

Runtime summaries are redacted by application contracts, but host-level Docker metadata and the private environment file remain sensitive.

## Restart

```bash
docker compose \
  --env-file .env.publication-operations \
  -f compose.publication-operations.yml \
  restart publication-evidence-gateway publication-refresh publication-alerts
```

For configuration changes, recreate the stack so readiness and preflight run again:

```bash
docker compose \
  --env-file .env.publication-operations \
  -f compose.publication-operations.yml \
  up -d --force-recreate
```

## Stop

```bash
docker compose \
  --env-file .env.publication-operations \
  -f compose.publication-operations.yml \
  down
```

This retains the named data volume.

Do not use `down --volumes` unless permanent deletion is explicitly intended and a verified backup exists.

## Backup

Stop mutation roles before creating a filesystem-level backup:

```bash
docker compose \
  --env-file .env.publication-operations \
  -f compose.publication-operations.yml \
  stop publication-refresh publication-alerts publication-evidence-gateway
```

Create a host backup from the named volume using the governed maintenance profile or trusted host volume tooling. Preserve file ownership and permissions.

Restart with `up -d`; application readiness and startup preflight run again.

A backup is not verified until it has been restored into an isolated environment and the repository's integrity checks can read every envelope and audit partition.

Run the complete diagnostic after an isolated restore rehearsal and before selecting the restored volume for cutover:

```bash
npm run publication-operations-readiness -- \
  --data-dir ./storage
```

A successful result proves structural readability for the current application revision. It does not prove that the snapshot belongs to the intended business environment, that external providers are reachable, or that an older application revision remains schema-compatible.

## Upgrade

1. back up the named volume;
2. fetch the exact reviewed repository revision;
3. rebuild with `build --pull`;
4. run `docker compose config` securely;
5. recreate the stack;
6. confirm application readiness and preflight succeed;
7. inspect service logs and monitor refresh/alert counts.

Do not run different application revisions concurrently against the same file-backed volume.

## Rollback

Rollback requires both:

- the previous verified image revision; and
- a data backup compatible with that revision.

Application rollback without considering durable schema changes can produce unreadable or semantically invalid state.

The current store is append/revision oriented, but compatibility must still be verified before downgrade.

## Secret handling

The example topology injects secrets through container environment variables because the current application resolvers consume environment values.

For production, source those values from the host's secret manager or deployment platform. Avoid storing real secrets in shell history, Compose files, CI logs or version control.

Changing the evidence-gateway token requires coordinated refresh and gateway recreation. Run preflight before allowing refresh to resume.

## Health boundary

The gateway health check proves two local facts:

- the publication state is structurally readable by the current application revision; and
- the private gateway listener accepts a loopback connection.

It does not prove:

- bearer authentication succeeds for a particular client request;
- current evidence exists;
- monitor scope is current at a later instant;
- email delivery works;
- retailer evidence is current;
- publication remains live;
- external providers are reachable.

Application preflight validates configuration compatibility, not external provider connectivity. Publication incidents remain governed operational state rather than infrastructure failure.

## Current boundary

This topology provides one reproducible, private, fail-closed deployment for the publication operations loop on a single Docker host.

It does not provide multi-host locking, shared transactional storage, automatic off-host backups, managed TLS, public ingress, retailer scraping, human verification, email-provider guarantees or perpetual publication availability.
