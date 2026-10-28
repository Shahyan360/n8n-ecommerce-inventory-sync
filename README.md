# Commerce Sync

**E-commerce order, inventory and shipping automation with n8n, TypeScript and PostgreSQL.**

[![CI](https://github.com/Shahyan360/n8n-ecommerce-inventory-sync/actions/workflows/ci.yml/badge.svg)](https://github.com/Shahyan360/n8n-ecommerce-inventory-sync/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-6957b8)](LICENSE)
[![Node.js 24](https://img.shields.io/badge/node-24_LTS-43853d)](package.json)

Process authenticated Shopify and WooCommerce webhooks, reserve inventory across warehouses without overselling, retrieve Shippo shipping quotes, recommend replenishment and notify operations through Slack. The repository includes **13 connected n8n workflows**, local mock providers and an independent browser demo.

## Explore

- [Try the public demo →](https://n8n-ecommerce-inventory-sync.vercel.app)
- **Public demo:** the Vercel deployment serves a browser-only simulator, documentation and downloadable workflow JSON. All displayed orders, rates and alerts are illustrative. It has no merchant credentials or operational backend connection.
- **Full automation:** run the Docker stack below. This exercises real PostgreSQL transactions and actual n8n runtime paths with local mock Shopify/WooCommerce, Shippo and Slack services.
- **Live integrations:** configure authorized credentials only after completing the [production checklist](docs/PRODUCTION_CHECKLIST.md). Publishing the demo does not activate live operations.

## Quick start

Requirements: Node.js **24 LTS**, Docker Engine with Compose v2 or newer, and free loopback ports 3100, 3001, 3002, 5678 and 55432.

```sh
git clone https://github.com/Shahyan360/n8n-ecommerce-inventory-sync.git
cd n8n-ecommerce-inventory-sync
npm ci
npm run setup
docker compose --profile mock config --quiet
docker compose --profile mock up -d --build
npm run verify:runtime
```

Open **http://localhost:5678**, create your local n8n owner account and run **Local End-to-End Demo Trigger**, or run `npm run demo`. The setup generates unique secrets, creates restricted database roles, applies migrations, seeds inventory and imports/publishes every workflow. No real Shopify, WooCommerce, Shippo or Slack account is required in mock mode.

Gateway health: http://localhost:3100/health. Inventory health: http://localhost:3001/health. `/internal/report` requires the generated `x-internal-token`; keep this and all admin paths private.

```sh
# Stop without discarding data
docker compose --profile mock stop
# Resume
docker compose --profile mock up -d
```

## Test and verify

```sh
npm run test:db:prepare
npm run build
npm run verify:static
npm test
npm run build:web
npm run release:check
npm run verify:stack
```

`npm test` uses the separate **commerce_test** database and a mock HTTP server on port 3302; it refuses to reset any other database name. The suite covers 64 backend cases, including 20 competing orders for a final unit, plus browser simulator tests. The Docker CI job builds the application, imports workflows and checks actual queue-mode order processing. See [testing](docs/TESTING.md) and the [verification record](docs/DEPLOYMENT_READINESS.md) for observed checks and remaining live-operation gates.

To build or preview just the public demo, no database or credentials are needed:

```sh
npm run build:web
npm run preview:web
```

## What is included

- Raw-byte HMAC verification, durable ingestion, deduplication and lifecycle validation.
- Atomic multi-line/multi-warehouse reservations, SKU aliases, safety stock, partial allocation, release and expiry.
- Configurable parcel packing and persisted shipping quotes with currency, service and transit filtering. Quotes never mark an order shipped.
- Deterministic reorder recommendations, Slack Block Kit alerts, retry outboxes, scheduled reconciliation and daily summaries.
- Versioned migrations, fixtures, OpenAPI documentation and queue-mode Compose with external task runners.

## Project map

- `services/webhook-gateway`: signed ingestion and durable dispatch to n8n.
- `services/inventory-service`: lifecycle, inventory, shipping, reorder, notifications and reconciliation.
- `services/mock-providers`: synthetic external APIs, fault injection and captured mock messages.
- `workflows`: 13 importable core-node workflows with stable IDs.
- `database`: reversible migrations, demo inventory and operational queries.
- `tests`: unit, PostgreSQL integration/concurrency, gateway E2E and browser simulator tests.
- `web`: credential-free public demo and curated documentation bundle.
- `scripts`: setup, migrations, import, verification and backup tools.

## Documentation

[Architecture](docs/ARCHITECTURE.md) · [Database](docs/DATABASE_SCHEMA.md) · [API configuration](docs/API_CONFIGURATION.md) · [n8n workflows](docs/N8N_WORKFLOWS.md) · [Deployment](docs/DEPLOYMENT.md) · [Testing](docs/TESTING.md) · [Troubleshooting](docs/TROUBLESHOOTING.md) · [OpenAPI](docs/openapi.yaml) · [Security](SECURITY.md)

## Production boundaries

PostgreSQL owns reservations in this implementation. Externally owned stock requires an authoritative atomic reservation adapter before live fulfillment decisions. Partial provider fulfillment blocks stock pending review; cross-border customs and carrier address validation require additional policy. Live account permissions, image security, TLS, backups and recovery must be verified in your deployment.

No labels are purchased, customers charged or supplier orders issued automatically. Live API failures never fall back to simulated data. Native n8n dependencies and container images require their own security review; an auxiliary-service audit is not an image audit.

Authored code and workflows are [MIT licensed](LICENSE). Third-party components, including n8n, retain their own licenses; see [NOTICE](NOTICE).
