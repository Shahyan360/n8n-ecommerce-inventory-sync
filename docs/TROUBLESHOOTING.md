# Troubleshooting

Docker not found: install/enable Docker on an authorized host. Do not treat YAML validation or native execution as a successful container deployment. Native fallback is available for development verification with PG_BIN and a locally installed n8n runtime.

Migrations fail: inspect `docker compose logs migrate postgres`. Check database credentials and ownership. Schema changes belong to commerce_owner, not commerce_app. Never grant application superuser to fix migrations.

Webhook 401: verify the exact raw bytes, configured store ID, provider domain/source and secret. JSON whitespace changes invalidate HMAC. Internal n8n webhooks require the imported header credential. Provider headers are not substitutes for the raw-body signature.

Inbox remains pending: inspect gateway, n8n and worker logs. Verify workflows are published/enabled, internal credential exists, sub-workflow IDs match and environment URLs resolve. Dispatcher retries with a lease and stops after ten attempts; errors and notification rows remain durable. After fixing the root cause, authenticated POST `/internal/retry` with `{ "eventId": "UUID" }` requeues a dead event.

Order quarantined: inspect its protected integration_events row and integration_errors. Missing stock SKUs, unsafe identifiers, invalid money/dates and equal-timestamp contradictory line edits do not overwrite good order data. Correct the source and submit a new signed delivery; preserve the original record.

No quote: verify address fields, catalog weight/dimensions, same-country origin, rate currency, estimated transit and allowed real service tokens. Quote failures keep reservations until retry/expiry. Do not manually mark these orders fulfilled.

No Slack message: check notification_outbox status, attempts and next_attempt_at. Reorder alerts deduplicate while unresolved. HTTP 429 and network failures remain queued; a five-minute reorder/reconciliation schedule flushes batches. After ten failures a notification is dead and requires operator escalation/requeue after correcting credentials.

Stock discrepancy: review inventory_movements and reservation statuses. Do not overwrite reserved with a source count. Injected mock mismatches are deliberately manual review. Live snapshot updates must be newer and support all outstanding reserved units plus safety stock. Every accepted observation advances the source watermark, even when counts are unchanged. Local confirmed reservations expire by policy; paid does not mean indefinitely held. Partially fulfilled provider orders are an exception: stock remains blocked pending line-level inventory review, and cancellation cannot automatically restock unknown shipped units.

Native n8n setup: this project keeps its runtime and user folder under `.runtime`, independent of any global n8n installation. Set DB_POSTGRESDB_PASSWORD from private .env through the helper; avoid printing credentials in commands. CLI imports/publishing require n8n to be stopped before edits. Re-run the bootstrap after changing exports.
