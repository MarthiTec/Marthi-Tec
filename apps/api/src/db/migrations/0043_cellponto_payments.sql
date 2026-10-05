-- Persist the standard payment options previously available only in the browser.
INSERT INTO payment_methods(id,store_id,name,type,price_table_id,max_installments,active)
SELECT 'PAY-' || md5(s.id || ':' || defaults.type),s.id,defaults.name,
 (json_populate_record(NULL::payment_methods,json_build_object('type',defaults.type))).type,
 (SELECT id FROM price_tables p WHERE p.store_id=s.id AND p.active=true
  AND lower(p.name)=CASE WHEN defaults.type='credit' THEN 'cartão' ELSE 'à vista' END LIMIT 1),
 defaults.max_installments,true
FROM stores s CROSS JOIN (VALUES ('Dinheiro','cash',1),('Pix','pix',1),('Cartão de débito','debit',1),('Cartão de crédito','credit',18)) AS defaults(name,type,max_installments)
WHERE s.id='STR-PRT-MUM5YWBG8DSR'
 AND EXISTS(SELECT 1 FROM price_tables p WHERE p.store_id=s.id AND p.active=true AND lower(p.name)=CASE WHEN defaults.type='credit' THEN 'cartão' ELSE 'à vista' END)
 AND NOT EXISTS(SELECT 1 FROM payment_methods p WHERE p.store_id=s.id AND p.type::text=defaults.type)
ON CONFLICT(id) DO NOTHING;
