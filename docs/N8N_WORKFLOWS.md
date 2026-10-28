# n8n workflows

Pinned runtime: n8n 2.45.4 (npm stable tag checked 2026-10-28). Exports use bundled core nodes only. IDs are stable so sub-workflows can resolve after bulk import.

| Export | Runtime ID | Entry |
| --- | --- | --- |
| shopify-ingestion | commerceShopify | Authenticated gateway webhook |
| woocommerce-ingestion | commerceWoo | Authenticated gateway webhook |
| normalization-validation | commerceNormalize | Execute Sub-workflow Trigger |
| order-processing | commerceProcess | Shared orchestration |
| inventory-allocation | commerceAllocate | Atomic PostgreSQL allocation |
| shipping-rates | commerceShipping | Rate calculation only |
| reorder-monitoring | commerceReorder | Sub-workflow and five-minute schedule |
| cancellation-release | commerceCancel | Cancellation/fulfillment accounting |
| reconciliation | commerceReconcile | Five-minute schedule |
| slack-notifications | commerceSlack | Durable outbox flush |
| error-handler | commerceErrors | Error Trigger |
| local-demo | commerceDemo | Manual trigger with Code-node acceptance summary |
| daily-summary | commerceSummary | 08:00 Asia/Karachi |

Provider webhooks first enter the gateway, not n8n. Raw-byte HMAC validation happens before any parsing there. Internal n8n webhook paths `/webhook/commerce-shopify` and `/webhook/commerce-woocommerce` accept only the private header credential. Their response mode is last node, allowing the dispatcher to verify the event completed. HTTP nodes forward only the durable event/order reference. Secrets and customer addresses do not enter workflow exports.

Compose starts the import job before the n8n main/worker. It imports the encrypted header credential, all JSON exports and enables workflows. On versions with workflow publishing, the bootstrap publishes trigger workflows as well. To import again after editing, stop main/worker first and run:

```powershell
docker compose stop gateway n8n n8n-worker
docker compose run --rm n8n-import
docker compose --profile mock up -d
```

Manual editor import is supported, but preserve IDs or update every Execute Workflow reference, create `Commerce Internal` HTTP Header Auth (`x-internal-token`), and map every credential reference. Set inventory/mock service URLs in the n8n process environment. The private internal token is imported only to the credential store, not referenced through expressions.

Open the local editor at http://localhost:5678 and create its local owner account. Run **Local End-to-End Demo Trigger**. It sends signed provider webhooks through the gateway; asynchronous ingestion produces durable results in PostgreSQL. The Code node explicitly describes acceptance, not completion. `npm run verify:runtime` waits for terminal event states and verifies actual results.

All business workflows use the shared Error Trigger workflow. Dead events remain in PostgreSQL for investigation; `/internal/retry` requeues only dead events after the operator fixes the cause. Quarantined payloads need correction at the source, preserving the original audit. Sub-workflow IDs and connections can be checked by `npm run verify:static`; runtime node recognition requires n8n import and execution.
