# Production activation checklist

Production readiness is not established by mock tests alone.

- Run `docker compose config`, image builds, health checks, imports and full queue-mode verification on a Docker host. Exercise a worker crash and Redis restart with pending inbox events.
- Verify pinned image availability/digests and current upstream security advisories; review n8n's own dependency advisories separately from the auxiliary service dependency audit.
- Obtain authorized Shopify and WooCommerce accounts/scopes and test signed create, paid, update and cancellation deliveries from real development stores. Check Woo registration ping handling without relaxing HMAC validation.
- Verify live GraphQL pagination, protected customer data permissions, quarterly API version and reconciliation history coverage.
- Establish exclusive PostgreSQL inventory ownership. If stock is externally owned, implement/validate its authoritative atomic reservation adapter before enabling fulfillment decisions.
- Load canonical SKU/variant aliases, warehouses, destination eligibility, safety stock, parcel attributes and accurate inventory. Validate physical inventory independently.
- Choose reservation expiry and backorder/partial policies with operations. Partial external fulfillment and post-fulfillment edits require manual review in this implementation. Partially fulfilled stock remains blocked, including after expiry or cancellation, until accounting is reviewed or matching full fulfillment is confirmed.
- Test Shippo test-token rates, supported service tokens, carrier accounts, currency and transit policy. Address validation is not requested; cross-border/customs and optimized packing require additional implementation.
- Verify Slack bot/channel permissions and rate limits, recovery from ambiguous delivery, notification escalation and dead outbox monitoring.
- Configure TLS, proxy size/rate/time limits, network boundaries, secure cookies, user management and credential rotation. Keep internal/admin paths private.
- Establish encrypted backups for both databases plus the n8n encryption key and test restore to a separate environment. Test real PostgreSQL/Redis/container restart recovery.
- Define customer-data retention and access controls for event payloads, error execution retention and backups. Consider an outbound proxy for credentialed API allowlists.
- Review dedupe retention and out-of-order/equal-timestamp semantics against provider behavior. Replay is neutralized while inbox/order history is retained; HMAC headers do not sign arbitrary delivery timestamps.
- Approve MODE=LIVE_MODE and LIVE_ACTIVATED=true explicitly. Keep ALLOW_METADATA_WRITES=false until production metadata writes are separately authorized.
- Labels, supplier purchase orders and customer charges are intentionally absent and require a later implementation and explicit authorization.
