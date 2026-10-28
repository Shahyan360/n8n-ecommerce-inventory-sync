-- Trace one order using a parameter in your database client:
-- SELECT * FROM workflow_audit_logs WHERE order_id=$1 ORDER BY id;
SELECT store_id,external_id,state,currency,revision,updated_at FROM orders ORDER BY created_at;
SELECT p.sku,b.warehouse_id,b.on_hand,b.reserved,b.safety_stock,b.incoming,
       GREATEST(0,b.on_hand-b.reserved-b.safety_stock) AS available_to_promise
FROM inventory_balances b JOIN products p ON p.id=b.product_id ORDER BY p.sku,b.warehouse_id;
SELECT id,store_id,status,attempts,next_attempt_at FROM integration_events WHERE status NOT IN ('done','ignored') ORDER BY created_at;
SELECT order_id,warehouse_id,currency,amount,service,estimated_days,address_validation FROM shipping_quotes WHERE selected;
SELECT * FROM reorder_alerts WHERE status IN ('open','ordered');
SELECT id,category,status,attempts,next_attempt_at FROM notification_outbox WHERE status<>'sent';
