-- [0035_device_reference_sources.sql]
-- Manufacturer reference data, fetched from its official source; no invented model variants or prices.
CREATE TABLE IF NOT EXISTS device_reference_sources (
  source_url TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- [0036_product_attribute_automation.sql]
ALTER TABLE stores ADD COLUMN IF NOT EXISTS attribute_automation_enabled BOOLEAN NOT NULL DEFAULT true;
CREATE TABLE IF NOT EXISTS product_attribute_templates (
 segment TEXT NOT NULL, name TEXT NOT NULL, values JSONB NOT NULL, sort INTEGER NOT NULL,
 PRIMARY KEY(segment,name)
);
INSERT INTO product_attribute_templates(segment,name,values,sort) VALUES
 ('assistencia_tecnica','Cor','["Preto","Branco","Azul","Verde","Roxo","Rosa","Prata","Dourado","Titânio Natural"]',1),
 ('assistencia_tecnica','Capacidade','["32 GB","64 GB","128 GB","256 GB","512 GB","1 TB","2 TB"]',2),
 ('assistencia_tecnica','Tipo de Retirada','["Em mão","Por encomenda"]',3)
ON CONFLICT DO NOTHING;

-- [0037_segment_attributes.sql]
CREATE TABLE IF NOT EXISTS segment_attribute_templates (
 segment TEXT NOT NULL, template_key TEXT NOT NULL, name TEXT NOT NULL,
 values JSONB NOT NULL, filter_on_totem BOOLEAN NOT NULL DEFAULT false,
 sort INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(segment,template_key)
);
INSERT INTO segment_attribute_templates(segment,template_key,name,values,filter_on_totem,sort)
SELECT segment,CASE name WHEN 'Cor' THEN 'color' WHEN 'Capacidade' THEN 'capacity' ELSE 'pickup' END,name,values,name <> 'Tipo de Retirada',sort FROM product_attribute_templates
ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS store_attribute_provisioning (
 store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
 segment TEXT NOT NULL, template_key TEXT NOT NULL,
 provisioned_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(store_id,segment,template_key)
);
ALTER TABLE product_attributes ADD COLUMN IF NOT EXISTS use_on_pdv BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE product_attributes ADD COLUMN IF NOT EXISTS use_on_external_sale BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE sales_order_lines ADD COLUMN IF NOT EXISTS attributes JSONB NOT NULL DEFAULT '[]';
-- Templates are copied once into independently editable store records.
CREATE OR REPLACE FUNCTION provision_store_attributes(target_store TEXT,target_segment TEXT)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE template RECORD; attr_id TEXT; claimed INTEGER;
BEGIN
 PERFORM id FROM stores WHERE id=target_store FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM stores WHERE id=target_store AND attribute_automation_enabled=true) THEN RETURN; END IF;
 FOR template IN SELECT * FROM segment_attribute_templates WHERE segment=target_segment ORDER BY sort LOOP
  INSERT INTO store_attribute_provisioning(store_id,segment,template_key)
   VALUES(target_store,target_segment,template.template_key) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS claimed = ROW_COUNT;
  IF claimed=0 THEN CONTINUE; END IF;
  SELECT id INTO attr_id FROM product_attributes WHERE store_id=target_store
   AND lower(trim(name))=lower(template.name) ORDER BY id LIMIT 1;
  IF attr_id IS NOT NULL THEN CONTINUE; END IF;
  attr_id := 'ATTR-' || md5(target_store || ':' || target_segment || ':' || template.template_key);
  INSERT INTO product_attributes(id,store_id,name,use_on_totem,filter_on_totem,use_on_stock,use_on_pdv,use_on_external_sale,sort,active)
   VALUES(attr_id,target_store,template.name,true,template.filter_on_totem,true,true,true,template.sort,true);
  INSERT INTO product_attribute_values(id,attribute_id,value,price_delta,sort)
   SELECT 'ATV-' || md5(attr_id || ':' || value),attr_id,value,0,ordinality::integer
    FROM jsonb_array_elements_text(template.values) WITH ORDINALITY;
 END LOOP;
END;
$$;
CREATE OR REPLACE FUNCTION provision_store_segment_attributes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM provision_store_attributes(NEW.id,NEW.segment);
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS store_segment_attributes ON stores;
CREATE TRIGGER store_segment_attributes AFTER INSERT OR UPDATE OF segment ON stores
 FOR EACH ROW EXECUTE FUNCTION provision_store_segment_attributes();
