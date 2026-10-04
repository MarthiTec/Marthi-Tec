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
