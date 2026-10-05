-- Convert the formerly displayed local options into actual Cell Ponto records.
-- Never overwrite negotiated terms or copy them to unrelated stores.
INSERT INTO price_tables(id,store_id,name,percent,active)
SELECT 'TAB-' || md5(s.id || ':' || defaults.key),s.id,defaults.name,defaults.percent,true
FROM stores s CROSS JOIN (VALUES ('vista','À vista',0),('atacado','Atacado',-8),('cartao','Cartão',5)) AS defaults(key,name,percent)
WHERE s.id='STR-PRT-MUM5YWBG8DSR'
 AND NOT EXISTS(SELECT 1 FROM price_tables p WHERE p.store_id=s.id
   AND (lower(p.name)=lower(defaults.name) OR (defaults.key='vista' AND lower(p.name) IN ('vista','a vista'))))
ON CONFLICT(id) DO NOTHING;
