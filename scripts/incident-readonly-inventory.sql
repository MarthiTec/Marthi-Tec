-- Run in the authorized Discloud Studio. This script performs SELECTs only.
SELECT name,applied_at FROM _migrations ORDER BY id DESC LIMIT 12;
SELECT s.id,s.client_account_id,s.trade_name,s.segment,s.active,
 (SELECT count(*) FROM stock_items i WHERE i.store_id=s.id) stock_count,
 (SELECT count(*) FROM product_attributes a WHERE a.store_id=s.id) attribute_count,
 (SELECT count(*) FROM user_stores u WHERE u.store_id=s.id) membership_count,
 (SELECT count(*) FROM store_brands b WHERE b.store_id=s.id) brand_count,
 (SELECT count(*) FROM payment_methods p WHERE p.store_id=s.id) payment_count
FROM stores s ORDER BY s.created_at;
SELECT id,trade_name,document,status FROM client_accounts ORDER BY created_at;
SELECT u.id,u.email,u.client_account_id,u.active,us.store_id,us.is_default,s.client_account_id store_account
FROM users u LEFT JOIN user_stores us ON us.user_id=u.id LEFT JOIN stores s ON s.id=us.store_id ORDER BY u.email;
SELECT id,store_id,client_account_id,plan_id,status FROM store_licenses ORDER BY store_id;
SELECT id,store_id,name,sku,qty,price FROM stock_items WHERE id LIKE 'STK-CP-%' ORDER BY id;
SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname='marthi_guard_account_owner';
