INSERT INTO products(sku,variant,weight_kg,length_cm,width_cm,height_cm,stocked) VALUES
('TSHIRT-BLUE-M','blue/M',0.25,25,18,3,true),('TSHIRT-BLUE-L','blue/L',0.28,26,19,3,true),('MUG-WHITE','white',0.45,12,12,14,true),('LAST-UNIT',null,0.1,10,10,5,true),('DIGITAL-GIFT',null,null,null,null,null,false) ON CONFLICT(sku) DO NOTHING;
INSERT INTO warehouses(id,name,priority,address,countries) VALUES
('east','New York',1,'{"name":"East Warehouse","street1":"350 5th Ave","city":"New York","state":"NY","zip":"10118","country":"US"}',ARRAY['US','CA']),
('west','San Francisco',2,'{"name":"West Warehouse","street1":"1 Market St","city":"San Francisco","state":"CA","zip":"94105","country":"US"}',ARRAY['US']) ON CONFLICT DO NOTHING;
INSERT INTO inventory_balances(product_id,warehouse_id,on_hand,safety_stock,incoming)
SELECT p.id,w.id,CASE WHEN p.sku='LAST-UNIT' THEN CASE WHEN w.id='east' THEN 1 ELSE 0 END WHEN p.sku='MUG-WHITE' THEN 3 WHEN w.id='east' THEN 8 ELSE 12 END,CASE WHEN p.sku='LAST-UNIT' THEN 0 ELSE 1 END,CASE WHEN p.sku='MUG-WHITE' THEN 2 ELSE 0 END FROM products p CROSS JOIN warehouses w WHERE stocked ON CONFLICT DO NOTHING;
INSERT INTO reorder_rules(product_id,warehouse_id,reorder_point,target_stock,supplier,lead_days,minimum_order,pack_multiple) SELECT product_id,warehouse_id,5,25,'Demo Supplier',7,6,6 FROM inventory_balances ON CONFLICT DO NOTHING;
INSERT INTO sku_aliases(store_id,alias,product_id) SELECT 'woo-us','WOO-BLUE-M',id FROM products WHERE sku='TSHIRT-BLUE-M' ON CONFLICT DO NOTHING;
