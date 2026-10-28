# Deployment

## Public Vercel demo

The root `vercel.json` builds only `web/dist` using `node web/build.mjs`. It installs no backend dependencies and requires no environment secrets. The output contains an explicit asset allowlist, curated documentation and 13 credential-reference-only workflow exports. Runtime files, backups, database records and `.env` are never copied.

The public demo simulates orders in browser memory and resets on refresh. It does not proxy to n8n or the operational backend. Content Security Policy limits network access to the same origin. It is suitable for public exploration, workflow downloads and documentation.

Vercel Functions, including container-image functions, are stateless autoscaled request runtimes. This Compose deployment needs persistent n8n workers, databases and Redis. Use a suitable Docker host for the full automation, or redesign its background work for a separately provisioned durable platform. Do not launch Compose in the Vercel build command.

## Full Docker automation

Requirements: Docker Engine with Compose v2 or newer, Node.js 24 LTS, at least 4 GB free memory and free loopback ports 3100, 3001, 3002, 5678 and 55432.

```sh
npm ci
npm run setup
docker compose --profile mock config --quiet
docker compose --profile mock up -d --build
npm run verify:stack
```

Compose initializes PostgreSQL roles/databases, migrations and mock fixtures, imports encrypted n8n credentials and workflows, then starts the main, worker, external task runners, services and gateway. The mock profile enables the provider simulator. Persistent volumes retain PostgreSQL, Redis AOF and n8n state. Open http://localhost:5678 and create the local n8n owner account.

Stop with `docker compose --profile mock stop`; resume with `docker compose --profile mock up -d`. Avoid `down -v` unless deliberately discarding local data. Stop any native stack first to free the host ports.

Images are digest-pinned. `node scripts/verify-images.mjs` checks upstream tags; review digest changes before updating. Re-importing replaces definitions by stable IDs, so preserve intentional editor changes first.

## Live activation

Complete the production checklist, mount private store configuration read-only, load validated inventory/warehouse records, and set MODE=LIVE_MODE and LIVE_ACTIVATED=true. Demo seeding configures only store records in live mode. Disable the mock profile. ALLOW_METADATA_WRITES stays false until separately authorized.

Configure TLS, secure cookies, editor authentication, network restrictions and monitored backups. Expose only gateway webhook routes; keep all internal/admin routes, databases and task brokers private. Auxiliary containers run unprivileged with read-only filesystems; runner sidecars use version-matched external mode.

## Native development fallback

Use PostgreSQL tools on PATH, or set PG_BIN in private `.env` to their directory. The helpers create only `.runtime/pgdata` on loopback port 55432 and do not manage installed system database services.

```sh
npm ci
npm run setup
node scripts/native-postgres.mjs
npm run migrate
npm run seed
npm install --prefix .runtime/n8n n8n@2.45.4 --legacy-peer-deps --no-fund
node scripts/n8n-bootstrap.mjs --native
npm run build
node scripts/native-stack.mjs start
node scripts/native-owner.mjs
npm run verify:runtime
```

The native process helper is intended for Windows development. Generated owner credentials stay in ignored `.runtime`; never publish or reuse them on an internet-facing instance. Native n8n uses regular mode and an internal JavaScript runner with mock data, so it does not prove Redis delivery or container isolation. An unused Python-runner warning does not affect JavaScript workflows.

Stop with `node scripts/native-stack.mjs stop` and stop only the dedicated database with `node scripts/native-postgres.mjs stop`.
