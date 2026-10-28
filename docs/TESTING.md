# Testing

Install dependencies with `npm ci`, run `npm run setup`, start the dedicated PostgreSQL instance, then `npm run migrate`, `npm run seed` and `npm run test:db:prepare`.

```powershell
npm run build
npm run verify:static
npm test
```

The suite uses real PostgreSQL, real mock-provider HTTP and Fastify webhook injection. **It truncates only the dedicated `commerce_test` database**, configured by TEST_DATABASE_URL / TEST_MIGRATION_DATABASE_URL, and refuses to reset a different database name. Its provider HTTP server uses loopback port 3302, separate from the running demo. Never use production credentials for tests. Test files run serially to isolate fixture resets. The unit suite verifies raw-byte HMACs for both providers, normalization, variants, decimal validation, reorder math, configurable packing and rate eligibility. Integration tests exercise duplicate/out-of-order events, multi-store IDs, SKU aliases, warehouse splits, payment updates, digital goods, 20 simultaneous final-unit contenders, duplicate concurrent reservations, all-or-nothing rollback, partial allocation, missing balances, cancellation, provider fulfillment, failed shipping/retry, wrong currency, HTTP timeouts, Slack retry, reorder deduplication, durable dispatch retry, reconciliation, reservation expiry and database reconnection.

The E2E test file covers signed gateway acceptance, replay deduplication and the application lifecycle. It does not impersonate n8n. Separate runtime verification sends actual signed HTTP deliveries through running gateway → n8n → sub-workflows → TypeScript → PostgreSQL → mock Shippo/Slack:

```powershell
docker compose --profile mock up -d --build
npm run verify:runtime
```

The verifier creates uniquely named fixtures, waits up to 90 seconds, asserts READY_FOR_FULFILLMENT, quotes, reservations and alerts, sends a duplicate, cancels an order, and checks the resulting release. It saves a redacted report in `reports/runtime.json`. CLI execution of the local demo plus scheduled/error branch checks are recorded separately in the deployment report. `reports/tests.json` is Vitest's machine-readable evidence; `reports/verification.json` records achieved and blocked deployment checks.

Without Docker, `scripts/native-postgres.mjs` creates `.runtime/pgdata` on loopback port 55432 using PostgreSQL tools on PATH or the optional PG_BIN directory. It neither reuses nor restarts other installed database services. `scripts/native-stack.mjs start` starts isolated local n8n and project services after n8n is installed under `.runtime/n8n`. Native verification does not prove Linux container builds, Redis queue-mode delivery or Compose health.

The native recovery drill `node --import tsx scripts/verify-n8n-operations.ts` uses the private local owner session, manually starts the actual reconciliation and daily summary workflows, injects three failed Shippo attempts, checks the real Error Trigger and durable retry, then cancels the recovered test order. `scripts/verify-db-restart.mjs` verifies committed data across a real restart of this isolated PostgreSQL instance.