SELECT provision_store_attributes(id,segment) FROM stores;

-- [0038_pickup_methods.sql]
CREATE TABLE pickup_methods(id TEXT PRIMARY KEY,store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,name TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('immediate','order','delivery')),active BOOLEAN NOT NULL DEFAULT true,UNIQUE(store_id,name));
INSERT INTO pickup_methods(id,store_id,name,kind) SELECT 'PICK-'||md5(s.id||v.kind),s.id,v.name,v.kind FROM stores s CROSS JOIN (VALUES('Em mãos','immediate'),('Sob encomenda','order'),('Delivery','delivery')) v(name,kind);
CREATE FUNCTION seed_pickup_methods() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN INSERT INTO pickup_methods(id,store_id,name,kind) SELECT 'PICK-'||md5(NEW.id||v.kind),NEW.id,v.name,v.kind FROM (VALUES('Em mãos','immediate'),('Sob encomenda','order'),('Delivery','delivery'))v(name,kind);RETURN NEW;END;$$;
CREATE TRIGGER seed_store_pickup AFTER INSERT ON stores FOR EACH ROW EXECUTE FUNCTION seed_pickup_methods();
ALTER TABLE stock_items ADD COLUMN pickup_prices JSONB NOT NULL DEFAULT '{}';
CREATE TABLE pickup_requests(id TEXT PRIMARY KEY,store_id TEXT NOT NULL REFERENCES stores(id),method_id TEXT NOT NULL REFERENCES pickup_methods(id),stock_id TEXT NOT NULL REFERENCES stock_items(id),reference_id TEXT NOT NULL,customer_name TEXT NOT NULL,customer_phone TEXT NOT NULL DEFAULT '',address JSONB,price NUMERIC(12,2) NOT NULL,qty INTEGER NOT NULL DEFAULT 1,kind TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('waiting','ready','dispatched','completed','cancelled')),tracking_token TEXT UNIQUE NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
ALTER TABLE sales_order_lines ADD COLUMN pickup_kind TEXT NOT NULL DEFAULT '';
CREATE TABLE legacy_pickup_attributes AS SELECT * FROM product_attributes WHERE lower(name) LIKE '%retirada%';
CREATE TABLE legacy_pickup_values AS SELECT v.* FROM product_attribute_values v JOIN legacy_pickup_attributes a ON a.id=v.attribute_id;
UPDATE stock_items s SET pickup_prices=(SELECT jsonb_object_agg(p.id,CASE WHEN (p.kind='immediate' AND lower(s.attrs->>a.id) IN ('em mão','em mãos','em mao','em maos')) OR (p.kind='order' AND lower(s.attrs->>a.id) IN ('por encomenda','sob encomenda')) OR (p.kind='delivery' AND lower(s.attrs->>a.id)='delivery') THEN to_jsonb(s.price) ELSE 'null'::jsonb END) FROM pickup_methods p WHERE p.store_id=s.store_id)
FROM legacy_pickup_attributes a WHERE a.store_id=s.store_id AND s.attrs ? a.id;
UPDATE stock_items SET attrs=attrs-(SELECT COALESCE(array_agg(id),ARRAY[]::text[]) FROM legacy_pickup_attributes);
DELETE FROM product_attributes WHERE id IN(SELECT id FROM legacy_pickup_attributes);
DELETE FROM product_attribute_templates WHERE lower(name) LIKE '%retirada%';
DELETE FROM segment_attribute_templates WHERE template_key='pickup';

ALTER TABLE pickup_methods ADD COLUMN lead_days JSONB NOT NULL DEFAULT '{"0":1,"1":1,"2":1,"3":1,"4":1,"5":1,"6":2}';
ALTER TABLE pickup_requests ADD COLUMN estimated_date DATE;

ALTER TABLE pos_tickets ADD COLUMN configuration JSONB NOT NULL DEFAULT '{}';

CREATE INDEX pickup_requests_store_history ON pickup_requests(store_id,created_at DESC);
CREATE INDEX pickup_requests_stock_reservations ON pickup_requests(store_id,stock_id,status) WHERE kind='order';
CREATE INDEX pickup_requests_reference ON pickup_requests(store_id,reference_id);
