# External API configuration

The default is MOCK_MODE. Generated `.env` contains random local-only secrets. Workflow exports contain credential references, not tokens. The import script creates an HTTP Header Auth credential encrypted by n8n with `N8N_ENCRYPTION_KEY`; it deletes its temporary plaintext file. Preserve that key when restarting or restoring n8n.

Documentation checked on 2026-10-28:

- [n8n queue mode](https://docs.n8n.io/hosting/scaling/queue-mode/) and [sub-workflow node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.executeworkflow/).
- [Shopify HMAC and delivery IDs](https://shopify.dev/docs/apps/build/webhooks/verify-deliveries) and [Admin GraphQL orders](https://shopify.dev/docs/api/admin-graphql/latest/queries/orders).
- [WooCommerce webhook headers](https://developer.woocommerce.com/docs/apis/rest-api/v3/webhooks/) and [REST v3](https://woocommerce.github.io/woocommerce-rest-api-docs/).
- [Shippo shipment creation](https://docs.goshippo.com/api-reference/shipments/create-a-new-shipment) and [authentication/versioning](https://docs.goshippo.com/api-reference/overview).
- [Slack chat.postMessage](https://docs.slack.dev/reference/methods/chat.postMessage/).

## Store credentials

Create private `config/stores.live.json` (ignored by Git) using the shape below. Supply real secrets locally; do not paste them into workflows or repository files.

```json
[
  {"id":"shop-us","platform":"shopify","domain":"YOUR-STORE.myshopify.com","secret":"APP_CLIENT_SECRET","token":"AUTHORIZED_ADMIN_TOKEN","allowPartial":false,"allowBackorder":true},
  {"id":"woo-us","platform":"woocommerce","domain":"https://YOUR-STORE","secret":"WEBHOOK_SECRET","consumerKey":"REST_CONSUMER_KEY","consumerSecret":"REST_CONSUMER_SECRET","allowPartial":true,"allowBackorder":true}
]
```

For containers mount this file read-only at `/app/config/stores.live.json` using a private Compose override. Webhook provider delivery URLs are `https://YOUR-GATEWAY/webhooks/shopify/STORE_ID` and `/webhooks/woocommerce/STORE_ID`. Terminate TLS at an authenticated, rate-limited reverse proxy. Only expose the gateway webhook paths; keep `/internal`, `/admin`, database and n8n editor private. Current Compose binds all development ports to loopback.

Shopify: subscribe to orders/create, orders/paid, orders/updated and orders/cancelled. Configure API version `2026-10` or a verified supported replacement. HMAC-SHA256 uses app client secret and raw bytes. Provide `X-Shopify-Event-Id` (or delivery webhook ID), topic and exact shop domain. Read reconciliation uses GraphQL and `X-Shopify-Access-Token`; request authorized order/customer-data scopes, including older order access if required. Metadata writes additionally require order write scope.

WooCommerce: configure order.created, order.updated, order.deleted with an explicit secret. Signature uses raw bytes; delivery ID deduplicates deliveries. Source must match the configured HTTPS domain. REST reads use HTTPS Basic authentication with consumer key/secret under `/wp-json/wc/v3/orders`. The unsigned initial Woo webhook registration ping is intentionally rejected; use the store's signed delivery test or explicitly arrange a narrow setup-only proxy ping handler. Do not weaken the production signature check.

## Shippo and packing

Live quotes POST `/shipments/` at `https://api.goshippo.com`, `Authorization: ShippoToken …`, `async:false`. `SHIPPO_API_VERSION` defaults to the stable dated contract `2018-02-08`; this is Shippo's dated request contract, unrelated to the Shopify quarterly version. Confirm it against your account before activation. Use a test token first. No `/transactions/` call is implemented.

Populate each product's weight_kg, length_cm, width_cm and height_cm. PACKING_POLICY selects `per_unit` (default: one physical unit per catalog-sized parcel) or `per_sku_stack` (one vertical stack per SKU, with multiplied weight and height). MAX_PARCELS defaults to 1,000; MAX_PARCEL_WEIGHT_KG to 25; MAX_PARCEL_SIDE_CM to 120. Stacks beyond those limits fail for manual repacking. Addresses are **not carrier-validated**: quotes persist `address_validation=not_requested`. Missing address fields, missing physical attributes and cross-border shipments require manual review. Live international customs forms and optimized box packing are not implemented. Eligible service tokens come from `ALLOWED_SERVICES`; match real Shippo carrier service tokens for your account. Only order-currency rates with known estimated_days at or below MAX_TRANSIT_DAYS are eligible. The cheapest eligible rate per warehouse is selected. Unknown estimates are excluded conservatively.

## Slack and inventory snapshot

Supply SLACK_TOKEN with chat:write and SLACK_CHANNEL; invite the bot to that channel. Payloads use Block Kit and fallback text. Mock captures are available at `/admin/captures` with the internal header credential.

The live read-only inventory snapshot connector requires an HTTPS endpoint and bearer token, returning:

```json
{"items":[{"sku":"CANONICAL-SKU","warehouseId":"warehouse-id","onHand":10,"incoming":3,"asOf":"2026-10-28T08:00:00Z"}]}
```

This endpoint is a snapshot bridge, not a reservation confirmation endpoint. PostgreSQL must remain the sole stock/reservation writer. Externally owned inventory requires implementing and validating its own atomic reservation/release adapter before production.

LIVE_MODE requires both MODE=LIVE_MODE and LIVE_ACTIVATED=true, valid store configuration, Shippo/Slack credentials and snapshot URL. ALLOW_METADATA_WRITES remains false until separately authorized. Live failures never return simulated data. Labels, customer charges and supplier orders remain unavailable.
