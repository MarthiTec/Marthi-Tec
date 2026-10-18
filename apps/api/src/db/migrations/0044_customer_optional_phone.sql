-- [0040_device_catalog_api.sql]
CREATE TABLE device_catalog_providers(id TEXT PRIMARY KEY,name TEXT NOT NULL,adapter TEXT NOT NULL,base_url TEXT NOT NULL,docs_url TEXT NOT NULL,active BOOLEAN NOT NULL DEFAULT true);
INSERT INTO device_catalog_providers VALUES('devicespecs','DeviceSpecs / RapidAPI','devicespecs','https://deviceultraparser.p.rapidapi.com/api/values','https://ds.gtgroup.dev/docs',true);
CREATE TABLE device_catalog_brands(name TEXT PRIMARY KEY,aliases JSONB NOT NULL,strip_aliases JSONB NOT NULL);
INSERT INTO device_catalog_brands VALUES
 ('Samsung','["samsung","galaxy"]','["samsung"]'),('Xiaomi','["xiaomi","xiami","redmi","poco"]','["xiaomi","xiami"]'),('Motorola','["motorola","motoriola","moto"]','["motorola","motoriola"]'),
 ('Google','["google","pixel"]','["google"]'),('OnePlus','["oneplus"]','["oneplus"]'),('Oppo','["oppo"]','["oppo"]'),('Vivo','["vivo"]','["vivo"]'),('Realme','["realme"]','["realme"]'),('Huawei','["huawei"]','["huawei"]'),('Honor','["honor"]','["honor"]'),('Sony','["sony","xperia"]','["sony"]'),('Nokia','["nokia"]','["nokia"]'),('Asus','["asus","zenfone","rog"]','["asus"]'),('Nothing','["nothing"]','["nothing"]'),('Tecno','["tecno"]','["tecno"]'),('Infinix','["infinix"]','["infinix"]'),('Apple','["apple","iphone"]','["apple"]');
CREATE TABLE device_catalog_settings(store_id TEXT PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,provider_id TEXT NOT NULL REFERENCES device_catalog_providers(id),enabled BOOLEAN NOT NULL DEFAULT false,api_key_encrypted TEXT NOT NULL DEFAULT '',cache_days INTEGER NOT NULL DEFAULT 30 CHECK(cache_days BETWEEN 1 AND 365),updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE device_catalog_models(store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,provider_id TEXT NOT NULL REFERENCES device_catalog_providers(id),query_key TEXT NOT NULL,data JSONB NOT NULL,raw_data JSONB NOT NULL,refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(store_id,provider_id,query_key));

-- [0041_totem_request_idempotency.sql]
ALTER TABLE pos_tickets ADD COLUMN IF NOT EXISTS request_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS pos_tickets_store_request_key ON pos_tickets(store_id,request_key) WHERE request_key IS NOT NULL;

-- [0042_cellponto_price_tables.sql]
-- Convert the formerly displayed local options into actual Cell Ponto records.
-- Never overwrite negotiated terms or copy them to unrelated stores.
INSERT INTO price_tables(id,store_id,name,percent,active)
SELECT 'TAB-' || md5(s.id || ':' || defaults.key),s.id,defaults.name,defaults.percent,true
FROM stores s CROSS JOIN (VALUES ('vista','À vista',0),('atacado','Atacado',-8),('cartao','Cartão',5)) AS defaults(key,name,percent)
WHERE s.id='STR-PRT-MUM5YWBG8DSR'
 AND NOT EXISTS(SELECT 1 FROM price_tables p WHERE p.store_id=s.id
   AND (lower(p.name)=lower(defaults.name) OR (defaults.key='vista' AND lower(p.name) IN ('vista','a vista'))))
ON CONFLICT(id) DO NOTHING;

-- [0043_cellponto_payments.sql]
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

-- [0044_customer_optional_phone.sql]
-- Unknown phone numbers must not become a fabricated shared customer identifier.
ALTER TABLE customers ALTER COLUMN phone_digits DROP NOT NULL;
UPDATE customers SET phone_digits=NULL WHERE trim(phone)='' AND phone_digits IN ('','0000000000');
