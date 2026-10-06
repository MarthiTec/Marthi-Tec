-- Authorized cleanup: only the 23 previously identified test product IDs.
-- Execute on the production database after reviewing this script. Other products are preserved.
BEGIN;
LOCK TABLE stock_items IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM stores s JOIN client_accounts a ON a.id=s.client_account_id WHERE s.id='STR-CELL-PONTO' AND a.id='PRT-MUM5YWBG8DSR' AND regexp_replace(a.document,'[^0-9]','','g')='38297104000182') THEN RAISE EXCEPTION 'Account identity mismatch'; END IF;
END $$;
CREATE TEMP TABLE reviewed_test_products ON COMMIT DROP AS
 SELECT * FROM stock_items WHERE store_id='STR-CELL-PONTO' AND id IN ('STK-960a59274324fcad','STK-24769d4e91ef9181','STK-f5b7785d6914772d','STK-3487895380247313','STK-b31dbe896e9896a9','STK-ad449c50f6f6ff69','STK-CP-ACS-PEL3D','STK-CP-IPH14','STK-CP-CON-IPH12','STK-CP-IPH16P','STK-CP-IPH11','STK-CP-ACS-CABO1M','STK-CP-REDMI13P','STK-CP-IPH15','STK-CP-TEL-IPH13','STK-CP-BAT-IPH13','STK-CP-IPH15PM','STK-CP-IPH16PM','STK-CP-IPH13','STK-CP-IPH12','STK-CP-ACS-FONT20W','STK-CP-TEL-IPH14P','STK-CP-ACS-CAPACLR');
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM stock_movements WHERE stock_item_id IN (SELECT id FROM reviewed_test_products))
 OR EXISTS(SELECT 1 FROM sales_order_lines WHERE COALESCE(stock_item_id,stock_id) IN (SELECT id FROM reviewed_test_products))
 OR EXISTS(SELECT 1 FROM stock_invoice_lines WHERE COALESCE(stock_item_id,stock_id) IN (SELECT id FROM reviewed_test_products))
 THEN RAISE EXCEPTION 'Test products have business history; abort cleanup'; END IF;
END $$;
-- Keep a recoverable database snapshot of the exact rows and their normalized variations.
INSERT INTO audit_logs(id,store_id,action,entity,entity_id,details)
 SELECT 'totem-test-products-20261006','STR-CELL-PONTO','catalog_cleanup','stock','reviewed-test-products',
 jsonb_build_object('products',(SELECT jsonb_agg(to_jsonb(p)) FROM reviewed_test_products p),
 'variations',(SELECT jsonb_agg(to_jsonb(v)) FROM stock_item_variations v WHERE v.store_id='STR-CELL-PONTO' AND v.stock_item_id IN (SELECT id FROM reviewed_test_products)))
 WHERE EXISTS(SELECT 1 FROM reviewed_test_products)
 ON CONFLICT(id) DO NOTHING;
DELETE FROM stock_item_variations WHERE store_id='STR-CELL-PONTO' AND stock_item_id IN (SELECT id FROM reviewed_test_products);
DELETE FROM stock_items WHERE store_id='STR-CELL-PONTO' AND id IN (SELECT id FROM reviewed_test_products);
COMMIT;
