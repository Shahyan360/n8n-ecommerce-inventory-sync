# Verification and release boundaries

This public record contains aggregate synthetic evidence. Personal paths, runtime credentials, execution logs, order records and database dumps are excluded. Local reports belong under ignored `reports` or `.runtime`.

## Observed local checks

- TypeScript compilation passed.
- 64 backend tests passed: 23 unit, 37 PostgreSQL integration/concurrency and 4 gateway/application E2E cases.
- All 13 workflows imported and published in n8n 2.45.4; bundled node types were recognized.
- Real signed deliveries passed through the gateway, n8n sub-workflows, PostgreSQL and local mock Shippo/Slack services.
- Duplicate suppression, cancellation release, reorder alerts, daily summaries and reconciliation passed.
- An injected carrier failure triggered the real error workflow and recovered on the second durable dispatch attempt.
- Committed business data survived an isolated PostgreSQL restart.
- A custom-format backup restored into an independent temporary database with matching business counts.
- Official Compose configuration validation and public image manifest checks passed.

The initial implementation host had no Docker Engine. Native checks did not establish container startup or Redis queue delivery. Public CI now builds and exercises the Docker queue stack on a Docker-enabled GitHub runner. The linked CI run is the source of truth for its exact commit; this record does not pre-claim a future green run.

## Public demo

The Vercel application is a separate browser simulator. Tests cover successful and unpaid orders, duplicate deliveries, last-unit contention, cancellation, partial allocation, shipping retry and invalid input. These supplement backend tests and do not establish database locking or live-provider behavior.

The public build uses an explicit file allowlist and no environment secrets. Release checks exclude runtime state and known local secret values. The demo cannot access merchant accounts, the operational database or n8n administrative endpoints.

## Live-operation gates

Complete the production checklist before handling real orders: authorized accounts/scopes, signatures, pagination, carrier services/currencies, inventory ownership, TLS, access controls, monitoring, backups and failure recovery.

The auxiliary dependency audit was clean when checked. The separate native n8n npm tree reported upstream advisories, including critical advisories. Review actual deployed images and upstream fixes; this repository does not certify those images as vulnerability-free.

Partial provider fulfillment blocks stock pending accounting review. Carrier address validation, cross-border customs and optimized box packing need deployment-specific policy. Externally owned inventory needs an authoritative reservation adapter.

Public source/demo release readiness and production merchant-automation readiness are separate. Publishing does not authorize labels, charges, supplier orders or live credentials.
