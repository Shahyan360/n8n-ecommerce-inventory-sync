# Database schema and administration

Migrations are versioned SQL under `database/migrations`. `schema_migrations` is updated in the same transaction as DDL under an advisory lock. The migration owner controls DDL. The application role has DML and sequence access only; n8n uses a separate database and role.

| Tables | Purpose |
| --- | --- |
| stores | Platform identity, domain, partial/backorder policy and reconciliation watermark |
| integration_events | Durable inbox, source event ID/hash, normalized record, attempts, lease, quarantine/dead state |
| orders / order_items | Canonical order and line history for the current revision |
| products / sku_aliases | Canonical variants, physical parcel attributes and per-store aliases |
| warehouses / inventory_balances | Destination eligibility, origin addresses, on-hand, reserved, safety and incoming quantities |
| inventory_reservations | Revision-scoped allocations, expiry and terminal disposition |
| inventory_movements | Append-only stock/reservation accounting |
| reorder_rules / reorder_alerts | Supplier policy, outstanding requests and deduplicated recommendations |
| shipping_quotes | Eligible rates, selected service and validation status per warehouse/revision |
| fulfillment_events | Validated lifecycle transitions |
| workflow_audit_logs / integration_errors | Operational audit trail and failure history |
| notification_outbox | Durable Slack delivery and retries |

All relationships use foreign keys. Unique keys protect source event IDs, store order IDs, aliases, reservation allocation tuples, rates, selected quotes and active reorder alerts. Quantity and money constraints reject negative stock/counters. `reserved <= on_hand` is enforced at the database boundary. Incoming and safety stock are distinct from physical availability. Money uses NUMERIC(20,6) and remains decimal text in normalized orders; no cross-currency total is computed.

Run from the project directory after `npm run setup`:

```powershell
npm run migrate
npm run seed
# Revert the most recent migration ONLY in an expendable/stopped environment:
npm run migrate:down
```

Container equivalents: `docker compose run --rm migrate` and `docker compose run --rm seed`. Seed is idempotent. It only configures stores in LIVE_MODE; demo products/stock are inserted only in MOCK_MODE. Down migration removes project business tables and must never be used against a live database without a restore plan.

Create/restore a custom-format backup with the included scripts:

```powershell
New-Item -ItemType Directory backups -Force
docker compose exec -T postgres pg_dump -U commerce_owner -d commerce -Fc -f /tmp/commerce.dump
docker compose cp postgres:/tmp/commerce.dump backups/commerce.dump
# Stop business services before restoring into the dedicated project database.
docker compose stop gateway inventory n8n n8n-worker
docker compose cp backups/commerce.dump postgres:/tmp/commerce.dump
docker compose exec -T postgres pg_restore -U commerce_owner -d commerce --clean --if-exists /tmp/commerce.dump
docker compose up -d inventory n8n n8n-worker gateway
```

Back up the `n8n` database separately with the same method (`-d n8n`) and keep the encryption key securely with the backup. Test restoration on a separate volume before production. Do not copy a running PostgreSQL data directory as a logical backup. `scripts/backup.ps1` automates the copy safely without binary shell redirection.

Native verification with `node scripts/verify-backup.mjs` creates a custom-format dump, restores it into a newly created isolated database, compares order/reservation/quote and reserved-stock counts, then removes only that temporary database. Evidence is saved in `reports/backup-restore.json`; the private dump remains under ignored `.runtime`.

Useful inspection queries are in `database/queries/operations.sql`. To resolve an outstanding replenishment, update `reorder_rules.outstanding`, then mark its alert `ordered`; recording a receipt changes on_hand/incoming and resolving a completed alert enables a future shortage notification. These are explicit operator actions, never supplier purchases.
